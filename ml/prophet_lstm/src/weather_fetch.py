import requests
import pandas as pd
from pathlib import Path

WEATHER_COLS = ['temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation']
_DEFAULT_CACHE = Path(__file__).parent.parent / 'data' / 'weather_koh_tao.csv'


def fetch_weather(
    lat: float = 10.10,
    lon: float = 99.84,
    start: str = '2025-01-01',
    end: str   = '2026-02-28',
    cache_path = _DEFAULT_CACHE
) -> pd.DataFrame:
    """Fetch hourly weather from Open-Meteo archive API.

    Returns DataFrame indexed by datetime at 15-min frequency (forward-filled).
    Results are cached to cache_path if provided.
    """
    if cache_path is not None:
        cache_path = Path(cache_path)
        if cache_path.exists():
            df = pd.read_csv(cache_path, parse_dates=['datetime'], index_col='datetime')
            return df

    url = 'https://archive-api.open-meteo.com/v1/archive'
    params = {
        'latitude':  lat,
        'longitude': lon,
        'start_date': start,
        'end_date':   end,
        'hourly': ','.join(WEATHER_COLS),
        'timezone': 'Asia/Bangkok',
    }
    resp = requests.get(url, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    hourly = data['hourly']
    df = pd.DataFrame(
        {col: hourly[col] for col in WEATHER_COLS},
        index=pd.to_datetime(hourly['time'])
    )
    df.index.name = 'datetime'

    # Resample hourly → 15-min via forward-fill
    df_15min = df.resample('15min').ffill()

    if cache_path is not None:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        df_15min.to_csv(cache_path)

    return df_15min
