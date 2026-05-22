# ml/prophet_lstm/src/ensemble.py
import numpy as np
from scipy.optimize import minimize


def optimize_weights(
    y_true: np.ndarray,
    y_lstm: np.ndarray,
    y_prophet: np.ndarray,
) -> tuple[float, float]:
    """Find w1, w2 minimizing RMSE on the given arrays.

    Constraints: w1 + w2 = 1, w1 >= 0, w2 >= 0.

    Args:
        y_true:    Ground truth values, 1-D or 2-D (flattened internally).
        y_lstm:    LSTM predictions, same shape as y_true.
        y_prophet: Prophet predictions, same shape as y_true.

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
        x0=[0.5, 0.5],
        method='SLSQP',
        bounds=[(0.0, 1.0), (0.0, 1.0)],
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
