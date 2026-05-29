"""
Endpoints for actionable recommendations.

GET  /api/forecast/series?horizon=7day|6h   — forecast + actual series (CSV)
GET  /api/dispatch/day-ahead                 — multi-day plan + recommendations
POST /api/intraday/alerts                    — early-warning alerts (T1/T2/T3)
"""
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from data.forecast_store import get_forecast_series
from data.seed import PRACTICAL_GRID_KW
from models.dispatch_optimizer import build_multi_day_plan, compute_plan_cost
from models.recommendation import build_recommendations, detect_intraday_alerts
from models.schemas import (
    ForecastSeriesResponse, ForecastSeriesPoint,
    Recommendation, RecommendationsResponse, DispatchRow, CostBreakdown,
)

router = APIRouter(tags=["recommendations"])

# day-ahead supports only baseline (reference) and min-cost (AI-optimized).
# "reliability" was dropped; "custom" plans use the separate /api/dispatch/custom endpoint.
VALID_STRATEGIES = {"baseline", "min-cost"}
_STEPS_PER_DAY = 96   # 15-min steps in 24h
_STEPS_PER_HOUR = 4   # 15-min steps in 1h


def _aggregate_to_hourly_kw(series, hours: int) -> list[float]:
    """Average 15-min predicted_safe (MW) into hourly kW; pad/truncate to `hours`."""
    out: list[float] = []
    for h in range(hours):
        window = series[h * _STEPS_PER_HOUR:(h + 1) * _STEPS_PER_HOUR]
        if not window:
            break
        vals = [p["predicted_safe"] for p in window if p.get("predicted_safe") is not None]
        avg_mw = (sum(vals) / len(vals)) if vals else 0.0
        out.append(avg_mw * 1000.0)
    if not out:
        out = [3200.0] * hours
    while len(out) < hours:
        out.append(out[-1])
    return out


def _weekday_flags(series, days: int) -> list[bool]:
    """Derive Mon-Fri (peak pricing) flag per day from the forecast datetimes."""
    flags: list[bool] = []
    for d in range(days):
        idx = d * _STEPS_PER_DAY
        wd = True
        if idx < len(series):
            try:
                wd = datetime.fromisoformat(str(series[idx]["datetime"])).weekday() < 5
            except ValueError:
                wd = True
        flags.append(wd)
    return flags


@router.get("/api/forecast/series", response_model=ForecastSeriesResponse)
def forecast_series(horizon: str = "7day"):
    try:
        pts = get_forecast_series(horizon)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return ForecastSeriesResponse(
        horizon=horizon,
        points=[ForecastSeriesPoint(**p) for p in pts],
    )


class DayAheadResponse(BaseModel):
    strategy: str
    rows: list[DispatchRow]
    cost: CostBreakdown
    recommendations: list[Recommendation]


@router.get("/api/dispatch/day-ahead", response_model=DayAheadResponse)
def day_ahead(strategy: str = "min-cost", days: int = 1, has_solar: bool = False):
    if strategy not in VALID_STRATEGIES:
        raise HTTPException(status_code=422, detail=f"Unknown strategy '{strategy}'.")
    if days < 1:
        raise HTTPException(status_code=422, detail="days must be >= 1.")
    if days > 7:
        raise HTTPException(status_code=422, detail="days must be <= 7 (7-day forecast horizon).")
    series = get_forecast_series("7day")
    hourly_kw = _aggregate_to_hourly_kw(series, hours=days * 24)
    weekday_flags = _weekday_flags(series, days=days)
    rows = build_multi_day_plan(
        hourly_kw, days=days, strategy=strategy, has_solar=has_solar,
        weekday_flags=weekday_flags,
    )
    cost = compute_plan_cost(rows)
    recs = build_recommendations(rows)
    return DayAheadResponse(
        strategy=strategy,
        rows=[DispatchRow(**r) for r in rows],
        cost=CostBreakdown(**cost),
        recommendations=[Recommendation(**r) for r in recs],
    )


class IntradayRequest(BaseModel):
    soc_pct: float = 60.0
    grid_available_mw: float = PRACTICAL_GRID_KW / 1000.0
    actual_now_mw: float | None = None
    plan_now_mw: float | None = None


@router.post("/api/intraday/alerts", response_model=RecommendationsResponse)
def intraday_alerts(req: IntradayRequest):
    series = get_forecast_series("6h")
    alert_items = detect_intraday_alerts(
        series,
        current_state={"soc_pct": req.soc_pct},
        grid_available_mw=req.grid_available_mw,
        actual_now_mw=req.actual_now_mw,
        plan_now_mw=req.plan_now_mw,
    )
    return RecommendationsResponse(
        recommendations=[Recommendation(**a) for a in alert_items],
    )
