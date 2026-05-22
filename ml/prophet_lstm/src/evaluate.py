# ml/prophet_lstm/src/evaluate.py
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mask = y_true != 0
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


def r2(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    return float(1 - ss_res / ss_tot)


def evaluation_report(
    y_true: np.ndarray,
    y_pred_lstm: np.ndarray,
    y_pred_prophet: np.ndarray,
    y_pred_hybrid: np.ndarray,
    label: str = 'Test',
) -> pd.DataFrame:
    """Return a DataFrame comparing LSTM / Prophet / Hybrid metrics."""
    rows = []
    for name, y_pred in [('LSTM', y_pred_lstm),
                          ('Prophet', y_pred_prophet),
                          ('Hybrid', y_pred_hybrid)]:
        rows.append({
            'Model':    name,
            'Set':      label,
            'RMSE':     round(rmse(y_true, y_pred), 4),
            'MAPE (%)': round(mape(y_true, y_pred), 4),
            'R²':       round(r2(y_true, y_pred), 4),
        })
    return pd.DataFrame(rows)


def plot_forecast(
    index,
    y_true: np.ndarray,
    y_hybrid: np.ndarray,
    y_lstm: np.ndarray,
    y_prophet: np.ndarray,
    title: str = 'Island C — Load Forecast vs Actual',
    save_path: str | None = None,
) -> None:
    """Plot actual vs all three model predictions."""
    fig, ax = plt.subplots(figsize=(16, 5))
    ax.plot(index, y_true,     label='Actual',  color='black',  linewidth=1.5)
    ax.plot(index, y_hybrid,   label='Hybrid',  color='blue',   linewidth=1.2, linestyle='-')
    ax.plot(index, y_lstm,     label='LSTM',    color='orange', linewidth=0.9, linestyle='--')
    ax.plot(index, y_prophet,  label='Prophet', color='green',  linewidth=0.9, linestyle=':')
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%d %b'))
    ax.xaxis.set_major_locator(mdates.WeekdayLocator(interval=1))
    plt.xticks(rotation=30)
    ax.set_xlabel('Date')
    ax.set_ylabel('Load (MW)')
    ax.set_title(title)
    ax.legend()
    plt.tight_layout()
    if save_path:
        fig.savefig(save_path, dpi=150)
    plt.show()


def plot_learning_curves(history, save_path: str | None = None) -> None:
    """Plot LSTM training/validation loss curves."""
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(history.history['loss'],     label='Train Loss')
    ax.plot(history.history['val_loss'], label='Val Loss')
    ax.set_xlabel('Epoch')
    ax.set_ylabel('MSE Loss')
    ax.set_title('LSTM Learning Curves')
    ax.legend()
    plt.tight_layout()
    if save_path:
        fig.savefig(save_path, dpi=150)
    plt.show()
