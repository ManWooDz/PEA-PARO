"""
Dispatch router.
GET  /api/dispatch/{strategy}   — pre-built strategies
POST /api/dispatch/custom       — custom plan with sliders
"""
from fastapi import APIRouter, HTTPException
from models.schemas import DispatchPlan, DispatchRow, CostBreakdown, CustomPlanRequest
from models.dispatch_optimizer import build_dispatch_plan, compute_plan_cost

router = APIRouter(prefix="/api/dispatch", tags=["dispatch"])

VALID_STRATEGIES = {"baseline", "min-cost", "reliability", "eco"}


@router.get("/{strategy}", response_model=DispatchPlan)
def get_dispatch(strategy: str):
    if strategy not in VALID_STRATEGIES:
        raise HTTPException(status_code=404, detail=f"Unknown strategy '{strategy}'. Valid: {VALID_STRATEGIES}")

    rows_raw = build_dispatch_plan(strategy=strategy)
    cost_raw = compute_plan_cost(rows_raw)

    return DispatchPlan(
        strategy=strategy,
        rows=[DispatchRow(**r) for r in rows_raw],
        cost=CostBreakdown(**cost_raw),
    )


@router.post("/custom", response_model=DispatchPlan)
def post_custom_dispatch(body: CustomPlanRequest):
    rows_raw = build_dispatch_plan(
        strategy="baseline",
        custom_cfg={"shares": body.shares, "windows": body.windows},
        has_solar=body.has_solar,
    )
    cost_raw = compute_plan_cost(rows_raw)
    return DispatchPlan(
        strategy="custom",
        rows=[DispatchRow(**r) for r in rows_raw],
        cost=CostBreakdown(**cost_raw),
    )
