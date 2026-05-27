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


def compute_safety_margin(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    coverage_pct: float = 0.90,
) -> float:
    """Compute additive safety margin so forecast exceeds actual coverage_pct of the time.

    Calibrate on the *validation* set (not test) to avoid data leakage.

    Logic:
        errors = y_pred - y_true   (positive = over-predict)
        We want (errors + margin) > 0  for coverage_pct fraction of points.
        → margin = -percentile(errors, (1 - coverage_pct) * 100)

    Args:
        y_true:       Ground truth values (use val or train set for calibration).
        y_pred:       Model predictions for the same set.
        coverage_pct: Target fraction where forecast > actual, e.g. 0.90 = 90 %.

    Returns:
        margin (float, MW): Add this to any future LSTM forecast to achieve
                            approximately coverage_pct above-actual rate.
    """
    errors = y_pred.flatten() - y_true.flatten()   # positive = over-predict
    percentile_rank = (1.0 - coverage_pct) * 100.0
    margin = float(-np.percentile(errors, percentile_rank))
    return margin


def coverage_analysis(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    margins: list[float] | None = None,
) -> pd.DataFrame:
    """Show above-actual coverage (%) for a sweep of additive safety margins.

    Useful for picking an operating margin: higher coverage → larger margin → higher MAPE.

    Args:
        y_true:   Ground truth values (typically test set).
        y_pred:   Base LSTM predictions (no margin applied yet).
        margins:  Additive offsets (MW) to evaluate.
                  Default: [0, 0.10, 0.20, 0.30, 0.50, 0.70, 1.00].

    Returns:
        DataFrame with columns ['Margin (MW)', 'Above-Actual (%)'].
    """
    if margins is None:
        margins = [0.0, 0.10, 0.20, 0.30, 0.50, 0.70, 1.00]
    errors = y_pred.flatten() - y_true.flatten()
    rows = []
    for m in margins:
        above_pct = float(np.mean(errors + m > 0) * 100)
        rows.append({'Margin (MW)': round(m, 2), 'Above-Actual (%)': round(above_pct, 1)})
    return pd.DataFrame(rows)


def evaluation_report(
    y_true: np.ndarray,
    y_pred_lstm: np.ndarray,
    y_pred_prophet: np.ndarray,
    y_pred_hybrid: np.ndarray,
    label: str = 'Test',
    safety_margin: float | None = None,
    y_pred_margin: np.ndarray | None = None,
    margin_label: str = 'LSTM+Margin',
) -> pd.DataFrame:
    """Return a DataFrame comparing LSTM / Prophet / Hybrid metrics.

    Args:
        safety_margin:  If provided, appends a '{margin_label}' row showing metrics
                        after shifting LSTM predictions up by this flat additive margin (MW).
                        Use compute_safety_margin() to derive this value from the val set.
        y_pred_margin:  Pre-computed LSTM+margin predictions (already margin-applied,
                        same shape as y_pred_lstm after flattening).  Takes priority over
                        safety_margin.  Use this for per-band margins (Round 16.7+):
                        caller builds np.hstack([lstm[:,:H6]+m6h, lstm[:,H6:]+m6_24h])
                        before passing here.
    """
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
    # Per-band pre-computed margin (Round 16.7+) takes priority over flat margin
    if y_pred_margin is not None:
        yt = np.asarray(y_true).flatten()
        yl_margin = np.asarray(y_pred_margin).flatten()
        rows.append({
            'Model':    margin_label,
            'Set':      label,
            'RMSE':     round(rmse(yt, yl_margin), 4),
            'MAPE (%)': round(mape(yt, yl_margin), 4),
            'R²':       round(r2(yt, yl_margin), 4),
        })
    elif safety_margin is not None:
        yt = np.asarray(y_true).flatten()
        yl_margin = np.asarray(y_pred_lstm).flatten() + safety_margin
        rows.append({
            'Model':    margin_label,
            'Set':      label,
            'RMSE':     round(rmse(yt, yl_margin), 4),
            'MAPE (%)': round(mape(yt, yl_margin), 4),
            'R²':       round(r2(yt, yl_margin), 4),
        })
    return pd.DataFrame(rows)


def plot_forecast(
    index,
    y_true: np.ndarray,
    y_lstm: np.ndarray,
    title: str = 'Island C — Load Forecast vs Actual',
    save_path: str | None = None,
    y_margin: np.ndarray | None = None,
    margin_label: str = 'LSTM+Margin',
    y_hybrid: np.ndarray | None = None,
    y_prophet: np.ndarray | None = None,
) -> None:
    """Plot actual vs LSTM predictions, with optional margin, hybrid, and prophet lines.

    Args:
        y_margin:     Optional conservative LSTM forecast (y_lstm + safety_margin).
        margin_label: Legend label for the margin line.
        y_hybrid:     Optional hybrid model predictions (pass to show, omit to hide).
        y_prophet:    Optional Prophet predictions (pass to show, omit to hide).
    """
    fig, ax = plt.subplots(figsize=(16, 5))
    ax.plot(index, y_true,  label='Actual',     color='black',   linewidth=1.5)
    ax.plot(index, y_lstm,  label='LSTM',       color='#2563eb', linewidth=1.2, linestyle='--')
    if y_margin is not None:
        ax.plot(index, y_margin, label=margin_label, color='#dc2626', linewidth=1.2, linestyle='-.')
    if y_hybrid is not None:
        ax.plot(index, y_hybrid,  label='Hybrid',  color='blue',  linewidth=0.9, linestyle='-')
    if y_prophet is not None:
        ax.plot(index, y_prophet, label='Prophet', color='green', linewidth=0.9, linestyle=':')
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
