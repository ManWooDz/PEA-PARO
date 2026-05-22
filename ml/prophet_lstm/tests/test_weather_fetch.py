import pandas as pd
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.weather_fetch import fetch_weather, WEATHER_COLS


def test_weather_columns():
    """Fetch a tiny date range to validate column structure."""
    df = fetch_weather(
        lat=10.10, lon=99.84,
        start='2025-01-01', end='2025-01-02',
        cache_path=None
    )
    for col in WEATHER_COLS:
        assert col in df.columns, f"Missing weather column: {col}"


def test_weather_15min_frequency():
    df = fetch_weather(
        lat=10.10, lon=99.84,
        start='2025-01-01', end='2025-01-02',
        cache_path=None
    )
    # API returns 48 hourly points (00:00–23:00 for 2 days).
    # After resample('15min').ffill(), the last hour (23:00) is NOT extrapolated
    # beyond the final data point, so: 48 hours × 4 - 3 trailing = 189 rows.
    assert len(df) == 189, f"Expected 189 rows for 2 days at 15-min, got {len(df)}"


def test_weather_no_nulls():
    df = fetch_weather(
        lat=10.10, lon=99.84,
        start='2025-01-01', end='2025-01-02',
        cache_path=None
    )
    assert df.isnull().sum().sum() == 0, "Weather data contains nulls after forward-fill"


def test_weather_caching(tmp_path):
    cache = tmp_path / "weather_test.csv"
    df1 = fetch_weather(
        lat=10.10, lon=99.84,
        start='2025-01-01', end='2025-01-02',
        cache_path=cache
    )
    assert cache.exists()
    # Second call should load from cache (no API hit)
    df2 = fetch_weather(
        lat=10.10, lon=99.84,
        start='2025-01-01', end='2025-01-02',
        cache_path=cache
    )
    assert len(df1) == len(df2)
