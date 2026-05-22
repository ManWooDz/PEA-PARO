"""
Forecast router.
GET /api/forecast        — next N hours point forecast  (ForecastResponse)
GET /api/forecast/7days  — 7-day daily summary          (Forecast7DayResponse)
"""
from fastapi import APIRouter, Query
from models.schemas import (
    ForecastResponse, ForecastPoint, ModelInfo,
    Forecast7DayResponse, ForecastDay,
)
from models.forecasting import forecast_next_n_hours, forecast_7_days, model_info

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


@router.get("", response_model=ForecastResponse)
def get_forecast(hours: int = Query(default=24, ge=1, le=168)):
    pts  = forecast_next_n_hours(n=hours)
    info = model_info()
    return ForecastResponse(
        points=[ForecastPoint(**p) for p in pts],
        model=ModelInfo(**info),
    )


@router.get("/7days", response_model=Forecast7DayResponse)
def get_forecast_7days():
    days = forecast_7_days()
    info = model_info()
    return Forecast7DayResponse(
        days=[ForecastDay(**d) for d in days],
        model=ModelInfo(**info),
    )
