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
