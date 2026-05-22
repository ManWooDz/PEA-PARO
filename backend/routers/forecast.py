"""
Forecast router.
GET /api/forecast          — next 24h load forecast
GET /api/forecast/7days    — 7-day hourly forecast
"""
from datetime import datetime
from fastapi import APIRouter, Query
from models.schemas import ForecastResponse, ForecastPoint
from models.forecasting import forecast_next_n_hours, forecast_7_days, model_info

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


@router.get("", response_model=ForecastResponse)
def get_forecast(hours: int = Query(default=24, ge=1, le=168)):
    now_h = datetime.now().hour
    pts = forecast_next_n_hours(n=hours, now_hour=now_h)
    return ForecastResponse(
        points=[ForecastPoint(**p) for p in pts],
        model_info=model_info(),
    )


@router.get("/7days", response_model=ForecastResponse)
def get_forecast_7days():
    now_h = datetime.now().hour
    pts = forecast_7_days(now_hour=now_h)
    return ForecastResponse(
        points=[ForecastPoint(**p) for p in pts],
        model_info=model_info(),
    )
