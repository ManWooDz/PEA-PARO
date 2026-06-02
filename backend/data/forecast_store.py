"""
Serve precomputed LSTM forecast series from CSV, per island.

Columns in CSV: datetime, actual, lstm, lstm_margin, hybrid, prophet
We expose:  datetime, actual, predicted (=lstm), predicted_safe (=lstm_margin)

Files live in backend/data/forecasts/<ISLAND>/forecast_<horizon>.csv.
"""
from functools import lru_cache
from pathlib import Path
import csv

_FORECAST_DIR = Path(__file__).parent / "forecasts"
_HORIZONS = {"7day", "6h"}
_ISLANDS = {"A", "B", "C"}


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
