"""
Realtime router — live KPIs, grid line status, source cards.
Data is time-shifted replays from the real historical CSVs.

GET /api/realtime
GET /api/realtime/load-history
GET /api/realtime/energy-mix
"""
from collections import deque
import random

from fastapi import APIRouter
from models.schemas import (
    RealtimeResponse, RealtimeKPI, LineStatus, SourceCard, DieselUnitStatus,
    LoadHistoryResponse, LoadPoint, EnergyMixResponse, EnergyMixPoint,
    EventsResponse, EventEntry,
)
from data.seed import LINES
from data.loader import get_current_state, get_recent_24h_hourly, get_recent_12h_mix, get_blended_cost, get_solar_mw_now
from data.clock import now as sim_now, is_frozen
from models.diesel import DIESEL_8, DIESEL_9

router = APIRouter(prefix="/api/realtime", tags=["realtime"])

LINE6_LIMIT_MW = LINES[6]["limit_mw"]   # 8 MW


_EVENT_LOG: deque = deque(maxlen=20)


def _push_event(severity: str, asset: str, message: str) -> None:
    _EVENT_LOG.appendleft({
        "ts": sim_now().strftime("%Y-%m-%dT%H:%M:%S"),
        "severity": severity,
        "asset": asset,
        "message": message,
    })


# Seed with a few synthetic startup events
if not _EVENT_LOG:
    _push_event("info",  "system",    "PEA-PARO online")
    _push_event("info",  "battery_7", "BESS in standby")
    _push_event("warn",  "line_6",    "Utilization briefly hit 78 %")


def _line_status(pct: float) -> str:
    if pct >= 90: return "critical"
    if pct >= 70: return "warning"
    return "normal"


def _split_diesel_units(asset_id: str, total_kw: float, spec: dict) -> list[dict]:
    """Distribute aggregate diesel kW across N units for the realtime UI display.
    Treats a unit as ON when > 50 kW is assigned. Adds a small mock cooldown
    for unit-2 of D#8 occasionally to make the demo visually richer."""
    n_units = spec["units"]
    per_unit_max = spec["capacity_per_unit_mw"] * 1000
    units = []
    remaining = total_kw
    for i in range(n_units):
        if remaining > 50:
            out = min(remaining, per_unit_max)
            units.append({"unit_id": i + 1, "on": True, "output_mw": round(out / 1000, 2), "cooldown_remaining_min": 0})
            remaining -= out
        else:
            cd = 7 if (asset_id == "diesel_8" and i == 1 and total_kw > 100) else 0
            units.append({"unit_id": i + 1, "on": False, "output_mw": 0.0, "cooldown_remaining_min": cd})
    return units


@router.get("", response_model=RealtimeResponse)
def get_realtime():
    now = sim_now()
    s   = get_current_state()   # real CSV row at the simulation clock

    if not is_frozen() and random.random() < 0.20:
        candidates = [
            ("info",  "diesel_9", "Unit-1 generating 1.8 MW"),
            ("warn",  "line_6",  f"L6 utilization {(s['line6_mw']/8*100):.0f} %"),
            ("info",  "battery_7", f"BESS discharging at {abs(s['battery_mw']):.1f} MW"),
        ]
        sev, ast, msg = random.choice(candidates)
        _push_event(sev, ast, msg)

    blended = get_blended_cost(s)
    solar_mw = get_solar_mw_now()

    load_mw  = s["load_c_mw"]
    soc_pct  = s["soc_pct"]
    soc_mwh  = s["soc_mwh"]
    line6_mw = s["line6_mw"]
    l6_util  = line6_mw / LINE6_LIMIT_MW * 100

    # Warning level
    if l6_util >= 90 or soc_pct < 20:
        warn, warn_th = "high", "เสี่ยงสูง"
    elif l6_util >= 75 or soc_pct < 30:
        warn, warn_th = "watch", "เฝ้าระวัง"
    else:
        warn, warn_th = "normal", "ปกติ"

    risk = int(min(100, l6_util * 0.6 + (100 - soc_pct) * 0.4))
    overall_status = (
        "critical" if warn == "high"
        else "warning" if warn == "watch"
        else "normal"
    )

    kpi = RealtimeKPI(
        island_c_load_mw = round(load_mw, 2),
        line6_util_pct   = round(l6_util, 1),
        battery_soc_pct  = round(soc_pct, 1),
        battery_soc_mwh  = round(soc_mwh, 2),
        blended_cost_token_per_kwh = blended,
        solar_mw         = solar_mw,
        warning_level    = warn,
        warning_label_th = warn_th,
        risk_score       = risk,
    )

    d8_kw = s["diesel_a_mw"] * 1000
    d9_kw = s["diesel_c_mw"] * 1000
    diesel_units = (
        [DieselUnitStatus(asset="diesel_8", **u) for u in _split_diesel_units("diesel_8", d8_kw, DIESEL_8)]
        + [DieselUnitStatus(asset="diesel_9", **u) for u in _split_diesel_units("diesel_9", d9_kw, DIESEL_9)]
    )

    # Line statuses from real CSV state
    flows = {
        1: s["line1_mw"],
        2: s["line2_mw"],
        3: s["line3_mw"],
        4: s["line4_mw"],
        5: s["line5_mw"],
        6: s["line6_mw"],
    }
    lines = [
        LineStatus(
            id              = i,
            name            = LINES[i]["name"],
            limit_mw        = LINES[i]["limit_mw"],
            flow_mw         = round(flows[i], 2),
            utilization_pct = round(flows[i] / LINES[i]["limit_mw"] * 100, 1),
            status          = _line_status(flows[i] / LINES[i]["limit_mw"] * 100),
        )
        for i in range(1, 7)
    ]

    ts_str   = now.strftime("%H:%M:%S")
    bat_st   = "ok" if soc_pct > 30 else "warn" if soc_pct > 15 else "fault"
    l6_st    = "ok" if l6_util < 90 else "warn"
    d_a_val  = round(s["diesel_a_mw"], 2)
    d_c_val  = round(s["diesel_c_mw"], 2)
    main_mw  = round(s["line1_mw"] + s["line2_mw"] + s["line3_mw"], 1)

    sources = [
        SourceCard(id="line6",     name="Line 6 (Island B→C)", island="B→C",
                   value=round(line6_mw, 2), unit="MW", status=l6_st,
                   updated=ts_str, color="#6366f1"),
        SourceCard(id="battery7",  name="Battery #7",          island="A",
                   value=round(soc_pct, 1),  unit="%",  status=bat_st,
                   updated=ts_str, color="#10b981"),
        SourceCard(id="diesel8",   name="Diesel Gen #8",       island="A",
                   value=d_a_val, unit="MW",
                   status="idle" if d_a_val < 0.1 else "ok",
                   updated=ts_str, color="#f59e0b"),
        SourceCard(id="diesel9",   name="Diesel Gen #9",       island="C",
                   value=d_c_val, unit="MW",
                   status="idle" if d_c_val < 0.1 else "ok",
                   updated=ts_str, color="#ef4444"),
        SourceCard(id="main_grid", name="Main Grid",           island="Mainland",
                   value=main_mw, unit="MW", status="ok",
                   updated=ts_str, color="#0ea5e9"),
    ]

    return RealtimeResponse(
        kpi          = kpi,
        lines        = lines,
        sources      = sources,
        diesel_units = diesel_units,
        status       = overall_status,
        server_time  = ts_str,
    )


@router.get("/events", response_model=EventsResponse)
def get_events():
    return EventsResponse(events=[EventEntry(**e) for e in list(_EVENT_LOG)])


@router.get("/load-history", response_model=LoadHistoryResponse)
def get_load_history():
    pts = get_recent_24h_hourly()
    return LoadHistoryResponse(points=[
        LoadPoint(ts=p["ts"], hour=p["hour"], load_mw=p["load_mw"])
        for p in pts
    ])


@router.get("/energy-mix", response_model=EnergyMixResponse)
def get_energy_mix():
    pts = get_recent_12h_mix()
    return EnergyMixResponse(points=[
        EnergyMixPoint(
            ts         = p["ts"],
            grid_mw    = p["grid_mw"],
            battery_mw = p["battery_mw"],
            diesel_a_mw= p["diesel_a_mw"],
            diesel_c_mw= p["diesel_c_mw"],
        )
        for p in pts
    ])
