"""
backend/ml/predictor.py
LSTM inference wrapper for Island C (Koh Tao) 24-hour load forecasting.

Design decisions:
  - LSTM-only  (Prophet weight w2=0 in all trained models → not loaded)
  - Weather    : fetched from Open-Meteo archive for the exact timestamps in
                 the load data, cached in artifacts/weather_cache.csv
  - Safety margin applied to every forecast (margin_24h / margin_6h from
                 ensemble_weights.json, calibrated on val set)
  - Singleton  : model artifacts loaded once on first call

Artifacts (copy after Colab training):
  backend/ml/artifacts/
    lstm_island_c.keras      – trained LSTM
    scaler.pkl               – MinMaxScaler fit on train set only
    ensemble_weights.json    – w1, w2, safety_margin_24h, safety_margin_6h
    feature_cols.json        – ordered list of 15 feature column names
"""

import json
import logging
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
_BACKEND_DIR  = Path(__file__).parent.parent           # backend/
_ML_SRC       = _BACKEND_DIR.parent / "ml" / "prophet_lstm"
ARTIFACTS_DIR = Path(__file__).parent / "artifacts"
WEATHER_CACHE = ARTIFACTS_DIR / "weather_cache.csv"

# ── Constants ─────────────────────────────────────────────────────────────────
_LAT, _LON = 10.10, 99.84          # Koh Tao coordinates
_TZ        = "Asia/Bangkok"
_WEATHER_COLS = [
    "temperature_2m", "relativehumidity_2m", "windspeed_10m", "precipitation"
]

LOOKBACK = 96    # 24 h at 15-min resolution (Round 16: reverted from 192, too few samples)
HORIZON  = 96    # forecast 24 h ahead

# Dry-season fallback constants (Jan–Feb, used only when API unreachable)
_WEATHER_FALLBACK = {
    "temperature_2m":      28.5,
    "relativehumidity_2m": 75.0,
    "windspeed_10m":        8.0,
    "precipitation":        0.1,
}

# ── Singleton ─────────────────────────────────────────────────────────────────
_predictor: "_Predictor | None" = None


def _get_predictor() -> "_Predictor":
    global _predictor
    if _predictor is None:
        _predictor = _Predictor(ARTIFACTS_DIR)
    return _predictor


# ── Weather helpers ───────────────────────────────────────────────────────────

def _fetch_weather_api(start_date: str, end_date: str) -> pd.DataFrame:
    """Call Open-Meteo archive API and return 15-min DataFrame."""
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude":   _LAT,
        "longitude":  _LON,
        "start_date": start_date,
        "end_date":   end_date,
        "hourly":     ",".join(_WEATHER_COLS),
        "timezone":   _TZ,
    }
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    hourly = resp.json()["hourly"]
    df = pd.DataFrame(
        {col: hourly[col] for col in _WEATHER_COLS},
        index=pd.to_datetime(hourly["time"]),
    )
    df.index.name = "datetime"
    return df.resample("15min").ffill()


def _get_weather_for_index(idx: pd.DatetimeIndex) -> pd.DataFrame:
    """
    Return weather DataFrame aligned to idx.
    Strategy:
      1. Load weather_cache.csv if it covers the needed range.
      2. Fetch missing dates from Open-Meteo archive and append to cache.
      3. Fall back to dry-season constants if API unreachable.
    """
    start_ts = idx.min()
    end_ts   = idx.max()

    # --- Load existing cache ---
    cached: pd.DataFrame | None = None
    if WEATHER_CACHE.exists():
        try:
            cached = pd.read_csv(
                WEATHER_CACHE, parse_dates=["datetime"], index_col="datetime"
            )
        except Exception as exc:
            logger.warning(f"[predictor] Weather cache unreadable: {exc}")
            cached = None

    # Check coverage
    if cached is not None:
        covered = (cached.index.min() <= start_ts) and (cached.index.max() >= end_ts)
        if covered:
            return _align_weather(cached, idx)

    # --- Determine date range to fetch ---
    start_str = (start_ts - pd.Timedelta(days=1)).date().isoformat()
    end_str   = (end_ts   + pd.Timedelta(days=1)).date().isoformat()

    logger.info(f"[predictor] Fetching weather {start_str} → {end_str} from Open-Meteo")
    try:
        fresh = _fetch_weather_api(start_str, end_str)
        # Merge with existing cache to avoid re-downloading old data
        if cached is not None:
            merged = pd.concat([cached, fresh]).sort_index()
            merged = merged[~merged.index.duplicated(keep="last")]
        else:
            merged = fresh
        merged.to_csv(WEATHER_CACHE)
        logger.info(f"[predictor] Weather cache updated ({len(merged)} rows)")
        return _align_weather(merged, idx)
    except Exception as exc:
        logger.error(f"[predictor] Open-Meteo fetch failed: {exc} — using fallback")
        return _weather_fallback(idx)


def _align_weather(weather_df: pd.DataFrame, idx: pd.DatetimeIndex) -> pd.DataFrame:
    """Reindex weather to match load index; forward-fill gaps up to 2 hours."""
    aligned = weather_df.reindex(idx, method="nearest", tolerance="30min")
    # Forward-fill remaining NaNs (e.g., at boundaries)
    aligned = aligned.ffill().bfill()
    # Any column still missing: use fallback constant
    for col, val in _WEATHER_FALLBACK.items():
        if col in aligned.columns:
            aligned[col] = aligned[col].fillna(val)
        else:
            aligned[col] = val
    return aligned[_WEATHER_COLS]


def _weather_fallback(idx: pd.DatetimeIndex) -> pd.DataFrame:
    """Return constant dry-season weather for all timestamps in idx."""
    return pd.DataFrame(_WEATHER_FALLBACK, index=idx)


# ── Main predictor class ──────────────────────────────────────────────────────

class _Predictor:
    def __init__(self, artifacts_dir: Path):
        _require_file(artifacts_dir / "lstm_island_c.keras")
        _require_file(artifacts_dir / "scaler.pkl")
        _require_file(artifacts_dir / "ensemble_weights.json")
        _require_file(artifacts_dir / "feature_cols.json")

        logger.info(f"[predictor] Loading LSTM from {artifacts_dir / 'lstm_island_c.keras'}")
        self.lstm = _load_lstm_weights(artifacts_dir / "lstm_island_c.keras")

        with open(artifacts_dir / "scaler.pkl", "rb") as f:
            self.scaler = pickle.load(f)

        with open(artifacts_dir / "ensemble_weights.json") as f:
            w = json.load(f)
        self.w1             = float(w["w1"])
        self.w2             = float(w["w2"])
        self.margin_6h      = float(w.get("safety_margin_6h",      0.0))
        self.margin_6h_24h  = float(w.get("safety_margin_6h_24h",  # Round 16.7: per-band
                              w.get("safety_margin_24h",  0.0)))    # fallback to old key
        self.margin_24h     = self.margin_6h_24h   # backward compat alias

        with open(artifacts_dir / "feature_cols.json") as f:
            self.feature_cols: list[str] = json.load(f)

        self.n_features = len(self.feature_cols)  # 16 as of Round 16

        logger.info(
            f"[predictor] Ready — w1={self.w1:.3f} w2={self.w2:.3f} "
            f"margin_6h=+{self.margin_6h:.3f} MW  "
            f"margin_6h_24h=+{self.margin_6h_24h:.3f} MW  (Round 16.7 per-band)"
        )

    # ── Public method ─────────────────────────────────────────────────────────

    def predict(
        self,
        load_df: pd.DataFrame,
        horizon: str = "24h",
    ) -> list[dict]:
        """
        Forecast Island C load for the next 24h or 6h.

        Args:
            load_df : DataFrame with DatetimeIndex (15-min) and column
                      'load_c' or 'load_c_mw' (MW).  Must have ≥ 768 rows
                      (7 days) so lag_672 can be computed.
            horizon : '24h' (96 steps, default) or '6h' (24 steps).

        Returns:
            list of dicts:
              { 'datetime': ISO str, 'load_mw': float, 'load_mw_safe': float }
            Length = 96 (24h) or 24 (6h).
        """
        H = 96 if horizon == "24h" else 24

        # 1. Build full feature matrix
        df = self._build_features(load_df)

        if len(df) < LOOKBACK:
            raise ValueError(
                f"[predictor] Need ≥ {LOOKBACK} rows after feature engineering; "
                f"got {len(df)}.  Provide more history (≥ 768 rows)."
            )

        # 2. Scale last LOOKBACK rows → (1, LOOKBACK, n_features)
        tail96   = df[self.feature_cols].tail(LOOKBACK).values.astype("float32")
        X_scaled = self.scaler.transform(tail96)               # (LOOKBACK, n_features)
        X_in     = X_scaled.reshape(1, LOOKBACK, self.n_features)  # (1, LOOKBACK, n_features)

        # 3. LSTM inference
        y_scaled = self.lstm.predict(X_in, verbose=0)          # (1, 96)

        # 4. Inverse-transform (load_c is column 0)
        dummy       = np.zeros((HORIZON, self.n_features), dtype="float32")
        dummy[:, 0] = y_scaled.flatten()
        y_mw        = self.scaler.inverse_transform(dummy)[:, 0]   # (96,) MW

        # 5. Post-process
        y_mw = np.maximum(y_mw, 0.0)            # no negative load
        # Round 16.7: per-band safety margin
        #   steps  0-23 (0-6h)  → margin_6h       (smaller, well-calibrated)
        #   steps 24-95 (6-24h) → margin_6h_24h   (larger, calibrated on 6-24h val residuals)
        if horizon == "24h":
            _H6 = 24
            y_safe = np.concatenate([
                y_mw[:_H6] + self.margin_6h,
                y_mw[_H6:] + self.margin_6h_24h,
            ])
        else:
            y_safe = y_mw + self.margin_6h

        # 6. Build output timestamps (immediately after last known timestamp)
        last_ts  = df.index[-1]
        fut_idx  = pd.date_range(
            last_ts + pd.Timedelta("15min"), periods=H, freq="15min"
        )

        return [
            {
                "datetime":     ts.isoformat(),
                "load_mw":      round(float(y_mw[i]),   3),
                "load_mw_safe": round(float(y_safe[i]), 3),
            }
            for i, ts in enumerate(fut_idx)
        ]

    # ── Private helpers ───────────────────────────────────────────────────────

    def _build_features(self, load_df: pd.DataFrame) -> pd.DataFrame:
        """
        Merge load + weather, then compute temporal & lag features.
        Returns DataFrame with self.feature_cols columns, NaN rows dropped.
        """
        # Ensure src/ is importable
        ml_src = str(_ML_SRC)
        if ml_src not in sys.path:
            sys.path.insert(0, ml_src)
        from src.preprocess import add_temporal_features  # type: ignore

        df = load_df.copy()

        # Normalise load column name
        if "load_c_mw" in df.columns and "load_c" not in df.columns:
            df = df.rename(columns={"load_c_mw": "load_c"})
        if "load_c" not in df.columns:
            raise ValueError(
                "[predictor] Input DataFrame must have column 'load_c' or 'load_c_mw'."
            )

        # Keep only the load column for now; other columns added below
        df = df[["load_c"]].copy()

        # Fetch weather aligned to df's index
        weather = _get_weather_for_index(df.index)
        df = df.join(weather, how="left")

        # Add temporal + lag features (uses src/preprocess.py)
        df = add_temporal_features(df)

        # Drop rows where lag features are NaN (first 672 rows)
        df = df.dropna(subset=self.feature_cols)

        return df


# ── Module-level public functions (used by routers) ───────────────────────────

def predict(
    load_df: pd.DataFrame | None = None,
    horizon: str = "24h",
) -> list[dict]:
    """
    High-level entry point used by POST /api/forecast-dispatch.

    If load_df is None, loads from load_historical() automatically and
    uses the most recent 800 rows (covers 7-day lag + lookback).

    Returns list of forecast dicts: {datetime, load_mw, load_mw_safe}
    """
    if load_df is None:
        from data.loader import load_historical  # local import — avoids circular dep
        df_hist = load_historical()
        # load_historical returns timestamp as a column; set it as DatetimeIndex
        df_hist = df_hist.set_index("timestamp").sort_index()
        load_df = df_hist[["load_c_mw"]].tail(800)  # covers lag_672 (672) + LOOKBACK (96) + buffer

    return _get_predictor().predict(load_df, horizon=horizon)


def predict_next_24h(recent_df: pd.DataFrame) -> list[dict]:
    """
    Compatibility shim for ml_forecast.py router (legacy signature).
    recent_df must already have temporal features computed.
    """
    return _get_predictor().predict(recent_df, horizon="24h")


# ── Utilities ─────────────────────────────────────────────────────────────────

def _require_file(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(
            f"Required artifact not found: {path}\n"
            "  → Train on Colab, download pea_model_artifacts.zip, "
            "extract to backend/ml/artifacts/"
        )


def _load_lstm_weights(keras_path: Path) -> "tf.keras.Model":
    """
    Load LSTM model weights without relying on the saved Keras config.

    The .keras file is a ZIP containing config.json + model.weights.h5.
    If the config was saved with a newer Keras than what's installed locally
    (e.g. Keras 3.13 saved vs 3.9 local), direct load_model() fails with a
    deserialization error.

    Workaround: rebuild the exact architecture from source code, then load
    weights directly from the .h5 file inside the ZIP.  This is version-safe
    because it never touches config.json.
    """
    import zipfile
    import tempfile
    import tensorflow as tf  # noqa: F811 — deferred import

    # Ensure ml/prophet_lstm/src is importable
    ml_src = str(_ML_SRC)
    if ml_src not in sys.path:
        sys.path.insert(0, ml_src)
    from src.lstm_model import build_lstm  # type: ignore

    # 1. Rebuild identical architecture from source
    # n_features is read dynamically from feature_cols.json so this stays correct
    # after retraining with a different feature set (e.g. Round 15: 15 → 17).
    _feature_cols_path = keras_path.parent / "feature_cols.json"
    with open(_feature_cols_path) as _f:
        _n_features = len(json.load(_f))
    model = build_lstm(n_features=_n_features, lookback=LOOKBACK, horizon=HORIZON, dropout=0.3)
    model.compile(optimizer="adam", loss="mse")   # required before load_weights

    # 2. Extract model.weights.h5 from the .keras ZIP and load
    with tempfile.TemporaryDirectory() as tmp_dir:
        with zipfile.ZipFile(keras_path, "r") as zf:
            if "model.weights.h5" not in zf.namelist():
                raise FileNotFoundError(
                    f"'model.weights.h5' not found inside {keras_path}. "
                    f"Contents: {zf.namelist()}"
                )
            zf.extract("model.weights.h5", tmp_dir)
        weights_path = Path(tmp_dir) / "model.weights.h5"
        model.load_weights(str(weights_path))
        logger.info(
            f"[predictor] LSTM weights loaded via ZIP extraction "
            f"(version-safe workaround for Keras config mismatch)"
        )

    return model
