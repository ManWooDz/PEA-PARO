"""
Forecast regeneration pipeline (Island C).

Re-run the trained Island C LSTM over a new historical dataset to rebuild the forecast
CSVs the app serves, via a clean rolling backtest reusing the team's own helpers
(ml/prophet_lstm/src). Requires TensorFlow + backend/ml/artifacts/C/.

Island C only for now (Phase 2a). See
docs/superpowers/specs/2026-06-04-poc-alignment-design.md (Component 2).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from ml.predictor import _get_predictor, LOOKBACK, HORIZON

_ML_SRC = Path(__file__).resolve().parent.parent.parent / "ml" / "prophet_lstm"
_FORECAST_DIR = Path(__file__).resolve().parent.parent / "data" / "forecasts"

_H6 = 24   # 6 h in 15-min steps


def _src():
    s = str(_ML_SRC)
    if s not in sys.path:
        sys.path.insert(0, s)
    from src.preprocess import make_sequences          # type: ignore
    from src.lstm_model import predict_lstm             # type: ignore
    return make_sequences, predict_lstm


def _mape_arr(actual: np.ndarray, pred: np.ndarray) -> float:
    m = actual > 0
    if not m.any():
        return 0.0
    return float(np.mean(np.abs(actual[m] - pred[m]) / actual[m]) * 100.0)


def _normalise_load_c(load_df: pd.DataFrame) -> pd.DataFrame:
    if "load_c_mw" in load_df.columns and "load_c" not in load_df.columns:
        return load_df.rename(columns={"load_c_mw": "load_c"})
    return load_df


def backtest_island(load_df: pd.DataFrame, island: str = "C") -> dict:
    """Batched sliding-window backtest for Island C. load_df: DatetimeIndex (15-min)
    with a 'load_c' or 'load_c_mw' column. Returns {'6h': {...}, '7day': {...}} where
    each value is {'frame': DataFrame(app CSV cols), 'mape_pct': float, 'n': int}."""
    if island != "C":
        raise NotImplementedError("Phase 2a supports Island C only.")
    make_sequences, predict_lstm = _src()
    pred = _get_predictor()

    df = pred._build_features(_normalise_load_c(load_df))
    if len(df) < LOOKBACK + HORIZON:
        raise ValueError(f"[pipeline] Need >= {LOOKBACK + HORIZON} usable rows after "
                         f"feature engineering; got {len(df)}.")

    scaled = pred.scaler.transform(df[pred.feature_cols].values.astype("float32"))
    X, y = make_sequences(scaled, LOOKBACK, HORIZON)        # X:(n,96,F) y:(n,96)
    y_pred = predict_lstm(pred.lstm, X, pred.scaler)        # (n,96) MW
    dummy = np.zeros((y.size, pred.n_features), dtype="float32")
    dummy[:, 0] = y.flatten()
    y_true = pred.scaler.inverse_transform(dummy)[:, 0].reshape(y.shape)  # (n,96)
    y_pred = np.maximum(y_pred, 0.0)

    win_index = df.index[LOOKBACK: LOOKBACK + len(y_pred)]
    return {
        "6h":   _slice_blocks(win_index, y_true, y_pred, pred.margin_6h, _H6),
        "7day": _slice_blocks(win_index, y_true, y_pred, pred.margin_6h_24h, HORIZON),
    }


def _slice_blocks(win_index, y_true, y_pred, margin, block) -> dict:
    """Non-overlapping `block`-step rolling backtest (clean; 6h uses 24-step blocks,
    7day uses 96-step blocks)."""
    n_blocks = len(y_pred) // block
    if n_blocks == 0:                                       # short series → first window
        idx = win_index[:block]
        return _frame(idx, y_true[0][:block], y_pred[0][:block], margin)
    idx  = win_index[: n_blocks * block]
    true = np.concatenate([y_true[i * block, :block] for i in range(n_blocks)])
    pred = np.concatenate([y_pred[i * block, :block] for i in range(n_blocks)])
    return _frame(idx, true, pred, margin)


def _frame(idx, true, pred, margin) -> dict:
    safe = pred + float(margin)
    frame = pd.DataFrame({
        "datetime":    [t.strftime("%Y-%m-%d %H:%M:%S") for t in idx],
        "actual":      np.round(true, 4),
        "lstm":        np.round(pred, 6),
        "lstm_margin": np.round(safe, 6),
        "hybrid":      np.round(pred, 6),     # w2=0 → hybrid == lstm
        "prophet":     np.round(pred, 6),     # unused by the app; mirror lstm
    })
    return {"frame": frame, "mape_pct": round(_mape_arr(true, pred), 2), "n": len(frame)}


def generate_forecasts(historical_df: pd.DataFrame, out_dir: Path = _FORECAST_DIR) -> dict:
    """Regenerate Island C's forecast_{6h,7day}.csv from a historical dataframe
    (DatetimeIndex 15-min, 'load_c' or 'load_c_mw' column). Writes the CSVs and returns
    {'C': {'6h': mape, '7day': mape}}."""
    col = "load_c" if "load_c" in historical_df.columns else "load_c_mw"
    df = historical_df[[col]].copy()
    res = backtest_island(df, "C")
    dest = out_dir / "C"
    dest.mkdir(parents=True, exist_ok=True)
    res["6h"]["frame"].to_csv(dest / "forecast_6h.csv", index=False)
    res["7day"]["frame"].to_csv(dest / "forecast_7day.csv", index=False)
    return {"C": {"6h": res["6h"]["mape_pct"], "7day": res["7day"]["mape_pct"]}}
