"""
Real CSV loader — reads both Historical_Load CSVs from docs/data/,
merges them, normalises column names to MW units, and computes battery SoC.
Falls back to synthetic data if the files are absent.
"""
import random
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta

from data.seed import ISLAND_C_LOAD_PROFILE, ISLAND_C_PEAK_KW

# ── Path resolution ───────────────────────────────────────────────────────────
_BACKEND_DIR = Path(__file__).parent.parent          # backend/
_DOCS_DATA   = _BACKEND_DIR.parent / "docs" / "data" # project_root/docs/data/

CSV1 = _DOCS_DATA / "Historical_Load_jan-jun25.csv"
CSV2 = _DOCS_DATA / "Historical_Load_jul25-feb26.csv"

BAT_CAPACITY_MWH = 30.0
SOC_START_MWH    = 18.0   # 60 % initial SoC

# ── Column rename map ─────────────────────────────────────────────────────────
_COL_MAP = {
    "1 (115kV)":    "line1_mw",
    "2 (115kV)":    "line2_mw",
    "3 (33kV)":     "line3_mw",
    "4 (115kV)":    "line4_mw",
    "5 (33kV)":     "line5_mw",
    "6 (33kV)":     "line6_mw",
    "7 (Battery A)":"battery_mw",
    "8 (Diesel A)": "diesel_a_mw",
    "9 (Diesel C)": "diesel_c_mw",
    "Load A":       "load_a_mw",
    "Load B":       "load_b_mw",
    "Load C":       "load_c_mw",
}

# ── Module-level caches ───────────────────────────────────────────────────────
_df: pd.DataFrame | None = None        # 15-min granularity
_df_hourly: pd.DataFrame | None = None # hourly aggregated


# ── Private helpers ───────────────────────────────────────────────────────────

def _read_one_csv(path: Path) -> pd.DataFrame:
    """Parse a single historical CSV file."""
    # Skip trailing empty header columns
    df = pd.read_csv(path, usecols=lambda c: not str(c).startswith("Unnamed"))
    # Parse datetime — the CSV uses mixed formats: "1/1/2025 00:00" and
    # occasionally "31/3/2025, 23:30" (comma before time at month boundaries).
    # format='mixed' with dayfirst handles both gracefully.
    df["timestamp"] = pd.to_datetime(df["Date"], dayfirst=True, format="mixed")
    df = df.drop(columns=["Date", "Time"], errors="ignore")
    # Rename to standard MW column names
    df = df.rename(columns={k: v for k, v in _COL_MAP.items() if k in df.columns})
    # Coerce all data columns to numeric
    for col in df.columns:
        if col != "timestamp":
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _compute_soc(df: pd.DataFrame) -> pd.DataFrame:
    """
    Integrate battery_mw (15-min intervals) to compute SoC.
    Positive battery_mw = discharging  → SoC decreases.
    Negative battery_mw = charging     → SoC increases.
    """
    df = df.copy()
    battery = df["battery_mw"].fillna(0).values
    soc = np.empty(len(df))
    cur = SOC_START_MWH
    for i, b in enumerate(battery):
        cur = float(np.clip(cur - b * 0.25, 0.0, BAT_CAPACITY_MWH))
        soc[i] = cur
    df["soc_mwh"] = np.round(soc, 2)
    df["soc_pct"]  = np.round(soc / BAT_CAPACITY_MWH * 100, 1)
    return df


def _make_synthetic() -> pd.DataFrame:
    """Fallback: synthesise 1 year of 15-min data."""
    print("[loader] Generating synthetic fallback data")
    rng = np.random.default_rng(42)
    ts = pd.date_range("2025-01-01", periods=8760 * 4, freq="15min")
    rows = []
    for t in ts:
        h   = t.hour
        base = ISLAND_C_LOAD_PROFILE[h] * ISLAND_C_PEAK_KW / 1000  # kW → MW
        lc   = float(max(0.5, base + rng.normal(0, base * 0.05)))
        rows.append({
            "timestamp":  t,
            "load_c_mw":  round(lc, 2),
            "load_a_mw":  round(lc * 15 + rng.normal(0, 1), 2),
            "load_b_mw":  round(lc * 3  + rng.normal(0, 0.2), 2),
            "line1_mw":   round(lc * 7,    2),
            "line2_mw":   round(lc * 5,    2),
            "line3_mw":   round(lc * 2,    2),
            "line4_mw":   round(lc * 3,    2),
            "line5_mw":   round(lc * 0.8,  2),
            "line6_mw":   round(lc * 0.95, 2),
            "battery_mw": round(float(rng.uniform(-3, 3)), 2),
            "diesel_a_mw":0.0,
            "diesel_c_mw":round(float(max(0, rng.normal(1.5, 0.5))), 2),
        })
    df = pd.DataFrame(rows)
    return _compute_soc(df)


# ── Public API ────────────────────────────────────────────────────────────────

def load_historical() -> pd.DataFrame:
    """Return the full 15-min historical DataFrame (cached after first call)."""
    global _df
    if _df is not None:
        return _df

    frames = []
    for path in [CSV1, CSV2]:
        if path.exists():
            try:
                frames.append(_read_one_csv(path))
                print(f"[loader] Loaded {path.name}")
            except Exception as exc:
                print(f"[loader] Failed to read {path.name}: {exc}")

    if not frames:
        _df = _make_synthetic()
        return _df

    df = pd.concat(frames, ignore_index=True).sort_values("timestamp").reset_index(drop=True)

    # Fill missing Line 6 (Jan–Jun 2025) with Load C − Diesel C
    if "line6_mw" not in df.columns:
        df["line6_mw"] = np.nan
    mask = df["line6_mw"].isna()
    if mask.any() and "load_c_mw" in df.columns:
        df.loc[mask, "line6_mw"] = (
            df.loc[mask, "load_c_mw"] - df.loc[mask, "diesel_c_mw"].fillna(0)
        ).clip(lower=0)

    df = _compute_soc(df)
    _df = df
    print(f"[loader] Total {len(_df)} rows | "
          f"{_df['timestamp'].min().date()} to {_df['timestamp'].max().date()}")
    return _df


def load_hourly() -> pd.DataFrame:
    """Return hourly-aggregated DataFrame (mean of 4 × 15-min per hour)."""
    global _df_hourly
    if _df_hourly is not None:
        return _df_hourly

    df = load_historical()
    df2 = df.copy()
    df2["hour_ts"] = df2["timestamp"].dt.floor("h")

    agg_cols = [c for c in df2.columns if c not in ("timestamp", "hour_ts")]
    # For SoC use the last value in the hour (end-of-hour state)
    soc_cols = ["soc_mwh", "soc_pct"]
    mean_cols = [c for c in agg_cols if c not in soc_cols]

    agg = df2.groupby("hour_ts").agg(
        {**{c: "mean" for c in mean_cols},
         **{c: "last" for c in soc_cols if c in df2.columns}}
    ).reset_index().rename(columns={"hour_ts": "timestamp"})

    _df_hourly = agg
    return _df_hourly


def get_current_state() -> dict:
    """
    Simulate a 'live' reading by averaging same hour-of-day values
    from the last 30 days of data, then adding a tiny random jitter.
    """
    df = load_historical()
    now_h = datetime.now().hour
    max_ts = df["timestamp"].max()
    cutoff = max_ts - pd.Timedelta(days=30)
    recent = df[df["timestamp"] >= cutoff]
    at_h = recent[recent["timestamp"].dt.hour == now_h]
    if len(at_h) == 0:
        at_h = df[df["timestamp"].dt.hour == now_h]

    m = at_h.mean(numeric_only=True)

    def j(col: str, default: float, pct: float = 0.03) -> float:
        v = float(m.get(col, default))
        if pd.isna(v):
            v = default
        return float(max(0.0, v + random.gauss(0, abs(v) * pct + 0.01)))

    soc_mwh = float(np.clip(
        float(m.get("soc_mwh", SOC_START_MWH)) + random.gauss(0, 0.2),
        0.0, BAT_CAPACITY_MWH
    ))

    return {
        "load_c_mw":   round(max(0.5, j("load_c_mw", 2.5)),  2),
        "load_a_mw":   round(max(1.0, j("load_a_mw", 40.0)), 2),
        "load_b_mw":   round(max(0.5, j("load_b_mw", 9.0)),  2),
        "line1_mw":    round(max(0.0, j("line1_mw",  20.0)), 2),
        "line2_mw":    round(max(0.0, j("line2_mw",  15.0)), 2),
        "line3_mw":    round(max(0.0, j("line3_mw",   6.0)), 2),
        "line4_mw":    round(max(0.0, j("line4_mw",   7.0)), 2),
        "line5_mw":    round(max(0.0, j("line5_mw",   2.0)), 2),
        "line6_mw":    round(max(0.0, j("line6_mw",   1.5, pct=0.05)), 2),
        "battery_mw":  round(float(m.get("battery_mw", 0.0)) + random.gauss(0, 0.15), 2),
        "diesel_a_mw": round(max(0.0, j("diesel_a_mw", 0.0)), 2),
        "diesel_c_mw": round(max(0.0, j("diesel_c_mw", 2.0)), 2),
        "soc_mwh":     round(soc_mwh, 2),
        "soc_pct":     round(soc_mwh / BAT_CAPACITY_MWH * 100, 1),
    }


def get_recent_24h_hourly() -> list[dict]:
    """
    Return last 24 hours of historical data (hourly), time-shifted to today.
    Used by the /load-history endpoint.
    """
    df_h = load_hourly()
    last24 = df_h.tail(24).copy()
    if last24.empty:
        return []

    # Time-shift so that the last point aligns to the current hour
    now_h = datetime.now().replace(minute=0, second=0, microsecond=0)
    last_ts = last24["timestamp"].iloc[-1]
    offset = now_h - last_ts

    records = []
    for _, row in last24.iterrows():
        shifted = row["timestamp"] + offset
        records.append({
            "ts":   shifted.strftime("%Y-%m-%dT%H:%M:%S"),
            "hour": shifted.hour,
            "load_mw":  round(float(row.get("load_c_mw", 0)), 2),
        })
    return records


def get_recent_12h_mix() -> list[dict]:
    """
    Return last 12 hours of energy mix data (hourly), time-shifted to today.
    Used by the /energy-mix endpoint.
    """
    df_h = load_hourly()
    last12 = df_h.tail(12).copy()
    if last12.empty:
        return []

    now_h = datetime.now().replace(minute=0, second=0, microsecond=0)
    last_ts = last12["timestamp"].iloc[-1]
    offset = now_h - last_ts

    records = []
    for _, row in last12.iterrows():
        shifted = row["timestamp"] + offset
        # battery positive = discharging (supply), negative = charging (demand)
        bat = float(row.get("battery_mw", 0))
        bat_supply = max(0.0, bat)
        load_c = float(row.get("load_c_mw", 0))
        d_a    = float(row.get("diesel_a_mw", 0))
        d_c    = float(row.get("diesel_c_mw", 0))
        line6  = float(row.get("line6_mw", 0))
        # Grid = what comes through Line 6 minus battery and diesel local supply
        grid   = max(0.0, line6)

        records.append({
            "ts":          shifted.strftime("%Y-%m-%dT%H:%M:%S"),
            "grid_mw":     round(grid,      2),
            "battery_mw":  round(bat_supply, 2),
            "diesel_a_mw": round(d_a,        2),
            "diesel_c_mw": round(d_c,        2),
        })
    return records


def get_hourly_profile_for_c() -> dict[int, dict]:
    """
    Return per-hour statistics for Island C load (used by forecasting).
    Returns {hour: {mean_mw, std_mw}}.
    """
    df = load_historical()
    df2 = df.copy()
    df2["h"] = df2["timestamp"].dt.hour
    grp = df2.groupby("h")["load_c_mw"].agg(["mean", "std"]).fillna(0)
    return {
        int(h): {"mean_mw": round(float(row["mean"]), 3),
                 "std_mw":  round(float(row["std"]),  3)}
        for h, row in grp.iterrows()
    }
