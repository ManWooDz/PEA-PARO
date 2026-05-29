"""
Load forecasting for Island C.

Served from the precomputed LSTM+Margin forecast (model 18-2) via forecast_store
— the SAME source the dispatch tab uses — so the forecast tab is consistent with
the day-ahead plan and the simulation clock (the CSV begins at the frozen 'now').

All output values are in MW.
"""
from data.forecast_store import get_forecast_series

_STEPS_PER_HOUR = 4   # 15-min steps per hour


def _hourly_from_series(series: list[dict]) -> list[dict]:
    """Aggregate 15-min forecast points → hourly {ts, load_mw, safe_mw}."""
    out: list[dict] = []
    for h in range(len(series) // _STEPS_PER_HOUR):
        w = series[h * _STEPS_PER_HOUR:(h + 1) * _STEPS_PER_HOUR]
        pred = [p["predicted"] for p in w if p.get("predicted") is not None]
        safe = [p["predicted_safe"] for p in w if p.get("predicted_safe") is not None]
        if not pred:
            continue
        mean_pred = sum(pred) / len(pred)
        out.append({
            "ts":      str(w[0]["datetime"]).replace(" ", "T"),
            "load_mw": mean_pred,
            "safe_mw": (sum(safe) / len(safe)) if safe else mean_pred,
        })
    return out


# ── Short-term forecast ───────────────────────────────────────────────────────

def forecast_next_n_hours(n: int = 24, now_hour: int | None = None) -> list[dict]:
    """
    Forecast Island C load for the next n hours from the LSTM forecast CSV.
    Returns list of {ts, load_mw, conf_high, conf_low}. The confidence band is
    the model's calibrated safety margin (one-sided, mirrored for the lower bound).
    """
    hourly = _hourly_from_series(list(get_forecast_series("7day")))[:n]
    results = []
    for hr in hourly:
        load_mw = hr["load_mw"]
        band = max(0.0, hr["safe_mw"] - load_mw)
        results.append({
            "ts":        hr["ts"],
            "load_mw":   round(load_mw, 3),
            "conf_high": round(hr["safe_mw"], 3),
            "conf_low":  round(max(0.0, load_mw - band), 3),
        })
    return results


# ── 7-day daily forecast ──────────────────────────────────────────────────────

def forecast_7_days(now_hour: int | None = None) -> list[dict]:
    """
    7-day daily summary from the LSTM forecast CSV.
    Returns up to 7 items of {date, peak_mw, avg_mw, min_mw}.
    """
    by_date: dict[str, list[float]] = {}
    for p in get_forecast_series("7day"):
        if p.get("predicted") is None:
            continue
        d = str(p["datetime"])[:10]   # "YYYY-MM-DD"
        by_date.setdefault(d, []).append(float(p["predicted"]))

    days = []
    for d in sorted(by_date)[:7]:
        vals = by_date[d]
        days.append({
            "date":    d,
            "peak_mw": round(max(vals), 3),
            "avg_mw":  round(sum(vals) / len(vals), 3),
            "min_mw":  round(min(vals), 3),
        })
    return days


# ── Model metadata ────────────────────────────────────────────────────────────

def model_info() -> dict:
    """
    Real MAE / RMSE of the LSTM forecast vs actual, computed from the forecast CSV
    (actual vs predicted over the test window). Matches the ModelInfo schema.
    """
    errs = [
        abs(float(p["actual"]) - float(p["predicted"]))
        for p in get_forecast_series("7day")
        if p.get("actual") is not None and p.get("predicted") is not None
    ]
    if errs:
        mae_mw  = sum(errs) / len(errs)
        rmse_mw = (sum(e * e for e in errs) / len(errs)) ** 0.5
    else:
        mae_mw, rmse_mw = 0.0, 0.0

    return {
        "name":         "LSTM + Margin (Koh Tao · model 18-2)",
        "mae_mw":       round(mae_mw, 3),
        "rmse_mw":      round(rmse_mw, 3),
        "conf_band_mw": round(rmse_mw * 1.5, 3),
    }
