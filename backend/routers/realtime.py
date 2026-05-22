"""
Realtime router — live KPIs, grid line status, source cards.
GET /api/realtime
GET /api/realtime/load-history
GET /api/realtime/energy-mix
"""
import random
import math
from datetime import datetime
from fastapi import APIRouter
from models.schemas import (
    RealtimeResponse, RealtimeKPI, LineStatus, SourceCard,
    LoadHistoryResponse, LoadPoint, EnergyMixResponse, EnergyMixPoint,
)
from data.seed import LINES, ISLAND_C_LOAD_PROFILE, ISLAND_C_PEAK_KW

router = APIRouter(prefix="/api/realtime", tags=["realtime"])

# Simulated live state (fluctuates per request with bounded random walk)
_state = {
    "line6_flow_kw": 5800.0,
    "battery_soc": 62.0,
    "diesel9_kw": 0.0,
    "diesel8_kw": 0.0,
}


def _nudge(val: float, lo: float, hi: float, sigma: float) -> float:
    return max(lo, min(hi, val + random.gauss(0, sigma)))


def _line_status(flow_mw: float, limit_mw: float) -> str:
    pct = flow_mw / limit_mw * 100
    if pct >= 90:  return "critical"
    if pct >= 70:  return "warning"
    return "normal"


@router.get("", response_model=RealtimeResponse)
def get_realtime():
    now = datetime.now()
    h   = now.hour

    # Simulated live fluctuations
    base_load = ISLAND_C_LOAD_PROFILE[h] * ISLAND_C_PEAK_KW
    _state["line6_flow_kw"] = _nudge(_state["line6_flow_kw"], 1000, 7800, 120)
    _state["battery_soc"]   = _nudge(_state["battery_soc"],   10, 95, 0.4)

    load_mw = _state["line6_flow_kw"] / 1000
    soc     = _state["battery_soc"]
    line6   = _state["line6_flow_kw"]

    # Warning level
    util = line6 / (LINES[6]["limit_mw"] * 1000) * 100
    if util >= 90 or soc < 20:
        warn, warn_th = "high", "เสี่ยงสูง"
    elif util >= 75 or soc < 30:
        warn, warn_th = "watch", "เฝ้าระวัง"
    else:
        warn, warn_th = "normal", "ปกติ"

    risk = int(min(100, util * 0.6 + (100 - soc) * 0.4))

    kpi = RealtimeKPI(
        island_c_load_mw=round(load_mw, 2),
        line6_utilization_pct=round(util, 1),
        battery_soc_pct=round(soc, 1),
        warning_level=warn,
        warning_label_th=warn_th,
        risk_score=risk,
    )

    # Line statuses (simulated flows)
    line_flows = {
        1: 22.0, 2: 18.0, 3: 8.5,
        4: 15.0, 5: 4.5,
        6: round(line6 / 1000, 2),
    }
    lines = [
        LineStatus(
            id=i,
            name=LINES[i]["name"],
            limit_mw=LINES[i]["limit_mw"],
            flow_mw=line_flows[i],
            utilization_pct=round(line_flows[i] / LINES[i]["limit_mw"] * 100, 1),
            status=_line_status(line_flows[i], LINES[i]["limit_mw"]),
        )
        for i in range(1, 7)
    ]

    sources = [
        SourceCard(id="line6",    name="Line 6 (Island B→C)", island="B→C", value=round(line6/1000,2), unit="MW",  status="ok" if util<90 else "warn", updated=now.strftime("%H:%M:%S"), color="#6366f1"),
        SourceCard(id="battery7", name="Battery #7",          island="A",   value=round(soc,1),        unit="%",   status="ok" if soc>30 else "warn",  updated=now.strftime("%H:%M:%S"), color="#10b981"),
        SourceCard(id="diesel8",  name="Diesel Gen #8",       island="A",   value=round(_state["diesel8_kw"]/1000,2), unit="MW", status="idle", updated=now.strftime("%H:%M:%S"), color="#f59e0b"),
        SourceCard(id="diesel9",  name="Diesel Gen #9",       island="C",   value=round(_state["diesel9_kw"]/1000,2), unit="MW", status="idle", updated=now.strftime("%H:%M:%S"), color="#ef4444"),
        SourceCard(id="main_grid",name="Main Grid",           island="Mainland", value=round(sum(line_flows[i] for i in [1,2,3]),1), unit="MW", status="ok", updated=now.strftime("%H:%M:%S"), color="#0ea5e9"),
    ]

    return RealtimeResponse(
        kpi=kpi,
        lines=lines,
        sources=sources,
        server_time=now.strftime("%H:%M:%S"),
    )


@router.get("/load-history", response_model=LoadHistoryResponse)
def get_load_history():
    now_h = datetime.now().hour
    points = []
    for i in range(-24, 7):
        h = (now_h + i) % 24
        base = ISLAND_C_LOAD_PROFILE[h] * ISLAND_C_PEAK_KW
        noise = random.gauss(0, base * 0.04)
        label = f"{h:02d}:00"
        points.append(LoadPoint(
            t_label=label, hour=h, offset=i,
            load_kw=round(base + noise, 1) if i <= 0 else None,
            forecast_kw=round(base + random.gauss(0, base * 0.03), 1) if i >= 0 else None,
        ))
    return LoadHistoryResponse(points=points)


@router.get("/energy-mix", response_model=EnergyMixResponse)
def get_energy_mix():
    now_h = datetime.now().hour
    points = []
    for i in range(-11, 1):
        h = (now_h + i) % 24
        load = ISLAND_C_LOAD_PROFILE[h] * ISLAND_C_PEAK_KW
        battery = max(0, load * 0.15) if 9 <= h <= 21 else 0
        diesel_c = max(0, load * 0.05) if h in [19, 20, 21] else 0
        grid = max(0, load - battery - diesel_c)
        points.append(EnergyMixPoint(
            hour=f"{h:02d}",
            grid_kw=round(grid, 1),
            battery_kw=round(battery, 1),
            diesel_a_kw=0.0,
            diesel_c_kw=round(diesel_c, 1),
        ))
    return EnergyMixResponse(points=points)
