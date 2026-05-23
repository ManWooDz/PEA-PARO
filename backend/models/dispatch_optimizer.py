"""
24-hour dispatch optimizer for the 3-island cascading grid.
Merit order: Grid (cheapest) → Battery → Diesel C → Diesel A (most expensive).
Respects: Line 6 limit (8 MW), battery windows, diesel unit commitment.

Internal calculations are in kW; output is converted to MW.
"""
import numpy as np
from datetime import datetime
from data.seed import COST, LINES, ISLAND_C_LOAD_PROFILE, ISLAND_C_PEAK_KW
from models.battery import compute_battery_schedule, is_discharge_hour
from models.diesel import commit_units, make_initial_states, DIESEL_8, DIESEL_9


LINE6_LIMIT_KW = LINES[6]["limit_mw"] * 1000  # 8,000 kW


def _grid_cost(hour: int, weekday: bool = True) -> float:
    """Return grid cost (Token/kWh) based on hour and day type."""
    is_peak = (9 <= hour < 22) and weekday
    return COST["grid_peak"] if is_peak else COST["grid_offpeak"]


def _load_at_hour(hour: int, scale: float = 1.0) -> float:
    """Island C load in kW for a given hour."""
    return ISLAND_C_LOAD_PROFILE[hour % 24] * ISLAND_C_PEAK_KW * scale


def build_dispatch_plan(
    strategy: str = "min-cost",
    has_solar: bool = False,
    custom_cfg: dict | None = None,
    load_scale: float = 1.0,
    initial_soc_pct: float = 65.0,
    weekday: bool = True,
    forecast_kw: list[float] | None = None,
) -> list[dict]:
    """
    Build a 24-hour hourly dispatch plan.
    Returns list of DispatchRow-compatible dicts (all power values in MW).

    Args:
        forecast_kw: Optional 24-element list of hourly load values (kW).
                     When provided, replaces the static ISLAND_C_LOAD_PROFILE.
                     Use the safety-margin (conservative) forecast so dispatch
                     never under-provisions supply.
    """
    # 1. Forecast loads (kW) — use real LSTM forecast if provided
    if forecast_kw is not None and len(forecast_kw) == 24:
        loads_kw = [float(k) for k in forecast_kw]
    else:
        loads_kw = [_load_at_hour(h, load_scale) for h in range(24)]

    # 2. Grid allocation per strategy (kW, capped at Line 6 limit)
    if strategy == "min-cost":
        grid_first = [min(load, LINE6_LIMIT_KW) for load in loads_kw]
    elif strategy == "reliability":
        grid_first = [min(load, LINE6_LIMIT_KW * 0.90) for load in loads_kw]
    elif strategy == "eco":
        grid_first = [min(load * 0.6, LINE6_LIMIT_KW) for load in loads_kw]
    else:
        # baseline / custom
        grid_first = [min(load * 0.75, LINE6_LIMIT_KW) for load in loads_kw]

    battery_shortages = [max(0.0, loads_kw[h] - grid_first[h]) for h in range(24)]
    battery_schedule  = compute_battery_schedule(battery_shortages, initial_soc_pct=initial_soc_pct)

    # 3. Diesel unit commitment
    d8_states = make_initial_states(DIESEL_8)
    d9_states = make_initial_states(DIESEL_9)

    rows = []
    for h in range(24):
        load_kw     = loads_kw[h]
        bat         = battery_schedule[h]
        bat_kw      = max(0.0, bat["dispatch_kw"])   # positive = discharge only

        after_bat   = max(0.0, load_kw - bat_kw)
        grid_kw     = min(after_bat, LINE6_LIMIT_KW)
        after_grid  = max(0.0, after_bat - grid_kw)

        # Diesel C (Island C, cheaper) before Diesel A
        if after_grid > 0:
            d9_out, d9_states, d9_units = commit_units(after_grid, DIESEL_9, d9_states)
        else:
            d9_out   = 0.0
            d9_units = [{"unit_id": i + 1, "on": False, "output_kw": 0.0}
                        for i in range(DIESEL_9["units"])]

        remaining = max(0.0, after_grid - d9_out)
        if remaining > 0:
            d8_out, d8_states, d8_units = commit_units(remaining, DIESEL_8, d8_states)
        else:
            d8_out   = 0.0
            d8_units = [{"unit_id": i + 1, "on": False, "output_kw": 0.0}
                        for i in range(DIESEL_8["units"])]

        # Token cost for this hour
        gc       = _grid_cost(h, weekday)
        token_hr = (
            grid_kw  * gc               +
            bat_kw   * COST["battery"]  +
            d8_out   * COST["diesel_a"] +
            d9_out   * COST["diesel_c"]
        )

        # Row status
        l6_util = grid_kw / LINE6_LIMIT_KW * 100
        if bat["soc_pct"] < 20:
            status = "low-soc"
        elif l6_util > 90:
            status = "line6-near"
        elif d9_out > 0 or d8_out > 0:
            status = "diesel"
        elif l6_util > 75:
            status = "grid-high"
        else:
            status = "normal"

        # ── Output in MW (divide kW by 1000) ──────────────────────────────────
        rows.append({
            "hour":           h,                              # int 0-23
            "load_mw":        round(load_kw  / 1000, 3),
            "grid_mw":        round(grid_kw  / 1000, 3),
            "battery_mw":     round(bat["dispatch_kw"] / 1000, 3),  # +/- MW
            "diesel_a_mw":    round(d8_out   / 1000, 3),
            "diesel_c_mw":    round(d9_out   / 1000, 3),
            "soc_pct":        round(bat["soc_pct"], 1),       # renamed battery_soc_pct
            "token_per_hour": round(token_hr, 1),             # Token/hr (kWh-based)
            "status":         status,
            "diesel8_units_on": sum(1 for u in d8_units if u["on"]),
            "diesel9_units_on": sum(1 for u in d9_units if u["on"]),
        })

    return rows


def compute_plan_cost(rows: list[dict]) -> dict:
    """Aggregate ฿ costs from a 24-h plan (rows in MW)."""
    # MW * 1000 → kWh per hour; kWh * Token/kWh → Token
    grid_t = sum(r["grid_mw"]     * 1000 * _grid_cost(r["hour"]) for r in rows)
    bat_t  = sum(max(0.0, r["battery_mw"])  * 1000 * COST["battery"]   for r in rows)
    da_t   = sum(r["diesel_a_mw"] * 1000 * COST["diesel_a"]   for r in rows)
    dc_t   = sum(r["diesel_c_mw"] * 1000 * COST["diesel_c"]   for r in rows)
    total  = grid_t + bat_t + da_t + dc_t
    return {
        "grid_thb":    round(grid_t,        1),
        "battery_thb": round(bat_t,         1),
        "diesel_thb":  round(da_t + dc_t,   1),   # combined Diesel A + C
        "total_thb":   round(total,         1),
    }
