# ml/prophet_lstm/tests/test_evaluate.py
import numpy as np
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.evaluate import rmse, mape, r2, evaluation_report


def test_rmse_perfect():
    y = np.array([1.0, 2.0, 3.0])
    assert rmse(y, y) == 0.0


def test_rmse_known():
    y_true = np.array([2.0, 4.0])
    y_pred = np.array([1.0, 3.0])
    assert abs(rmse(y_true, y_pred) - 1.0) < 1e-9


def test_mape_perfect():
    y = np.array([1.0, 2.0, 3.0])
    assert mape(y, y) == 0.0


def test_mape_known():
    y_true = np.array([100.0, 200.0])
    y_pred = np.array([110.0, 190.0])
    expected = (10/100 + 10/200) / 2 * 100   # 7.5%
    assert abs(mape(y_true, y_pred) - expected) < 1e-6


def test_r2_perfect():
    y = np.array([1.0, 2.0, 3.0, 4.0])
    assert abs(r2(y, y) - 1.0) < 1e-9


def test_evaluation_report_shape():
    y = np.ones(100)
    report = evaluation_report(y, y, y, y, label='Test')
    assert len(report) == 3
    assert set(report['Model']) == {'LSTM', 'Prophet', 'Hybrid'}
