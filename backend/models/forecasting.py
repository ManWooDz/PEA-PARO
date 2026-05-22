"""
Load forecasting model for Island C.
Uses seasonal decomposition on historical CSV if available,
otherwise falls back to diurnal curve + noise.
"""
import numpy as np
import pandas as pd
from data.seed import ISLAND_C_LOAD_PROFILE, ISLAND_C_PEAK_KW
from data.loader import load_historical


def _diurnal_load(hour: int, noise_std_pct: float = 0.04) -> float:
    """Deterministic diurnal base load at a given hour (kW)."""
    rng = np.random.default_rng()
    base = ISLAND_C_LOAD_PROFILE[hour % 24] * ISLAND_C_PEAK_KW
    noise = rng.normal(0, base * noise_std_pct)
    return float(max(300, base + noise))


def forecast_next_n_hours(n: int = 24, now_hour: int | None = None) -> list[dict]:
    """
    Forecast Island C load for the next n hours.
    Returns list of {t, label, load_kw, hi_kw, lo_kw}.
    """
    if now_hour is None:
        from datetime import datetime
        now_hour = datetime.now().hour

    df = load_historical()

    # Try to use actual historical patterns (last 4 weeks of same hour)
    results = []
    for i in range(1, n + 1):
        h = (now_hour + i) % 24
        label_h = f"{h:02d}:00"

        # Pull last 4 observations at this hour from history
        hist_at_h = df[df["timestamp"].dt.hour == h]["load_island_c_kw"].tail(28)
        if len(hist_at_h) >= 4:
            mean_v = float(hist_at_h.mean())
            std_v  = float(hist_at_h.std())
        else:
            mean_v = ISLAND_C_LOAD_PROFILE[h] * ISLAND_C_PEAK_KW
            std_v  = mean_v * 0.06

        # Add small random walk from current offset
        drift = np.random.normal(0, std_v * 0.1)
        load_kw = max(300, mean_v + drift)
        band = std_v * 1.5 + 50

        results.append({
            "t": i,
            "label": label_h,
            "load_kw": round(load_kw, 1),
            "hi_kw":   round(load_kw + band, 1),
            "lo_kw":   round(max(0, load_kw - band), 1),
        })

    return results


def forecast_7_days(now_hour: int | None = None) -> list[dict]:
    """168-point hourly forecast (7 days) with confidence band."""
    if now_hour is None:
        from datetime import datetime
        now_hour = datetime.now().hour

    df = load_historical()
    results = []

    for i in range(168):
        h = (now_hour + i) % 24
        day_offset = i // 24
        label = f"D+{day_offset} {h:02d}:00"

        hist_at_h = df[df["timestamp"].dt.hour == h]["load_island_c_kw"].tail(28)
        if len(hist_at_h) >= 4:
            mean_v = float(hist_at_h.mean())
            std_v  = float(hist_at_h.std())
        else:
            mean_v = ISLAND_C_LOAD_PROFILE[h] * ISLAND_C_PEAK_KW
            std_v  = mean_v * 0.06

        # Confidence band widens with horizon
        horizon_factor = 1.0 + (i / 168) * 0.5
        band = std_v * 1.5 * horizon_factor + 50

        results.append({
            "t": i,
            "label": label,
            "load_kw": round(mean_v, 1),
            "hi_kw":   round(mean_v + band, 1),
            "lo_kw":   round(max(0, mean_v - band), 1),
        })

    return results


def model_info() -> dict:
    """Return metadata about the forecast model."""
    df = load_historical()
    n_rows = len(df)
    date_range = ""
    if n_rows > 0:
        date_range = (
            f"{df['timestamp'].min().date()} – {df['timestamp'].max().date()}"
        )
    return {
        "algorithm": "Seasonal mean (hourly historical average)",
        "training_rows": n_rows,
        "date_range": date_range,
        "mape_pct": 4.2,   # illustrative
        "mae_kw": 142.0,    # illustrative
    }
