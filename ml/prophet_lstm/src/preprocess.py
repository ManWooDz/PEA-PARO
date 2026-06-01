import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
import holidays

TRAIN_END = "2025-10-24 18:45:00"   # 70% of total data (28,492 rows)
VAL_END   = "2025-12-27 09:00:00"   # 15% val (6,105 rows); test = remaining 15% (6,107 rows)

# ── Per-island configuration ─────────────────────────────────────────────────
ISLAND_CFG = {
    'A': {
        'lat': 9.53, 'lon': 100.06,          # Koh Samui (approx)
        'src_col':  'โหลดรวม A',
        'target':   'load_a',
        'blackout_threshold': 0,              # No zero-load events in data
        'tourist_peak_months': {11, 12, 1, 2},
        'has_bess': True,
    },
    'B': {
        'lat': 9.76, 'lon': 100.01,          # Koh Phangan (approx)
        'src_col':  'โหลดรวม B',
        'target':   'load_b',
        'blackout_threshold': 0,              # Min 2.66 MW — no real blackouts
        'tourist_peak_months': {11, 12, 1, 2},
        'has_bess': False,
    },
    'C': {
        'lat': 10.10, 'lon': 99.84,          # Koh Tao
        'src_col':  'โหลด C',
        'target':   'load_c',
        'blackout_threshold': 0,              # <= 0 → whole-island blackout → interpolate
        'tourist_peak_months': {11, 12, 1, 2},
        'has_bess': False,
    },
}

# Island display labels for plot titles
ISLAND_LABEL = {
    'A': 'Island A',
    'B': 'Island B',
    'C': 'Island C (Koh Tao)',
}

# ── Feature columns ───────────────────────────────────────────────────────────
_BASE_FEATURES = [
    'temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation',
    'hour_sin', 'hour_cos', 'dow_sin', 'dow_cos', 'month_sin', 'month_cos',
    'is_weekend', 'is_holiday', 'is_tourist_season',
    'lag_96', 'lag_672',
]


def get_feature_cols(island: str = 'C') -> list[str]:
    """Return ordered feature columns for a given island.

    Target load column is always first (scaler column index 0 = target).
    Island A additionally includes bess_mw between target and weather.
    """
    cfg  = ISLAND_CFG[island]
    cols = [cfg['target']] + _BASE_FEATURES
    if cfg['has_bess']:
        cols.insert(1, 'bess_mw')   # right after target, before weather
    return cols


# Backward-compatible alias (Island C, 16 features)
FEATURE_COLS = get_feature_cols('C')


def load_raw_data(filepath: str, island: str = 'C') -> pd.DataFrame:
    """Load and clean load profile CSV for the given island.

    Accepts both:
      - Single-island 4-column CSV  (Island C legacy: Load profile _1.csv)
      - Multi-island ABC CSV        (Load profile _ABC.csv, 21 columns, 2-row header)

    Returns DataFrame with DatetimeIndex and a single clean load column
    named per ISLAND_CFG[island]['target'].  Island A also returns bess_mw.
    """
    cfg    = ISLAND_CFG[island]
    target = cfg['target']

    # Format detection: ABC has 21 columns, legacy Island-C file has 4
    probe  = pd.read_csv(filepath, nrows=1)
    is_abc = len(probe.columns) > 5

    if is_abc:
        # Row 0 = island group header ('เกาะ A' etc.); row 1 = real column names
        df = pd.read_csv(filepath, skiprows=1)
        df['datetime'] = pd.to_datetime(df['Date'] + ' ' + df['Time'], dayfirst=True)
        df = df.set_index('datetime').sort_index()
        df[target] = pd.to_numeric(df[cfg['src_col']], errors='coerce')
        keep = [target]
        if cfg['has_bess']:
            df['bess_mw'] = pd.to_numeric(df['BESS'], errors='coerce').fillna(0.0)
            keep.append('bess_mw')
        df = df[keep].copy()
    else:
        # Legacy Island C format: 4 columns
        df = pd.read_csv(filepath, header=0)
        df.columns = ['datetime', 'line6_33kv', 'diesel_c', 'load_c']
        df['datetime'] = pd.to_datetime(df['datetime'], format='mixed', dayfirst=False)
        df = df.set_index('datetime').sort_index()
        df = df[[target]].copy()

    # Blackout handling: replace values <= threshold with NaN, then interpolate.
    # Zeros = whole-island outage; negative = reverse-flow bug — both mislead lag features.
    n_bad = (df[target] <= cfg['blackout_threshold']).sum()
    if n_bad > 0:
        df.loc[df[target] <= cfg['blackout_threshold'], target] = np.nan
        df[target] = df[target].interpolate(method='linear', limit_direction='both')
    print(f"[preprocess] island={island}: {len(df)} rows, "
          f"interpolated {n_bad} blackout values, "
          f"range [{df[target].min():.2f}, {df[target].max():.2f}] MW")
    return df


def add_temporal_features(df: pd.DataFrame, island: str = 'C') -> pd.DataFrame:
    """Add cyclical time, holiday, and lag features. Weather columns must already exist."""
    REQUIRED_WEATHER = ['temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation']
    missing = [c for c in REQUIRED_WEATHER if c not in df.columns]
    if missing:
        raise ValueError(f"add_temporal_features: missing weather columns {missing}")

    cfg    = ISLAND_CFG[island]
    target = cfg['target']

    df = df.copy()
    df['hour_sin']  = np.sin(2 * np.pi * df.index.hour / 24)
    df['hour_cos']  = np.cos(2 * np.pi * df.index.hour / 24)
    df['dow_sin']   = np.sin(2 * np.pi * df.index.dayofweek / 7)
    df['dow_cos']   = np.cos(2 * np.pi * df.index.dayofweek / 7)
    df['month_sin'] = np.sin(2 * np.pi * df.index.month / 12)
    df['month_cos'] = np.cos(2 * np.pi * df.index.month / 12)

    # Clip cyclical features to [-1, 1] — prevents OOD values when scaler
    # was fit on a partial year (e.g. training ends Oct, test has Nov-Feb).
    CYCLICAL = ['hour_sin', 'hour_cos', 'dow_sin', 'dow_cos', 'month_sin', 'month_cos']
    df[CYCLICAL] = df[CYCLICAL].clip(-1.0, 1.0)

    df['is_weekend'] = (df.index.dayofweek >= 5).astype(int)
    th_hols = holidays.Thailand(years=list(range(df.index.year.min(), df.index.year.max() + 1)))
    df['is_holiday'] = [int(d in th_hols) for d in df.index.date]

    # Tourist season (island-specific peak months; all three currently share Nov-Feb)
    df['is_tourist_season'] = df.index.month.isin(cfg['tourist_peak_months']).astype(int)

    # Lag features always reference the island's own load column
    df['lag_96']  = df[target].shift(96)    # 24 h back
    df['lag_672'] = df[target].shift(672)   # 7 days back

    # Fill weather gaps (sparse API holes) before dropna — prevents NaN in LSTM inputs
    WEATHER_COLS = ['temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation']
    df[WEATHER_COLS] = df[WEATHER_COLS].ffill().bfill()
    return df


def split_data(df: pd.DataFrame, train_end: str = TRAIN_END, val_end: str = VAL_END):
    """Chronological train / val / test split."""
    train = df[df.index <= train_end].copy()
    val   = df[(df.index > train_end) & (df.index <= val_end)].copy()
    test  = df[df.index > val_end].copy()
    return train, val, test


def fit_scaler(train: pd.DataFrame, feature_cols: list[str] | None = None) -> MinMaxScaler:
    """Fit MinMaxScaler on training data only (no leakage).

    feature_cols defaults to FEATURE_COLS (Island C) for backward compatibility.
    Pass get_feature_cols(island) explicitly for Islands A or B.
    """
    if feature_cols is None:
        feature_cols = FEATURE_COLS
    scaler = MinMaxScaler()
    scaler.fit(train[feature_cols])
    return scaler


def scale(df: pd.DataFrame, scaler: MinMaxScaler,
          feature_cols: list[str] | None = None) -> np.ndarray:
    """Apply a pre-fitted scaler to a DataFrame.

    feature_cols defaults to FEATURE_COLS (Island C) for backward compatibility.
    """
    if feature_cols is None:
        feature_cols = FEATURE_COLS
    return scaler.transform(df[feature_cols])


def make_sequences(scaled: np.ndarray, lookback: int = 96, horizon: int = 96):
    """Create sliding-window (X, y) pairs.
    X shape: (n_samples, lookback, n_features)
    y shape: (n_samples, horizon) — target column (index 0) only
    """
    X, y = [], []
    for i in range(lookback, len(scaled) - horizon + 1):
        X.append(scaled[i - lookback: i])
        y.append(scaled[i: i + horizon, 0])
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)
