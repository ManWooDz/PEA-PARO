"""
Alerts router — driven by the recommendation engine (not hardcoded).

GET   /api/alerts              — early-warnings (intra-day T1/T2/T3) + upcoming
                                 day-ahead switching actions (warn/critical),
                                 mapped to the Alert schema the UI expects.
PATCH /api/alerts/{id}/resolve — mark an alert resolved (persists in-memory).

Alerts are generated from the simulation-clock instant, so at the frozen demo
time they are deterministic and reflect the real forecast/plan situation.
"""
import hashlib
from fastapi import APIRouter, HTTPException

from models.schemas import AlertsResponse, Alert, ResolveRequest
from data.loader import get_current_state
from data.forecast_store import get_forecast_series
from data.seed import PRACTICAL_GRID_KW
from models.recommendation import detect_intraday_alerts, build_recommendations
from models.dispatch_optimizer import build_multi_day_plan

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

_INTRADAY_STEPS = 24                       # next 6h (24 × 15-min)
_STEPS_PER_HOUR = 4
_GRID_AVAIL_MW = PRACTICAL_GRID_KW / 1000.0  # practical Line 6 availability (~1.3 MW)

_SEV_TO_LEVEL = {"critical": "high", "warn": "medium", "info": "low"}

# Content-keys of alerts the operator has resolved (in-memory; resets on restart).
_resolved_keys: set[str] = set()


def _strip_day(t: str) -> str:
    """'Day 0 17:45' → '17:45'; other labels (e.g. 'ตอนนี้') pass through."""
    if isinstance(t, str) and t.startswith("Day "):
        parts = t.split(" ")
        if len(parts) >= 3:
            return parts[-1]
    return t or ""


def _key(rec: dict) -> str:
    return f"{rec['device']}|{rec['action']}|{rec.get('effect_time', '')}"


def _alert_id(key: str) -> int:
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16)


def _gather(soc_pct: float) -> list[dict]:
    """Collect engine recommendations: intra-day early-warnings + day-ahead
    warn/critical switching, de-duplicated by content key."""
    # Intra-day early warnings (next 6h)
    series6 = list(get_forecast_series("6h"))[:_INTRADAY_STEPS]
    recs = detect_intraday_alerts(
        series6, current_state={"soc_pct": soc_pct}, grid_available_mw=_GRID_AVAIL_MW,
    )

    # Day-ahead planned switching (next 24h) — surface only warn/critical
    series7 = list(get_forecast_series("7day"))
    hourly_kw = []
    for h in range(24):
        window = series7[h * _STEPS_PER_HOUR:(h + 1) * _STEPS_PER_HOUR]
        if not window:
            break
        vals = [p["predicted_safe"] for p in window if p.get("predicted_safe") is not None]
        hourly_kw.append((sum(vals) / len(vals) if vals else 0.0) * 1000.0)
    if hourly_kw:
        plan = build_multi_day_plan(hourly_kw, days=1)
        recs += [r for r in build_recommendations(plan) if r["severity"] in ("warn", "critical")]

    # De-dup by key (an intra-day diesel start may also appear in the day-ahead plan)
    seen: dict[str, dict] = {}
    for r in recs:
        seen.setdefault(_key(r), r)
    return list(seen.values())


def _to_alert(rec: dict, soc_pct: float) -> Alert:
    key = _key(rec)
    resolved = key in _resolved_keys
    level = "resolved" if resolved else _SEV_TO_LEVEL.get(rec["severity"], "low")
    title = f"{rec['device']} · {rec['action']}"
    if resolved:
        title = f"[แก้ไขแล้ว] {title}"
    detail = rec.get("reason", "")
    if rec.get("impact"):
        detail = f"{detail} · {rec['impact']}"
    eff = _strip_day(rec.get("effect_time", ""))
    return Alert(
        id=_alert_id(key),
        time=_strip_day(rec.get("act_time", "")),
        level=level,
        title=title,
        detail=detail,
        status="resolved" if resolved else "open",
        recommended_action=f"{rec['device']} · {rec['action']}" + (f" · {eff}" if eff else ""),
        battery_soc_pct=round(soc_pct, 0) if rec["device"] == "BESS #7" else None,
    )


@router.get("", response_model=AlertsResponse)
def get_alerts():
    soc = float(get_current_state().get("soc_pct", 60.0))
    alerts = [_to_alert(r, soc) for r in _gather(soc)]
    return AlertsResponse(alerts=alerts)


@router.patch("/{alert_id}/resolve", response_model=AlertsResponse)
def resolve_alert(alert_id: int, body: ResolveRequest):
    soc = float(get_current_state().get("soc_pct", 60.0))
    for r in _gather(soc):
        if _alert_id(_key(r)) == alert_id:
            _resolved_keys.add(_key(r))
            return get_alerts()
    raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
