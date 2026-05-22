# ml/prophet_lstm/tests/test_ensemble.py
import numpy as np
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.ensemble import optimize_weights, ensemble_predict


def test_weights_sum_to_one():
    rng = np.random.default_rng(42)
    y_true    = rng.uniform(1, 5, 1000)
    y_lstm    = y_true + rng.normal(0, 0.3, 1000)
    y_prophet = y_true + rng.normal(0, 0.5, 1000)
    w1, w2 = optimize_weights(y_true, y_lstm, y_prophet)
    assert abs(w1 + w2 - 1.0) < 1e-6, f"Weights do not sum to 1: {w1} + {w2} = {w1+w2}"


def test_weights_non_negative():
    rng = np.random.default_rng(42)
    y_true    = rng.uniform(1, 5, 1000)
    y_lstm    = y_true + rng.normal(0, 0.3, 1000)
    y_prophet = y_true + rng.normal(0, 0.5, 1000)
    w1, w2 = optimize_weights(y_true, y_lstm, y_prophet)
    assert w1 >= 0 and w2 >= 0, f"Negative weights: w1={w1}, w2={w2}"


def test_better_model_gets_higher_weight():
    rng = np.random.default_rng(0)
    y_true    = rng.uniform(1, 5, 2000)
    y_lstm    = y_true + rng.normal(0, 0.1, 2000)   # LSTM better
    y_prophet = y_true + rng.normal(0, 1.0, 2000)   # Prophet worse
    w1, w2 = optimize_weights(y_true, y_lstm, y_prophet)
    assert w1 > w2, f"Expected w1 (LSTM) > w2 (Prophet), got w1={w1:.3f}, w2={w2:.3f}"


def test_ensemble_predict_shape():
    y_lstm    = np.ones((100, 96))
    y_prophet = np.ones((100, 96)) * 2
    result = ensemble_predict(y_lstm, y_prophet, w1=0.6, w2=0.4)
    assert result.shape == (100, 96)
    assert abs(result[0, 0] - 1.4) < 1e-6, f"Expected 1.4, got {result[0,0]}"
