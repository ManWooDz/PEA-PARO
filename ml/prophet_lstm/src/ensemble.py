# ml/prophet_lstm/src/ensemble.py
import numpy as np
from scipy.optimize import minimize


def optimize_weights(
    y_true: np.ndarray,
    y_lstm: np.ndarray,
    y_prophet: np.ndarray,
    max_prophet_weight: float = 0.3,
) -> tuple[float, float]:
    """Find w1, w2 minimizing RMSE on the given arrays.

    Constraints: w1 + w2 = 1, w1 >= 0, 0 <= w2 <= max_prophet_weight.
    Cap on w2 prevents over-weighting Prophet when it has systematic bias
    on the validation set that doesn't generalise to the test set.

    Args:
        y_true:             Ground truth values, 1-D or 2-D (flattened internally).
        y_lstm:             LSTM predictions, same shape as y_true.
        y_prophet:          Prophet predictions, same shape as y_true.
        max_prophet_weight: Upper bound for w2 (default 0.3).

    Returns:
        (w1, w2) as floats.
    """
    yt = y_true.flatten()
    yl = y_lstm.flatten()
    yp = y_prophet.flatten()

    def rmse_loss(w):
        pred = w[0] * yl + w[1] * yp
        return np.sqrt(np.mean((yt - pred) ** 2))

    result = minimize(
        rmse_loss,
        x0=[1.0 - max_prophet_weight / 2, max_prophet_weight / 2],
        method='SLSQP',
        bounds=[(0.0, 1.0), (0.0, max_prophet_weight)],
        constraints={'type': 'eq', 'fun': lambda w: w[0] + w[1] - 1.0},
    )
    w1, w2 = float(result.x[0]), float(result.x[1])

    # Sanity check: only keep w2 > 0 if Prophet actually improves val RMSE
    # by at least min_gain_pct over LSTM-only. Guards against the optimizer
    # over-fitting ensemble weights to the val set at the expense of test set.
    min_gain_pct = 1.0  # require ≥ 1% RMSE improvement to justify any Prophet weight
    rmse_lstm_only = np.sqrt(np.mean((yt - yl) ** 2))
    rmse_hybrid    = rmse_loss([w1, w2])
    gain_pct = (rmse_lstm_only - rmse_hybrid) / rmse_lstm_only * 100
    if gain_pct < min_gain_pct:
        print(f"[ensemble] Prophet gain {gain_pct:.2f}% < {min_gain_pct}% threshold → w2 forced to 0")
        w1, w2 = 1.0, 0.0
    else:
        print(f"[ensemble] Prophet gain {gain_pct:.2f}% ≥ threshold → keeping w2={w2:.4f}")

    return w1, w2


def ensemble_predict(
    y_lstm: np.ndarray,
    y_prophet: np.ndarray,
    w1: float,
    w2: float,
) -> np.ndarray:
    """Combine predictions: Ŷ = w1 * y_lstm + w2 * y_prophet."""
    return w1 * y_lstm + w2 * y_prophet
