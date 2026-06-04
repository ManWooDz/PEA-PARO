"""
Serve precomputed LSTM forecast series from CSV, per island.

Columns in CSV: datetime, actual, lstm, lstm_margin, hybrid, prophet
We expose:  datetime, actual, predicted (=lstm), predicted_safe (=lstm_margin)

Files live in backend/data/forecasts/<ISLAND>/forecast_<horizon>.csv.
"""
from functools import lru_cache
from pathlib import Path
import csv
import math

_FORECAST_DIR = Path(__file__).parent / "forecasts"
_HORIZONS: frozenset[str] = frozenset({"7day", "6h"})
_ISLANDS:  frozenset[str] = frozenset({"A", "B", "C"})


@lru_cache(maxsize=12)
def get_forecast_series(horizon: str, island: str = "C") -> tuple[dict, ...]:
    """Return the forecast series for (horizon, island).

    horizon in {'7day','6h'}; island in {'A','B','C'} (default 'C').
    Each point: {datetime, actual, predicted, predicted_safe} (MW).
    Raises ValueError for bad args, FileNotFoundError if the CSV is missing.
    """
    if horizon not in _HORIZONS:
        raise ValueError(f"Unknown horizon '{horizon}'. Valid: {sorted(_HORIZONS)}")
    if island not in _ISLANDS:
        raise ValueError(f"Unknown island '{island}'. Valid: {sorted(_ISLANDS)}")
    path = _FORECAST_DIR / island / f"forecast_{horizon}.csv"
    if not path.exists():
        raise FileNotFoundError(f"Forecast CSV not found: {path}")

    out: list[dict] = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out.append({
                "datetime":       row["datetime"],
                "actual":         _to_float(row.get("actual")),
                "predicted":      _to_float(row.get("lstm")),
                "predicted_safe": _to_float(row.get("lstm_margin")),
            })
    return tuple(out)


def _to_float(v):
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None


def _mape(pairs: list[tuple[float, float]]) -> float:
    """Mean Absolute Percentage Error (%) over (actual, predicted) pairs.
    Rows with a missing or non-positive actual are skipped to avoid divide-by-zero."""
    vals = [abs(a - p) / a for a, p in pairs if a is not None and a > 0 and p is not None]
    return round(sum(vals) / len(vals) * 100.0, 2) if vals else 0.0


def compute_accuracy(horizon: str, island: str = "C") -> dict:
    """Backtest accuracy of the deployed **LSTM+Margin** forecast (`predicted_safe`)
    vs `actual`, read from the served forecast CSV — this is the conservative forecast
    the app actually uses for dispatch, and the team's headline metric. Returns MAPE %,
    RMSE (MW), n, within_target."""
    pts = get_forecast_series(horizon, island=island)
    pairs = [(p["actual"], p["predicted_safe"]) for p in pts
             if p.get("actual") is not None and p["actual"] > 0 and p.get("predicted_safe") is not None]
    mape = _mape(pairs)
    rmse = round(math.sqrt(sum((a - p) ** 2 for a, p in pairs) / len(pairs)), 3) if pairs else 0.0
    return {
        "island": island, "horizon": horizon, "mape_pct": mape,
        "rmse_mw": rmse, "n_points": len(pairs), "within_target": mape <= 10.0,
    }
