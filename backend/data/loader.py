"""
CSV data loader for Historical_load.csv.
Falls back to synthetic diurnal data if CSV is not found.
"""
import os
import numpy as np
import pandas as pd
from pathlib import Path
from data.seed import (
    ISLAND_C_LOAD_PROFILE, ISLAND_C_PEAK_KW,
    ISLAND_A_LOAD_PROFILE, ISLAND_A_PEAK_KW,
)

CSV_PATH = Path(__file__).parent.parent / "Historical_load.csv"

# ── Module-level cache populated at startup ───────────────────────────────────
_df: pd.DataFrame | None = None


def load_historical() -> pd.DataFrame:
    """Load CSV or synthesise 1-year hourly data if CSV absent."""
    global _df
    if _df is not None:
        return _df

    if CSV_PATH.exists():
        try:
            raw = pd.read_csv(CSV_PATH, parse_dates=["timestamp"])
            raw = raw.sort_values("timestamp").reset_index(drop=True)
            _df = raw
            print(f"[loader] Loaded {len(_df)} rows from {CSV_PATH.name}")
            return _df
        except Exception as e:
            print(f"[loader] CSV parse error: {e} — falling back to synthetic data")

    # ── Synthesise 1 year of hourly data ─────────────────────────────────────
    print("[loader] CSV not found — generating synthetic historical data")
    rng = np.random.default_rng(42)
    hours = pd.date_range("2025-05-01", periods=8760, freq="h")
    records = []
    for ts in hours:
        h = ts.hour
        dow = ts.dayofweek  # 0=Mon
        # Island C load
        base_c = ISLAND_C_LOAD_PROFILE[h] * ISLAND_C_PEAK_KW
        noise_c = rng.normal(0, base_c * 0.04)
        season = 1.0 + 0.10 * np.sin(2 * np.pi * ts.dayofyear / 365)  # seasonal swing
        load_c = max(500, base_c * season + noise_c)

        # Island A load (larger)
        base_a = ISLAND_A_LOAD_PROFILE[h] * ISLAND_A_PEAK_KW
        noise_a = rng.normal(0, base_a * 0.03)
        load_a = max(1000, base_a * season + noise_a)

        # Line 6 flow ≈ Island C load (simplified)
        line6 = min(load_c, 8000)

        records.append({
            "timestamp": ts,
            "load_island_c_kw": round(load_c, 1),
            "load_island_a_kw": round(load_a, 1),
            "line6_flow_kw":    round(line6, 1),
            "battery_soc_pct":  round(rng.uniform(30, 80), 1),
            "diesel9_kw":       0.0,
            "diesel8_kw":       0.0,
        })

    _df = pd.DataFrame(records)
    return _df


def get_recent_load_c(n_hours: int = 24) -> list[dict]:
    """Return last n_hours of Island C load as list of dicts."""
    df = load_historical()
    tail = df.tail(n_hours)[["timestamp", "load_island_c_kw"]].copy()
    tail["hour"] = tail["timestamp"].dt.hour
    return tail[["hour", "load_island_c_kw"]].rename(
        columns={"load_island_c_kw": "load_kw"}
    ).to_dict("records")
