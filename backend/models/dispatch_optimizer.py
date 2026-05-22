"""
24-hour dispatch optimizer for the 3-island cascading grid.
Merit order: Grid (cheapest) → Battery → Diesel C → Diesel A (most expensive).
Respects: Line 6 limit (8 MW), battery windows, diesel unit commitment.
"""
import numpy as np
from datetime import datetime
from data.seed import COST, LINES, ISLAND_C_LOAD_PROFILE, ISLAND_C_PEAK_KW
from models.battery import compute_battery_schedule, is_discharge_hour
from models.diesel import commit_units, make_initial_states, DIESEL_8, DIESEL_9


LINE6_LIMIT_KW = LINES[6]["limit_mw"] * 1000  # 8,000 kW


def _grid_cost(hour: int, weekday: bool = True) -> float:
    """Return grid cost (Token/kWh) based on hour and weekday."""
    is_peak = (9 <= hour < 22) and weekday
    return COST["grid_peak"] if is_peak else COST["grid_offpeak"]


def _load_at_hour(hour: int, scale: float = 1.0) -> float:
    return ISLAND_C_LOAD_PROFILE[hour % 24] * ISLAND_C_PEAK_KW * scale


def build_dispatch_plan(
    strategy: str = "min-cost",
    has_solar: bool = False,
    custom_cfg: dict | None = None,
    load_scale: float = 1.0,
    initial_soc_pct: float = 65.0,
    weekday: bool = True,
) -> list[dict]:
    """
    Build a 24-hour hourly dispatch plan.
    Returns list of DispatchRow-compatible dicts.
    """
    # 1. Forecast loads for 24 h
    loads_kw = [_load_at_hour(h, load_scale) for h in range(24)]

    # 2. Pre-compute battery schedule based on net shortage after grid
    if strategy == "min-cost":
        # Fill grid first up to Line 6 limit, battery covers remainder
        grid_first = [min(load, LINE6_LIMIT_KW) for load in loads_kw]
        battery_shortages = [max(0, loads_kw[h] - grid_first[h]) for h in range(24)]
    elif strategy == "reliability":
        # Reserve 20% of battery for emergencies
        grid_first = [min(load, LINE6_LIMIT_KW * 0.90) for load in loads_kw]
        battery_shortages = [max(0, loads_kw[h] - grid_first[h]) for h in range(24)]
    elif strategy == "eco":
        # Maximise battery usage during discharge window
        grid_first = [min(load * 0.6, LINE6_LIMIT_KW) for load in loads_kw]
        battery_shortages = [max(0, loads_kw[h] - grid_first[h]) for h in range(24)]
    else:
        # baseline / custom
        grid_first = [min(load * 0.75, LINE6_LIMIT_KW) for load in loads_kw]
        battery_shortages = [max(0, loads_kw[h] - grid_first[h]) for h in range(24)]

    battery_schedule = compute_battery_schedule(
        battery_shortages, initial_soc_pct=initial_soc_pct
    )

    # 3. Diesel unit commitment
    d8_states = make_initial_states(DIESEL_8)
    d9_states = make_initial_states(DIESEL_9)

    rows = []
    for h in range(24):
        load_kw = loads_kw[h]
        bat = battery_schedule[h]
        bat_dispatch = max(0, bat["dispatch_kw"])  # only positive = discharge

        # Grid fills remaining after battery
        after_battery = max(0, load_kw - bat_dispatch)
        grid_kw = min(after_battery, LINE6_LIMIT_KW)
        after_grid = max(0, after_battery - grid_kw)

        # Diesel C (cheaper) first, then Diesel A
        if after_grid > 0:
            d9_out, d9_states, d9_units = commit_units(after_grid, DIESEL_9, d9_states)
        else:
            d9_out = 0.0
            d9_units = [{"unit_id": i+1, "on": False, "output_kw": 0.0} for i in range(DIESEL_9["units"])]

        remaining_after_d9 = max(0, after_grid - d9_out)
        if remaining_after_d9 > 0:
            d8_out, d8_states, d8_units = commit_units(remaining_after_d9, DIESEL_8, d8_states)
        else:
            d8_out = 0.0
            d8_units = [{"unit_id": i+1, "on": False, "output_kw": 0.0} for i in range(DIESEL_8["units"])]

        # Cost
        gc = _grid_cost(h, weekday)
        token_hr = (
            grid_kw * gc +
            bat_dispatch * COST["battery"] +
            d8_out * COST["diesel_a"] +
            d9_out * COST["diesel_c"]
        )

        # Status
        line6_util = grid_kw / LINE6_LIMIT_KW * 100
        if bat["soc_pct"] < 20:
            status = "low-soc"
        elif line6_util > 90:
            status = "line6-near"
        elif d9_out > 0 or d8_out > 0:
            status = "diesel"
        elif line6_util > 75:
            status = "grid-high"
        else:
            status = "normal"

        rows.append({
            "hour": f"{h:02d}:00",
            "h": h,
            "load_kw": round(load_kw, 1),
            "grid_kw": round(grid_kw, 1),
            "battery_kw": round(bat["dispatch_kw"], 1),
            "diesel_a_kw": round(d8_out, 1),
            "diesel_c_kw": round(d9_out, 1),
            "battery_soc_pct": round(bat["soc_pct"], 1),
            "token_per_hour": round(token_hr, 1),
            "status": status,
            "diesel8_units_on": sum(1 for u in d8_units if u["on"]),
            "diesel9_units_on": sum(1 for u in d9_units if u["on"]),
            "line6_utilization_pct": round(line6_util, 1),
        })

    return rows


def compute_plan_cost(rows: list[dict]) -> dict:
    """Aggregate token costs from a 24h plan."""
    grid_t = sum(r["grid_kw"] * _grid_cost(r["h"]) for r in rows)
    bat_t  = sum(max(0, r["battery_kw"]) * COST["battery"] for r in rows)
    da_t   = sum(r["diesel_a_kw"] * COST["diesel_a"] for r in rows)
    dc_t   = sum(r["diesel_c_kw"] * COST["diesel_c"] for r in rows)
    total  = grid_t + bat_t + da_t + dc_t
    revenue = sum(r["load_kw"] * COST["sale"] for r in rows)
    return {
        "grid_tokens":       round(grid_t, 1),
        "battery_tokens":    round(bat_t, 1),
        "diesel_a_tokens":   round(da_t, 1),
        "diesel_c_tokens":   round(dc_t, 1),
        "total_tokens":      round(total, 1),
        "revenue_tokens":    round(revenue, 1),
        "net_tokens":        round(revenue - total, 1),
        "energy_grid_kwh":   round(sum(r["grid_kw"] for r in rows), 1),
        "energy_battery_kwh":round(sum(max(0, r["battery_kw"]) for r in rows), 1),
        "energy_diesel_a_kwh":round(sum(r["diesel_a_kw"] for r in rows), 1),
        "energy_diesel_c_kwh":round(sum(r["diesel_c_kw"] for r in rows), 1),
    }
