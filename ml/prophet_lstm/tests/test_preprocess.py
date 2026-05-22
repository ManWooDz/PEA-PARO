import pandas as pd
import numpy as np
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.preprocess import (
    load_raw_data, add_temporal_features, split_data,
    fit_scaler, scale, make_sequences, FEATURE_COLS
)

SAMPLE_CSV = Path(__file__).parent.parent.parent.parent / \
             "docs/data/Load profile _1.csv"


def test_load_raw_data_shape():
    df = load_raw_data(str(SAMPLE_CSV))
    assert len(df) == 40704, f"Expected 40704 rows, got {len(df)}"
    assert 'load_c' in df.columns


def test_negative_values_fixed():
    df = load_raw_data(str(SAMPLE_CSV))
    assert (df['load_c'] >= 0).all(), "Negative values remain after cleaning"


def test_add_temporal_features_columns():
    df = load_raw_data(str(SAMPLE_CSV))
    for col in ['temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation']:
        df[col] = 25.0
    df = add_temporal_features(df)
    for col in ['hour_sin', 'hour_cos', 'dow_sin', 'dow_cos',
                'month_sin', 'month_cos', 'is_weekend', 'is_holiday',
                'lag_96', 'lag_672']:
        assert col in df.columns, f"Missing feature column: {col}"


def test_cyclical_encoding_range():
    df = load_raw_data(str(SAMPLE_CSV))
    for col in ['temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation']:
        df[col] = 25.0
    df = add_temporal_features(df)
    assert df['hour_sin'].between(-1, 1).all()
    assert df['hour_cos'].between(-1, 1).all()


def test_split_data_sizes():
    df = load_raw_data(str(SAMPLE_CSV))
    for col in ['temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation']:
        df[col] = 25.0
    df = add_temporal_features(df)
    train, val, test = split_data(df, "2025-11-30 23:45:00", "2025-12-31 23:45:00")
    assert len(train) > 0
    assert len(val) > 0
    assert len(test) > 0
    assert len(train) + len(val) + len(test) == len(df)


def test_scaler_fitted_on_train_only():
    df = load_raw_data(str(SAMPLE_CSV))
    for col in ['temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation']:
        df[col] = 25.0
    df = add_temporal_features(df).dropna()
    train, val, _ = split_data(df, "2025-11-30 23:45:00", "2025-12-31 23:45:00")
    scaler = fit_scaler(train)
    scaled = scale(train, scaler)
    assert scaled.min() >= 0.0 - 1e-9
    assert scaled.max() <= 1.0 + 1e-9


def test_make_sequences_shapes():
    arr = np.random.rand(300, 15)
    X, y = make_sequences(arr, lookback=96, horizon=96)
    # n_samples = 300 - 96 - 96 + 1 = 109
    assert X.shape == (109, 96, 15), f"Got {X.shape}"
    assert y.shape == (109, 96), f"Got {y.shape}"
