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
from models.dispatch_optimizer import compute_plan_cost
from models.milp_dispatch import solve_milp, solve_baseline, aggregate_to_hourly, plan_cost_token
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
_INTRADAY_STEPS = 6 * _STEPS_PER_HOUR   # next 6h window (24 × 15-min) for early-warning


def _island_loads(horizon: str, n_steps: int, *, step: str):
    """Return (loads_a, loads_b, loads_c, timestamps) for the first n_steps.
    step='15min' uses raw 15-min points; step='hourly' averages 4×15-min → hourly.
    """
    sa = get_forecast_series(horizon, island="A")
    sb = get_forecast_series(horizon, island="B")
    sc = get_forecast_series(horizon, island="C")

    def _safe(pt):
        v = pt.get("predicted_safe")
        return float(v) if v is not None else 0.0

    if step == "15min":
        a = [_safe(p) for p in sa[:n_steps]]
        b = [_safe(p) for p in sb[:n_steps]]
        c = [_safe(p) for p in sc[:n_steps]]
        ts = [datetime.fromisoformat(str(sa[i]["datetime"])) for i in range(min(n_steps, len(sa)))]
    else:  # hourly
        a, b, c, ts = [], [], [], []
        for h in range(n_steps):
            w = slice(h * _STEPS_PER_HOUR, (h + 1) * _STEPS_PER_HOUR)
            wa, wb, wc = sa[w], sb[w], sc[w]
            if not wa:
                break
            a.append(sum(_safe(p) for p in wa) / len(wa))
            b.append(sum(_safe(p) for p in wb) / len(wb))
            c.append(sum(_safe(p) for p in wc) / len(wc))
            ts.append(datetime.fromisoformat(str(wa[0]["datetime"])))
    return a, b, c, ts


def _system_dispatch(strategy: str, days: int) -> list[dict]:
    """Build the 3-island system plan. min-cost→MILP, baseline→network-greedy.
    24h (days==1) solves at 15-min then aggregates to hourly; multi-day solves hourly.
    Falls back to the greedy baseline if the MILP solver fails."""
    solver = solve_milp if strategy == "min-cost" else solve_baseline
    if days == 1:
        a, b, c, ts = _island_loads("7day", _STEPS_PER_DAY, step="15min")   # 96 × 15-min
        dt = 0.25
        try:
            rows = solver(a, b, c, ts, dt_hours=dt)
        except Exception:
            rows = solve_baseline(a, b, c, ts, dt_hours=dt)
        return aggregate_to_hourly(rows)[:days * 24]
    else:
        a, b, c, ts = _island_loads("7day", days * 24, step="hourly")
        try:
            return solver(a, b, c, ts, dt_hours=1.0)[:days * 24]
        except Exception:
            return solve_baseline(a, b, c, ts, dt_hours=1.0)[:days * 24]


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
    rows = _system_dispatch(strategy, days)
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
    # Only the next 6h (the 6h CSV is a long continuous backtest, not a 6h slice).
    series = get_forecast_series("6h")[:_INTRADAY_STEPS]
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
