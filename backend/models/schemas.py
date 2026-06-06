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


class EventEntry(BaseModel):
    ts: str                                       # ISO datetime
    severity: Literal["info", "warn", "critical"]
    asset: str                                    # e.g. "diesel_9", "line_6", "battery_7"
    message: str                                  # human-readable


class EventsResponse(BaseModel):
    events: list[EventEntry]


class WeatherPoint(BaseModel):
    ts: str                          # ISO hour
    solar_irradiance_w_m2: float     # POA (plane-of-array) when tilt/azimuth set
    cloud_cover_pct: float
    temperature_c: float = 25.0      # ambient air temperature (for NOCT model)


class WeatherResponse(BaseModel):
    lat: float
    lon: float
    points: list[WeatherPoint]       # next 24 hours hourly


class DieselUnitStatus(BaseModel):
    asset: Literal["diesel_8", "diesel_9"]
    unit_id: int
    on: bool
    output_mw: float
    cooldown_remaining_min: int


# ── Tab 1 realtime ───────────────────────────────────────────────────────────
class RealtimeKPI(BaseModel):
    island_c_load_mw: float
    line6_util_pct: float          # frontend: kpi.line6_util_pct
    battery_soc_pct: float
    battery_soc_mwh: float         # frontend: kpi.battery_soc_mwh
    blended_cost_token_per_kwh: float
    solar_mw: float = 0.0                # NEW: derived from /api/weather
    warning_level: Literal["normal", "watch", "high"]
    warning_label_th: str
    risk_score: int


class RealtimeResponse(BaseModel):
    kpi: RealtimeKPI
    lines: list[LineStatus]
    sources: list[SourceCard]
    diesel_units: list[DieselUnitStatus]
    status: str                    # frontend: rt.status → "normal"|"warning"|"critical"
    server_time: str               # "HH:MM:SS"
    server_datetime: str = ""      # full ISO of the (sim) clock — drives the TopBar clock


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
    solar_mw: float = 0.0          # NEW: 0 unless has_solar=True
    soc_pct: float                 # % (was battery_soc_pct)
    token_per_hour: float          # Token/hr — unchanged
    status: Literal["normal", "diesel", "low-soc", "grid-limited", "line6-near"]
    diesel8_units_on: int
    diesel9_units_on: int
    day: int = 0                   # 0-indexed day offset (multi-day plans); single-day = 0
    line6_mw: float = 0.0          # MW flowing through Line 6 to Island C (MILP plans)


class CostBreakdown(BaseModel):
    grid_thb: float                # ฿ (was grid_tokens)
    battery_thb: float             # ฿ (was battery_tokens)
    diesel_thb: float              # ฿ combined A+C (was diesel_a_tokens + diesel_c_tokens)
    diesel_litres: float = 0.0     # diesel fuel volume (litres) — assumption-based
    diesel_a_litres: float = 0.0   # Diesel #8 (Island A) fuel volume (litres)
    diesel_c_litres: float = 0.0   # Diesel #9 (Island C) fuel volume (litres)
    total_thb: float               # ฿ (was total_tokens)


class DispatchPlan(BaseModel):
    strategy: str
    rows: list[DispatchRow]
    cost: CostBreakdown


class ScheduleStep(BaseModel):
    datetime:          str    # ISO-8601 e.g. "2025-12-29T00:15:00"
    diesel_a_mw:       float  # Diesel #8 (Island A) output MW
    diesel_c_mw:       float  # Diesel #9 (Island C) output MW
    diesel8_units_on:  int    # Diesel #8 units committed this step
    diesel9_units_on:  int    # Diesel #9 units committed this step
    battery_mw:        float  # +discharge / -charge MW


class ScheduleResponse(BaseModel):
    date:  str                # "YYYY-MM-DD" of tomorrow
    steps: list[ScheduleStep] # 96 x 15-min steps (00:00 -> 23:45)


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


# ── ML Forecast-Dispatch (combined endpoint) ──────────────────────────────────

class ForecastDispatchRequest(BaseModel):
    strategy:   str  = Field(default="min-cost",
                             description="'min-cost' | 'reliability' | 'eco'")
    horizon:    str  = Field(default="24h",
                             description="'24h' (96 steps) or '6h' (24 steps)")
    use_margin: bool = Field(default=True,
                             description="Apply conservative safety margin to forecast "
                                         "before building dispatch plan")


class ForecastPoint96(BaseModel):
    """Single 15-min forecast point returned in forecast_15min list."""
    datetime:      str    # ISO-8601 e.g. "2026-02-15T00:00:00"
    load_mw:       float  # raw LSTM prediction
    load_mw_safe:  float  # + safety margin (conservative)


class ForecastDispatchResponse(BaseModel):
    forecast_15min:  list[ForecastPoint96]  # 96 points (24h) or 24 points (6h)
    dispatch_hourly: list[DispatchRow]      # 24-hour merit-order plan (MW)
    cost:            CostBreakdown          # total & per-source Token cost
    margin_mw:       float                  # safety margin applied (0 if use_margin=False)
    strategy:        str
    horizon:         str
    generated_at:    str                    # ISO datetime of when plan was built


class ApplyPlanRequest(BaseModel):
    strategy: str                          # 'baseline' | 'min-cost' | 'reliability' | 'eco' | 'custom'
    horizon_hours: int = 24
    custom_cfg: dict | None = None


class ApplyPlanResponse(BaseModel):
    plan_id: str                           # uuid4 hex (12 chars)
    strategy: str
    applied_at: str                        # ISO datetime
    message: str


# ── Recommendations ────────────────────────────────────────────────────────
class Recommendation(BaseModel):
    act_time:     str
    effect_time:  str
    severity:     Literal["info", "warn", "critical"]
    device:       str
    action:       str
    reason:       str
    impact:       str
    control_type: Literal["radio", "scada"]
    day:          int = 0


class RecommendationsResponse(BaseModel):
    recommendations: list[Recommendation]


class ForecastSeriesPoint(BaseModel):
    datetime:       str
    actual:         float | None = None
    predicted:      float | None = None
    predicted_safe: float | None = None


class ForecastSeriesResponse(BaseModel):
    horizon: str
    points:  list[ForecastSeriesPoint]


class ScenarioResult(BaseModel):
    id:              str
    label:           str
    icon:            str
    trigger:         str
    status:          Literal["safe", "manage", "fail"]
    peak_support_mw: float
    extra_cost_thb:  float
    assets:          list[str]
    action:          str
    lead_min:        int


class ScenariosResponse(BaseModel):
    scenarios: list[ScenarioResult]


class CapabilitiesResponse(BaseModel):
    regenerate_available: bool
    island: str = "C"


class RegenerateResponse(BaseModel):
    island: str
    mape_6h_pct: float
    mape_7day_pct: float
    within_target: bool
    n_rows_in: int
    message: str
