import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import numpy as np
import pandas as pd

# Runs real TensorFlow inference; skip cleanly if TF is absent.
tf = pytest.importorskip("tensorflow")

from pathlib import Path
from ml import predictor as P


def _synthetic_history(n=900):
    # 900 × 15-min rows of a smooth daily load shape in a 'load_c' column
    # (≥ 768 needed so lag_672 + lookback are available).
    idx = pd.date_range("2025-11-01", periods=n, freq="15min")
    hours = idx.hour + idx.minute / 60.0
    base = 3.0 + 1.0 * np.sin((hours - 6) / 24 * 2 * np.pi)
    return pd.DataFrame({"load_c": base.round(3)}, index=idx)


def test_predictor_loads_island_c_from_committed_folder():
    # The C predictor must load from the git-tracked backend/ml/artifacts/C/.
    assert (P.ARTIFACTS_DIR / "C" / "lstm_island_c.keras").exists()
    pred = P._get_predictor()
    # the loaded model's artifacts dir resolves under .../artifacts/C
    out = pred.predict(_synthetic_history(), horizon="24h")
    assert len(out) == 96
    assert {"datetime", "load_mw", "load_mw_safe"} <= set(out[0])
    assert out[0]["load_mw_safe"] >= out[0]["load_mw"] - 1e-6


from ml.forecast_pipeline import backtest_island, _mape_arr


def test_mape_arr_known_value():
    a = np.array([100.0, 200.0]); p = np.array([90.0, 180.0])
    assert round(_mape_arr(a, p), 2) == 10.0


def test_backtest_island_c_produces_frames():
    # ~1100 rows → enough usable windows after dropping the first 672 (lag_672).
    df = _synthetic_history(n=1100)
    res = backtest_island(df, "C")
    for hz in ("6h", "7day"):
        frame = res[hz]["frame"]
        assert list(frame.columns) == ["datetime", "actual", "lstm", "lstm_margin", "hybrid", "prophet"]
        assert len(frame) > 0
        assert (frame["lstm_margin"] >= frame["lstm"]).all()   # margin non-negative
    assert res["6h"]["mape_pct"] >= 0.0


def test_cli_load_input_parses_load_c(tmp_path):
    from scripts.generate_forecasts import load_input_history
    csv = tmp_path / "hist.csv"
    csv.write_text(
        "Date,Load A,Load B,Load C\n"
        "1/1/2025 00:00,40,11,3\n"
        "1/1/2025 00:15,41,11.2,3.1\n"
    )
    df = load_input_history(str(csv))
    assert isinstance(df.index, pd.DatetimeIndex)
    assert "load_c_mw" in df.columns
    assert len(df) == 2
