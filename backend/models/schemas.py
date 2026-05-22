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
    status: Literal["normal", "warning", "critical"]


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
    line6_util_pct: float          # frontend: kpi.line6_util_pct
    battery_soc_pct: float
    battery_soc_mwh: float         # frontend: kpi.battery_soc_mwh
    warning_level: Literal["normal", "watch", "high"]
    warning_label_th: str
    risk_score: int


class RealtimeResponse(BaseModel):
    kpi: RealtimeKPI
    lines: list[LineStatus]
    sources: list[SourceCard]
    status: str                    # frontend: rt.status → "normal"|"warning"|"critical"
    server_time: str


class LoadPoint(BaseModel):
    ts: str                        # ISO datetime "YYYY-MM-DDTHH:MM:SS"
    hour: int                      # 0-23
    load_mw: float | None          # MW (was load_kw)


class LoadHistoryResponse(BaseModel):
    points: list[LoadPoint]


class EnergyMixPoint(BaseModel):
    ts: str                        # ISO datetime (was hour: str like "09")
    grid_mw: float                 # MW (was grid_kw)
    battery_mw: float              # MW (was battery_kw)
    diesel_a_mw: float             # MW (was diesel_a_kw)
    diesel_c_mw: float             # MW (was diesel_c_kw)


class EnergyMixResponse(BaseModel):
    points: list[EnergyMixPoint]


# ── Tab 2 dispatch ───────────────────────────────────────────────────────────
class DispatchRow(BaseModel):
    hour: int                      # 0-23 integer (was "00:00" string)
    load_mw: float                 # MW (was load_kw)
    grid_mw: float                 # MW (was grid_kw)
    battery_mw: float              # MW +discharge/-charge (was battery_kw)
    diesel_a_mw: float             # MW (was diesel_a_kw)
    diesel_c_mw: float             # MW (was diesel_c_kw)
    soc_pct: float                 # % (was battery_soc_pct)
    token_per_hour: float          # Token/hr — unchanged
    status: Literal["normal", "diesel", "low-soc", "grid-high", "line6-near"]
    diesel8_units_on: int
    diesel9_units_on: int


class CostBreakdown(BaseModel):
    grid_thb: float                # ฿ (was grid_tokens)
    battery_thb: float             # ฿ (was battery_tokens)
    diesel_thb: float              # ฿ combined A+C (was diesel_a_tokens + diesel_c_tokens)
    total_thb: float               # ฿ (was total_tokens)


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
    ts: str                        # ISO datetime
    load_mw: float                 # MW (was load_kw)
    conf_high: float               # upper confidence bound (was hi_kw)
    conf_low: float                # lower confidence bound (was lo_kw)


class ModelInfo(BaseModel):
    name: str
    mae_mw: float
    rmse_mw: float
    conf_band_mw: float


class ForecastResponse(BaseModel):
    points: list[ForecastPoint]
    model: ModelInfo               # typed (was model_info: dict)


class ForecastDay(BaseModel):
    date: str                      # "YYYY-MM-DD"
    peak_mw: float
    avg_mw: float
    min_mw: float


class Forecast7DayResponse(BaseModel):
    days: list[ForecastDay]        # frontend: week.days[]
    model: ModelInfo


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
