"""
Endpoints for actionable recommendations.

GET  /api/forecast/series?horizon=7day|6h   — forecast + actual series (CSV)
GET  /api/dispatch/day-ahead                 — multi-day plan + recommendations
POST /api/intraday/alerts                    — early-warning alerts (T1/T2/T3)
"""
import logging
import tempfile, os, csv, io
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel

from data.forecast_store import get_forecast_series, compute_accuracy
from data.loader import get_grid_availability
from data.clock import now as sim_now
from data.seed import PRACTICAL_GRID_KW
from models.dispatch_optimizer import compute_plan_cost
from models.milp_dispatch import solve_milp, solve_baseline, aggregate_to_hourly
from models.scenario import evaluate_scenarios
from models.recommendation import build_recommendations, detect_intraday_alerts
from models.schemas import (
    ForecastSeriesResponse, ForecastSeriesPoint,
    Recommendation, RecommendationsResponse, DispatchRow, CostBreakdown,
    ScenarioResult, ScenariosResponse,
    ScheduleStep, ScheduleResponse,
    RecostRequest, RecostResponse, RecostWarning,
    ApplyScheduleRequest, ApplyScheduleResponse, ActivePlanResponse,
)
from models.schedule_edit import recost as recost_schedule
from models.plan_store import store_plan, get_plan
from ml.capabilities import regenerate_available
from ml.forecast_pipeline import generate_forecasts
from scripts.generate_forecasts import load_input_history
from models.schemas import CapabilitiesResponse, RegenerateResponse

_log = logging.getLogger(__name__)

router = APIRouter(tags=["recommendations"])

# day-ahead supports only baseline (reference) and min-cost (AI-optimized).
# "reliability" was dropped; "custom" plans use the separate /api/dispatch/custom endpoint.
VALID_STRATEGIES = {"baseline", "min-cost"}
_STEPS_PER_DAY = 96   # 15-min steps in 24h
_STEPS_PER_HOUR = 4   # 15-min steps in 1h
_INTRADAY_STEPS = 6 * _STEPS_PER_HOUR   # next 6h window (24 × 15-min) for early-warning


def _predicted_safe(pt) -> float:
    """LSTM+Margin forecast value for a series point, 0.0 if missing."""
    v = pt.get("predicted_safe")
    return float(v) if v is not None else 0.0


def _island_loads(horizon: str, n_steps: int, *, step: str) -> tuple[list[float], list[float], list[float], list[datetime]]:
    """Return (loads_a, loads_b, loads_c, timestamps) for the first n_steps.
    step='15min' uses raw 15-min points; step='hourly' averages 4×15-min → hourly.
    """
    sa = get_forecast_series(horizon, island="A")
    sb = get_forecast_series(horizon, island="B")
    sc = get_forecast_series(horizon, island="C")

    if step == "15min":
        a = [_predicted_safe(p) for p in sa[:n_steps]]
        b = [_predicted_safe(p) for p in sb[:n_steps]]
        c = [_predicted_safe(p) for p in sc[:n_steps]]
        ts = [datetime.fromisoformat(str(sa[i]["datetime"])) for i in range(min(n_steps, len(sa)))]
    else:  # hourly
        a, b, c, ts = [], [], [], []
        for h in range(n_steps):
            w = slice(h * _STEPS_PER_HOUR, (h + 1) * _STEPS_PER_HOUR)
            wa, wb, wc = sa[w], sb[w], sc[w]
            if not wa or not wb or not wc:
                break
            a.append(sum(_predicted_safe(p) for p in wa) / len(wa))
            b.append(sum(_predicted_safe(p) for p in wb) / len(wb))
            c.append(sum(_predicted_safe(p) for p in wc) / len(wc))
            ts.append(datetime.fromisoformat(str(wa[0]["datetime"])))
    return a, b, c, ts


def _system_dispatch(strategy: str, days: int) -> list[dict]:
    """Build the 3-island system plan. min-cost→MILP, baseline→network-greedy.
    24h (days==1) solves at 15-min then aggregates to hourly; multi-day solves hourly.
    Falls back to the greedy baseline if the MILP solver fails."""
    solver = solve_milp if strategy == "min-cost" else solve_baseline
    if days == 1:
        a, b, c, ts = _island_loads("7day", _STEPS_PER_DAY, step="15min")   # 96 × 15-min
        dt = 1.0 / _STEPS_PER_HOUR
        grid_cap = get_grid_availability(ts)   # real main-grid supply per 15-min step
        try:
            rows = solver(a, b, c, ts, dt_hours=dt, grid_cap=grid_cap)
        except Exception as exc:
            _log.warning("dispatch solver '%s' failed (%s); falling back to baseline", strategy, exc)
            rows = solve_baseline(a, b, c, ts, dt_hours=dt, grid_cap=grid_cap)
        # The 7-day series starts at 09:15, so aggregate_to_hourly produces 25
        # (day, hour) groups (first/last are partial). Slice to exactly days*24 rows.
        return aggregate_to_hourly(rows)[:days * 24]
    else:
        a, b, c, ts = _island_loads("7day", days * 24, step="hourly")
        grid_cap = get_grid_availability(ts)   # real main-grid supply per hour
        try:
            return solver(a, b, c, ts, dt_hours=1.0, grid_cap=grid_cap)[:days * 24]
        except Exception as exc:
            _log.warning("dispatch solver '%s' failed (%s); falling back to baseline", strategy, exc)
            return solve_baseline(a, b, c, ts, dt_hours=1.0, grid_cap=grid_cap)[:days * 24]


def _tomorrow_15min_loads() -> tuple[list[float], list[float], list[float], list[datetime], str]:
    """15-min loads for tomorrow (the next calendar day after the sim clock).
    Slices the 7-day forecast to tomorrow's date -> 96 points per island.
    Returns (loads_a, loads_b, loads_c, timestamps, date_str)."""
    tomorrow = (sim_now() + timedelta(days=1)).date()
    sa = get_forecast_series("7day", island="A")
    sb = get_forecast_series("7day", island="B")
    sc = get_forecast_series("7day", island="C")

    idx = [i for i, p in enumerate(sa)
           if datetime.fromisoformat(str(p["datetime"])).date() == tomorrow]
    if len(idx) < _STEPS_PER_DAY:
        raise HTTPException(
            status_code=503,
            detail=f"พยากรณ์ไม่ครอบคลุมวันพรุ่งนี้ ({tomorrow}) ครบ 96 ช่วง 15 นาที.",
        )
    idx = idx[:_STEPS_PER_DAY]
    if idx[-1] >= min(len(sb), len(sc)):
        raise HTTPException(
            status_code=503,
            detail="พยากรณ์ของเกาะ B/C ไม่ครอบคลุมวันพรุ่งนี้ครบ.",
        )
    a = [_predicted_safe(sa[i]) for i in idx]
    b = [_predicted_safe(sb[i]) for i in idx]
    c = [_predicted_safe(sc[i]) for i in idx]
    ts = [datetime.fromisoformat(str(sa[i]["datetime"])) for i in idx]
    return a, b, c, ts, tomorrow.isoformat()


_schedule_cache: dict = {}   # {date_str: (rows, ts)} — one entry, evicted on new day


def _solve_tomorrow_schedule() -> tuple[list[dict], list[datetime], str]:
    """Solve the min-cost 15-min schedule for tomorrow (no hourly aggregation).
    Returns (rows, timestamps, date_str). Falls back to the greedy baseline if
    the MILP solver fails.
    Caches the result within a calendar day so multiple endpoints (schedule JSON,
    schedule CSV, recost) all share the identical baseline rows."""
    # Check the cache by date BEFORE fetching forecasts so a hit skips both the
    # forecast read and the MILP solve.
    date_str = (sim_now() + timedelta(days=1)).date().isoformat()
    if date_str in _schedule_cache:
        cached_rows, cached_ts = _schedule_cache[date_str]
        return cached_rows, cached_ts, date_str
    a, b, c, ts, date_str = _tomorrow_15min_loads()
    dt = 1.0 / _STEPS_PER_HOUR
    grid_cap = get_grid_availability(ts)
    try:
        rows = solve_milp(a, b, c, ts, dt_hours=dt, grid_cap=grid_cap)
    except Exception as exc:
        _log.warning("schedule MILP failed (%s); falling back to baseline", exc)
        rows = solve_baseline(a, b, c, ts, dt_hours=dt, grid_cap=grid_cap)
    _schedule_cache.clear()            # evict any previous date
    _schedule_cache[date_str] = (rows, ts)
    return rows, ts, date_str


@router.get("/api/forecast/series", response_model=ForecastSeriesResponse)
def forecast_series(horizon: str = "7day", island: str = "C"):
    try:
        pts = get_forecast_series(horizon, island=island)
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
    # NOTE: has_solar is accepted for API compatibility but not modeled by the MILP
    # (solar remains a separate scenario — see spec future work). It has no effect here.
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


@router.get("/api/dispatch/schedule", response_model=ScheduleResponse)
def dispatch_schedule():
    """Recommended 15-min operator schedule for tomorrow (96 steps, min-cost)."""
    rows, ts, date_str = _solve_tomorrow_schedule()
    steps = [
        ScheduleStep(
            datetime=t.isoformat(),
            diesel_a_mw=r["diesel_a_mw"],
            diesel_c_mw=r["diesel_c_mw"],
            diesel8_units_on=r["diesel8_units_on"],
            diesel9_units_on=r["diesel9_units_on"],
            battery_mw=r["battery_mw"],
        )
        for t, r in zip(ts, rows)
    ]
    cost = compute_plan_cost(aggregate_to_hourly(rows))
    return ScheduleResponse(date=date_str, steps=steps, cost=CostBreakdown(**cost))


@router.get("/api/dispatch/schedule.csv")
def dispatch_schedule_csv():
    """Tomorrow's 15-min schedule as a downloadable CSV for diesel controllers."""
    rows, ts, date_str = _solve_tomorrow_schedule()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["datetime", "diesel_8_island_a_mw", "diesel_9_island_c_mw",
                "diesel_8_units", "diesel_9_units", "bess_mw"])
    for t, r in zip(ts, rows):
        w.writerow([
            t.isoformat(),
            round(r["diesel_a_mw"], 3),
            round(r["diesel_c_mw"], 3),
            r["diesel8_units_on"],
            r["diesel9_units_on"],
            round(max(0.0, r["battery_mw"]), 3),   # discharge supplied; charging shown as 0
        ])
    headers = {
        "Content-Disposition": f'attachment; filename="diesel-schedule-{date_str}.csv"',
    }
    return Response(content=buf.getvalue(), media_type="text/csv; charset=utf-8", headers=headers)


@router.post("/api/dispatch/schedule/recost", response_model=RecostResponse)
def dispatch_schedule_recost(req: RecostRequest):
    """Re-cost tomorrow's schedule after manual operator MW overrides (no MILP re-solve)."""
    rows, ts, _ = _solve_tomorrow_schedule()
    grid_cap = get_grid_availability(ts)
    try:
        cost, steps, warnings = recost_schedule(
            rows, ts, grid_cap, [o.model_dump() for o in req.overrides]
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return RecostResponse(
        cost=CostBreakdown(**cost),
        steps=[ScheduleStep(**s) for s in steps],
        warnings=[RecostWarning(**w) for w in warnings],
    )


@router.post("/api/dispatch/schedule/apply", response_model=ApplyScheduleResponse)
def apply_schedule(req: ApplyScheduleRequest):
    """Persist the operator's current plan as the active Early-Warning reference."""
    if not req.steps:
        raise HTTPException(status_code=422, detail="ไม่มีข้อมูลตารางสำหรับอัปโหลด.")
    uploaded_at = store_plan([s.model_dump() for s in req.steps])
    return ApplyScheduleResponse(uploaded_at=uploaded_at, n_steps=len(req.steps))


@router.get("/api/dispatch/schedule/active", response_model=ActivePlanResponse)
def active_schedule():
    """Report the active uploaded plan (for the UI's reference status)."""
    plan = get_plan()
    if plan is None:
        return ActivePlanResponse(uploaded=False, uploaded_at=None, n_steps=0)
    return ActivePlanResponse(uploaded=True, uploaded_at=plan["uploaded_at"], n_steps=plan["n_steps"])


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


class ScenarioRequest(BaseModel):
    soc_pct: float = 60.0


@router.post("/api/intraday/scenarios", response_model=ScenariosResponse)
def intraday_scenarios(req: ScenarioRequest):
    # Stress-test the next 6h window (24 × 15-min) against 3 fixed contingencies.
    a, b, c, ts = _island_loads("6h", _INTRADAY_STEPS, step="15min")
    grid_cap = get_grid_availability(ts)
    dt = 1.0 / _STEPS_PER_HOUR
    results = evaluate_scenarios(a, b, c, ts, grid_cap, dt_hours=dt, soc_pct=req.soc_pct)
    return ScenariosResponse(scenarios=[ScenarioResult(**r) for r in results])


class AccuracyResponse(BaseModel):
    island: str
    horizon: str
    mape_pct: float
    rmse_mw: float
    n_points: int
    within_target: bool


@router.get("/api/forecast/accuracy", response_model=AccuracyResponse)
def forecast_accuracy(island: str = "C", horizon: str = "6h"):
    try:
        data = compute_accuracy(horizon, island)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return AccuracyResponse(**data)


@router.get("/api/forecast/capabilities", response_model=CapabilitiesResponse)
def forecast_capabilities():
    """Tell the UI whether the upload→regenerate control should be shown."""
    return CapabilitiesResponse(regenerate_available=regenerate_available(), island="C")


# Forecast regeneration is C-only and TF-heavy; it may take ~30-60 s.
_MAPE_TARGET = 10.0


@router.post("/api/forecast/regenerate", response_model=RegenerateResponse)
async def regenerate_forecast(file: UploadFile = File(...)):
    """Upload a historical-load CSV and rebuild Island C's served forecast CSVs.

    Guarded: on TF-free deployments (e.g. Vercel) returns 503, never 500.
    Synchronous — the frontend uses a long timeout + spinner.
    """
    if not regenerate_available():
        raise HTTPException(
            status_code=503,
            detail="การสร้างพยากรณ์ใหม่ไม่รองรับบน deployment นี้ "
                   "(ต้องใช้ TensorFlow + โมเดล — ใช้ได้บน EC2 image เท่านั้น). "
                   "Forecast regeneration is not supported on this deployment.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    # Persist to a temp CSV so the existing parser (which takes a path) can read it.
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", suffix=".csv", delete=False) as tmp:
            tmp.write(raw)
            tmp_path = tmp.name
        try:
            hist = load_input_history(tmp_path)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

        n_rows = len(hist)
        try:
            generate_forecasts(hist)                     # writes data/forecasts/C/*.csv
        except (ValueError, FileNotFoundError) as e:
            # Too-few rows / missing artifact discovered at run time.
            raise HTTPException(status_code=422, detail=f"Regeneration failed: {e}")
        except Exception as e:                            # noqa: BLE001 — TF/runtime faults
            _log.exception("regenerate failed")
            raise HTTPException(status_code=500, detail=f"Regeneration error: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    # The served forecast just changed on disk — drop the cached series so the
    # accuracy recompute (and the app) read the freshly-written CSVs. Also evict the
    # solved-schedule cache so the day-ahead schedule/recost re-solve on the new forecast.
    get_forecast_series.cache_clear()
    _schedule_cache.clear()

    # Report the SAME metric the MAPE badge shows — LSTM+Margin (predicted_safe),
    # recomputed from the new CSVs — so the success message and the badge agree.
    acc6 = compute_accuracy("6h", "C")
    acc7 = compute_accuracy("7day", "C")
    return RegenerateResponse(
        island="C",
        mape_6h_pct=acc6["mape_pct"],
        mape_7day_pct=acc7["mape_pct"],
        within_target=acc6["within_target"],
        n_rows_in=n_rows,
        message=f"สร้างพยากรณ์ใหม่สำเร็จ — Island C · {n_rows} แถว · "
                f"MAPE 6h {acc6['mape_pct']:.2f}% / 7day {acc7['mape_pct']:.2f}% (LSTM+Margin)",
    )
