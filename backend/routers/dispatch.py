"""
Dispatch router.
GET  /api/dispatch/{strategy}       — pre-built strategies (static profile)
POST /api/forecast-dispatch         — LSTM forecast → merit-order dispatch plan
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from models.schemas import (
    DispatchPlan, DispatchRow, CostBreakdown,
    ForecastDispatchRequest, ForecastDispatchResponse, ForecastPoint96,
    ApplyPlanRequest, ApplyPlanResponse,
)
from models.dispatch_optimizer import build_dispatch_plan, compute_plan_cost
from data.clock import now as sim_now

router = APIRouter(tags=["dispatch"])

_ACTIVE_PLAN: dict | None = None

VALID_STRATEGIES = {"baseline", "min-cost", "reliability", "eco"}


@router.post("/api/dispatch/apply", response_model=ApplyPlanResponse)
def apply_plan(req: ApplyPlanRequest):
    global _ACTIVE_PLAN
    plan_id = uuid.uuid4().hex[:12]
    applied_at = datetime.now().isoformat(timespec="seconds")
    _ACTIVE_PLAN = {
        "plan_id":   plan_id,
        "strategy":  req.strategy,
        "applied_at": applied_at,
        "horizon_hours": req.horizon_hours,
    }
    return ApplyPlanResponse(
        plan_id=plan_id,
        strategy=req.strategy,
        applied_at=applied_at,
        message=f"Dispatch plan '{req.strategy}' applied for {req.horizon_hours}h horizon.",
    )


@router.get("/api/dispatch/active")
def get_active_plan():
    return _ACTIVE_PLAN or {"plan_id": None, "strategy": None}


@router.get("/api/dispatch/{strategy}", response_model=DispatchPlan)
def get_dispatch(strategy: str, has_solar: bool = False):
    if strategy not in VALID_STRATEGIES:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown strategy '{strategy}'. Valid: {VALID_STRATEGIES}",
        )
    rows_raw = build_dispatch_plan(strategy=strategy, has_solar=has_solar)
    cost_raw = compute_plan_cost(rows_raw)
    return DispatchPlan(
        strategy=strategy,
        rows=[DispatchRow(**r) for r in rows_raw],
        cost=CostBreakdown(**cost_raw),
    )


@router.post("/api/forecast-dispatch", response_model=ForecastDispatchResponse)
def forecast_and_dispatch(body: ForecastDispatchRequest):
    """
    Run LSTM forecast for Island C, then build optimal dispatch plan.

    Flow:
      1. Load recent historical data (cached from CSV).
      2. Run LSTM → 96-step (15-min) load forecast with safety margin.
      3. Aggregate 96×15min → 24×hourly (mean of 4 steps per hour).
      4. Run merit-order dispatch optimizer with real forecast as load input.
      5. Return forecast + dispatch plan + cost breakdown.

    The dispatch plan uses the conservative (safety-margin) forecast when
    use_margin=True so operators never under-provision supply.
    """
    if body.strategy not in VALID_STRATEGIES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown strategy '{body.strategy}'. Valid: {VALID_STRATEGIES}",
        )
    if body.horizon not in ("24h", "6h"):
        raise HTTPException(
            status_code=422, detail="horizon must be '24h' or '6h'."
        )

    # 1 & 2 — Forecast (served from the precomputed LSTM+Margin forecast CSV via
    #         forecast_store, so it matches the day-ahead plan and the frozen demo
    #         clock — same source Tab2 uses, deterministic, no live TF inference).
    from data.forecast_store import get_forecast_series
    try:
        series = get_forecast_series("6h")[:24] if body.horizon == "6h" \
            else get_forecast_series("7day")[:96]
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    forecast_pts = [
        {
            "datetime":     p["datetime"],
            "load_mw":      round(float(p["predicted"] or 0.0), 3),
            "load_mw_safe": round(float(p["predicted_safe"] or 0.0), 3),
        }
        for p in series
    ]

    # 3 — Aggregate 15-min → hourly (24 values regardless of horizon)
    #     Use safe forecast for dispatch; raw for display
    n_pts    = len(forecast_pts)                   # 96 or 24
    step     = 4 if body.horizon == "24h" else 1   # 4×15min = 1h; 1×15min for 6h kept as-is
    n_hours  = min(24, n_pts // step)

    load_key = "load_mw_safe" if body.use_margin else "load_mw"
    margin_mw = 0.0
    if forecast_pts:
        margin_mw = round(
            forecast_pts[0]["load_mw_safe"] - forecast_pts[0]["load_mw"], 4
        )

    forecast_24h_kw: list[float] = []
    for h in range(n_hours):
        window = forecast_pts[h * step: (h + 1) * step]
        avg_mw = sum(pt[load_key] for pt in window) / len(window)
        forecast_24h_kw.append(avg_mw * 1000)      # MW → kW

    # Pad to 24 hours if 6h horizon (dispatch covers full day)
    if len(forecast_24h_kw) < 24:
        last_val = forecast_24h_kw[-1] if forecast_24h_kw else 3200.0
        forecast_24h_kw += [last_val] * (24 - len(forecast_24h_kw))

    # 4 — Merit-order dispatch with real forecast
    rows_raw = build_dispatch_plan(
        strategy=body.strategy,
        forecast_kw=forecast_24h_kw,
    )
    cost_raw = compute_plan_cost(rows_raw)

    return ForecastDispatchResponse(
        forecast_15min=[ForecastPoint96(**pt) for pt in forecast_pts],
        dispatch_hourly=[DispatchRow(**r) for r in rows_raw],
        cost=CostBreakdown(**cost_raw),
        margin_mw=margin_mw if body.use_margin else 0.0,
        strategy=body.strategy,
        horizon=body.horizon,
        generated_at=sim_now().isoformat(),
    )
