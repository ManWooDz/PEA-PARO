"""Pydantic v2 response schemas for all API endpoints."""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Literal


# ── Shared ───────────────────────────────────────────────────────────────────
class LineStatus(BaseModel):
    id: int
    name: str
    limit_mw: float
    flow_mw: float
    utilization_pct: float
    status: Literal["normal", "warning", "critical"]  # <70 / 70-90 / >90 %


class SourceCard(BaseModel):
    id: str
    name: str
    island: str
    value: float
    unit: str
    status: Literal["ok", "warn", "idle", "fault"]
    updated: str
    color: str


# ── Tab 1 realtime ───────────────────────────────────────────────────────────
class RealtimeKPI(BaseModel):
    island_c_load_mw: float
    line6_utilization_pct: float
    battery_soc_pct: float
    warning_level: Literal["normal", "watch", "high"]
    warning_label_th: str
    risk_score: int


class RealtimeResponse(BaseModel):
    kpi: RealtimeKPI
    lines: list[LineStatus]
    sources: list[SourceCard]
    server_time: str


class LoadPoint(BaseModel):
    t_label: str
    hour: int
    offset: int          # <0 = past, 0 = now, >0 = forecast
    load_kw: float | None
    forecast_kw: float | None


class LoadHistoryResponse(BaseModel):
    points: list[LoadPoint]


class EnergyMixPoint(BaseModel):
    hour: str
    grid_kw: float
    battery_kw: float
    diesel_a_kw: float
    diesel_c_kw: float


class EnergyMixResponse(BaseModel):
    points: list[EnergyMixPoint]


# ── Tab 2 dispatch ───────────────────────────────────────────────────────────
class DispatchRow(BaseModel):
    hour: str           # "00:00"
    h: int
    load_kw: float
    grid_kw: float
    battery_kw: float   # positive=discharge, negative=charge
    diesel_a_kw: float
    diesel_c_kw: float
    battery_soc_pct: float
    token_per_hour: float
    status: Literal["normal", "diesel", "low-soc", "grid-high", "line6-near"]
    # Unit commitment
    diesel8_units_on: int   # 0-3
    diesel9_units_on: int   # 0-2


class CostBreakdown(BaseModel):
    grid_tokens: float
    battery_tokens: float
    diesel_a_tokens: float
    diesel_c_tokens: float
    total_tokens: float
    revenue_tokens: float
    net_tokens: float
    energy_grid_kwh: float
    energy_battery_kwh: float
    energy_diesel_a_kwh: float
    energy_diesel_c_kwh: float


class DispatchPlan(BaseModel):
    strategy: str
    rows: list[DispatchRow]
    cost: CostBreakdown


class CustomPlanRequest(BaseModel):
    shares: dict[str, float] = Field(
        default={"grid": 60, "battery": 25, "diesel_c": 10, "diesel_a": 5}
    )
    windows: dict[str, list[int]] = Field(
        default={"grid": [0, 24], "battery": [9, 22], "diesel_c": [18, 22], "diesel_a": [19, 22]}
    )
    has_solar: bool = False


# ── Tab 3 forecast ───────────────────────────────────────────────────────────
class ForecastPoint(BaseModel):
    t: int
    label: str
    load_kw: float
    hi_kw: float
    lo_kw: float


class ForecastResponse(BaseModel):
    points: list[ForecastPoint]
    model_info: dict


# ── Tab 4 alerts ─────────────────────────────────────────────────────────────
class Alert(BaseModel):
    id: int
    time: str
    level: Literal["high", "medium", "low", "resolved"]
    title: str
    detail: str
    status: Literal["open", "resolved"]
    forecast_peak_mw: float | None = None
    battery_soc_pct: float | None = None
    recommended_action: str | None = None


class AlertsResponse(BaseModel):
    alerts: list[Alert]


class ResolveRequest(BaseModel):
    action_taken: str = "operator_confirmed"
