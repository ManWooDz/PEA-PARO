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
    return w1, w2


def ensemble_predict(
    y_lstm: np.ndarray,
    y_prophet: np.ndarray,
    w1: float,
    w2: float,
) -> np.ndarray:
    """Combine predictions: Ŷ = w1 * y_lstm + w2 * y_prophet."""
    return w1 * y_lstm + w2 * y_prophet
