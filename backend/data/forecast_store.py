"""
Serve precomputed forecast series (LSTM+Margin model 18-2) from CSV.

Columns in CSV: datetime, actual, lstm, lstm_margin, hybrid, prophet
We expose:  datetime, actual, predicted (=lstm), predicted_safe (=lstm_margin)

Swap the CSV files in backend/data/forecasts/ to use PEA backtest data later.
"""
from functools import lru_cache
from pathlib import Path
import csv

_FORECAST_DIR = Path(__file__).parent / "forecasts"
_FILES = {
    "7day": _FORECAST_DIR / "forecast_7day.csv",
    "6h":   _FORECAST_DIR / "forecast_6h.csv",
}


@lru_cache(maxsize=4)
def get_forecast_series(horizon: str) -> list[dict]:
    """Return forecast series for 'horizon' in {'7day','6h'}.

    Each point: {datetime, actual, predicted, predicted_safe} (MW).
    Raises ValueError for unknown horizon, FileNotFoundError if CSV missing.
    """
    if horizon not in _FILES:
        raise ValueError(f"Unknown horizon '{horizon}'. Valid: {list(_FILES)}")
    path = _FILES[horizon]
    if not path.exists():
        raise FileNotFoundError(f"Forecast CSV not found: {path}")

    out: list[dict] = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            out.append({
                "datetime":       row["datetime"],
                "actual":         _to_float(row.get("actual")),
                "predicted":      _to_float(row.get("lstm")),
                "predicted_safe": _to_float(row.get("lstm_margin")),
            })
    return out


def _to_float(v):
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None
