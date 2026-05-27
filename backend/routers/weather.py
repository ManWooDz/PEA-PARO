"""
Weather router — Open-Meteo proxy for Koh Tao solar irradiance + temperature.

Returns Plane-of-Array (POA) shortwave radiation when tilt/azimuth are supplied,
which feeds the NOCT-based solar generation model in data/loader.py.

GET /api/weather → next 24h hourly forecast.
"""
from datetime import datetime, timedelta
from fastapi import APIRouter
import httpx
from models.schemas import WeatherResponse, WeatherPoint

router = APIRouter(prefix="/api/weather", tags=["weather"])

# ── Koh Tao + PV array config ──────────────────────────────────────────────
LAT, LON = 10.10, 99.83
TILT     = 15.0   # panel tilt (deg from horizontal)
AZIMUTH  = 0.0    # 0 = facing South (Open-Meteo convention)

OPEN_METEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    f"?latitude={LAT}&longitude={LON}"
    "&hourly=shortwave_radiation,temperature_2m,cloud_cover"
    f"&tilt={TILT}&azimuth={AZIMUTH}"
    "&forecast_days=2&timezone=Asia%2FBangkok"
)

_CACHE: dict = {"ts": None, "data": None}
CACHE_TTL_MIN = 15


def _cache_fresh() -> bool:
    if _CACHE["ts"] is None:
        return False
    return (datetime.now() - _CACHE["ts"]).total_seconds() < CACHE_TTL_MIN * 60


def _fallback() -> WeatherResponse:
    """Synthetic data when Open-Meteo is unreachable."""
    pts = []
    now = datetime.now().replace(minute=0, second=0, microsecond=0)
    for i in range(24):
        dt = now + timedelta(hours=i)
        h = dt.hour
        # Solar bell curve: peaks at noon, zero at night
        irr = max(0.0, 850.0 * max(0.0, 1 - ((h - 12) / 6) ** 2))
        # Temperature curve: ~24°C nights, ~32°C noon
        temp = 28 + 4 * (1 - ((h - 14) / 7) ** 2)
        pts.append(WeatherPoint(
            ts=dt.strftime("%Y-%m-%dT%H:%M:%S"),
            solar_irradiance_w_m2=round(irr, 1),
            cloud_cover_pct=round(20 + (i % 6) * 5, 1),
            temperature_c=round(max(22, temp), 1),
        ))
    return WeatherResponse(lat=LAT, lon=LON, points=pts)


@router.get("", response_model=WeatherResponse)
async def get_weather():
    if _cache_fresh():
        return _CACHE["data"]
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(OPEN_METEO_URL)
            r.raise_for_status()
            j = r.json()
        times = j["hourly"]["time"]
        irrs  = j["hourly"]["shortwave_radiation"]
        clds  = j["hourly"]["cloud_cover"]
        temps = j["hourly"]["temperature_2m"]
        # Find the first index matching current hour, then take next 24
        now_iso = datetime.now().strftime("%Y-%m-%dT%H:00")
        start = next((i for i, t in enumerate(times) if t >= now_iso), 0)
        pts = [
            WeatherPoint(
                ts=times[i],
                solar_irradiance_w_m2=float(irrs[i] or 0.0),
                cloud_cover_pct=float(clds[i] or 0.0),
                temperature_c=float(temps[i] or 25.0),
            )
            for i in range(start, min(start + 24, len(times)))
        ]
        data = WeatherResponse(lat=LAT, lon=LON, points=pts)
    except Exception as exc:
        print(f"[weather] Open-Meteo unreachable ({exc}) — using fallback")
        data = _fallback()
    _CACHE["ts"], _CACHE["data"] = datetime.now(), data
    return data
