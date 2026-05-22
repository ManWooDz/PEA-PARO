import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
import holidays

TRAIN_END = "2025-11-30 23:45:00"
VAL_END   = "2025-12-31 23:45:00"

FEATURE_COLS = [
    'load_c',
    'temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation',
    'hour_sin', 'hour_cos', 'dow_sin', 'dow_cos', 'month_sin', 'month_cos',
    'is_weekend', 'is_holiday', 'lag_96', 'lag_672'
]


def load_raw_data(filepath: str) -> pd.DataFrame:
    """Load and clean Island C load profile CSV."""
    df = pd.read_csv(filepath, header=0)
    df.columns = ['datetime', 'line6_33kv', 'diesel_c', 'load_c']
    df['datetime'] = pd.to_datetime(df['datetime'], format='mixed', dayfirst=False)
    df = df.set_index('datetime').sort_index()
    # Fix single negative value via linear interpolation
    df.loc[df['load_c'] < 0, 'load_c'] = np.nan
    df['load_c'] = df['load_c'].interpolate(method='linear', limit_direction='both')
    return df


def add_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add cyclical time, holiday, and lag features. Weather columns must already exist."""
    # Validate that required weather columns are present
    REQUIRED_WEATHER = ['temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation']
    missing = [c for c in REQUIRED_WEATHER if c not in df.columns]
    if missing:
        raise ValueError(f"add_temporal_features: missing weather columns {missing}")

    df = df.copy()
    df['hour_sin']   = np.sin(2 * np.pi * df.index.hour / 24)
    df['hour_cos']   = np.cos(2 * np.pi * df.index.hour / 24)
    df['dow_sin']    = np.sin(2 * np.pi * df.index.dayofweek / 7)
    df['dow_cos']    = np.cos(2 * np.pi * df.index.dayofweek / 7)
    df['month_sin']  = np.sin(2 * np.pi * df.index.month / 12)
    df['month_cos']  = np.cos(2 * np.pi * df.index.month / 12)

    # Clip cyclical features to [-1, 1] to prevent out-of-distribution values
    # after scaler is fit on partial year (e.g., training stops at Nov, test has Dec)
    CYCLICAL_COLS = ['hour_sin', 'hour_cos', 'dow_sin', 'dow_cos', 'month_sin', 'month_cos']
    df[CYCLICAL_COLS] = df[CYCLICAL_COLS].clip(-1.0, 1.0)

    df['is_weekend'] = (df.index.dayofweek >= 5).astype(int)
    th_hols = holidays.Thailand(years=list(range(df.index.year.min(),
                                                 df.index.year.max() + 1)))
    df['is_holiday'] = [int(d in th_hols) for d in df.index.date]
    df['lag_96']  = df['load_c'].shift(96)
    df['lag_672'] = df['load_c'].shift(672)
    return df


def split_data(df: pd.DataFrame,
               train_end: str = TRAIN_END,
               val_end: str   = VAL_END):
    """Chronological train / val / test split."""
    train = df[df.index <= train_end].copy()
    val   = df[(df.index > train_end) & (df.index <= val_end)].copy()
    test  = df[df.index > val_end].copy()
    return train, val, test


def fit_scaler(train: pd.DataFrame) -> MinMaxScaler:
    """Fit MinMaxScaler on training data only (no leakage)."""
    scaler = MinMaxScaler()
    scaler.fit(train[FEATURE_COLS])
    return scaler


def scale(df: pd.DataFrame, scaler: MinMaxScaler) -> np.ndarray:
    """Apply a pre-fitted scaler to a DataFrame."""
    return scaler.transform(df[FEATURE_COLS])


def make_sequences(scaled: np.ndarray,
                   lookback: int = 96,
                   horizon: int  = 96):
    """Create sliding-window (X, y) pairs.
    X shape: (n_samples, lookback, n_features)
    y shape: (n_samples, horizon) — load_c column (index 0) only
    """
    X, y = [], []
    for i in range(lookback, len(scaled) - horizon + 1):
        X.append(scaled[i - lookback: i])
        y.append(scaled[i: i + horizon, 0])
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)
