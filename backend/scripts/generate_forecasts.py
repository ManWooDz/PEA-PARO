"""
CLI: regenerate the served Island C forecast CSVs from a new historical dataset.

    python backend/scripts/generate_forecasts.py --input <historical.csv> [--out <dir>]

Requires TensorFlow + backend/ml/artifacts/C/. Run from the repo root or backend/.
"""
import argparse
import sys
from pathlib import Path

import pandas as pd

# Make `backend/` importable when run as a script.
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from data.loader import _read_one_csv
from ml.forecast_pipeline import generate_forecasts, _FORECAST_DIR


def load_input_history(path: str) -> pd.DataFrame:
    """Parse a Historical_Load_All-style CSV into a 15-min DatetimeIndex frame
    (reuses the project's CSV parser). Keeps the load_*_mw columns."""
    df = _read_one_csv(Path(path))
    df = df.set_index("timestamp").sort_index()
    keep = [c for c in ("load_a_mw", "load_b_mw", "load_c_mw") if c in df.columns]
    if "load_c_mw" not in keep:
        raise ValueError("Input CSV has no 'Load C' column after parsing.")
    return df[keep]


def main(argv=None):
    ap = argparse.ArgumentParser(description="Regenerate Island C forecast CSVs from history.")
    ap.add_argument("--input", required=True, help="Historical load CSV path")
    ap.add_argument("--out", default=str(_FORECAST_DIR), help="forecasts output dir")
    args = ap.parse_args(argv)

    hist = load_input_history(args.input)
    print(f"Loaded {len(hist)} rows ({hist.index.min()} -> {hist.index.max()})")
    summary = generate_forecasts(hist, out_dir=Path(args.out))
    m = summary["C"]
    flag = "OK" if m["6h"] <= 10 else "OVER 10%"
    print(f"\nIsland C MAPE (backtest): 6h={m['6h']:.2f}%  7day={m['7day']:.2f}%   [{flag} @6h]")
    print(f"Wrote forecast_6h.csv / forecast_7day.csv under {args.out}/C/")


if __name__ == "__main__":
    main()
