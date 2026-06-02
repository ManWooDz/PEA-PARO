# -*- coding: utf-8 -*-
"""
Intra-day contingency scenario engine.

For the current 6h window, stress-test the system by re-solving the real MILP with
one adverse change applied, and report whether the system copes plus the recommended
pre-emptive action. Each scenario is compared against a base plan (the current
optimum). See docs/superpowers/specs/2026-06-03-intraday-scenario-cards-design.md.
"""
from models.milp_dispatch import solve_milp, plan_cost_token

# Fixed, demo-tuned stress factors (not user-adjustable).
GRID_DROP = 0.20       # main-grid availability falls 20%
LOAD_SPIKE = 0.15      # system-wide load rises 15%
D9_TRIP_UNITS = 1      # Diesel #9 loses one of its two units

_SUPPORT_MARGIN_MW = 0.1     # local-support peak must exceed base by this to count as "manage"
_DIESEL_LEAD_MIN = 15        # radio + start lead time for a diesel unit

# Source labels checked for "needs pre-staging", in priority order.
_SOURCE_KEYS = (("Diesel #9", "diesel_c_mw"), ("Diesel #8", "diesel_a_mw"), ("BESS #7", "battery_mw"))

_SCENARIOS = [
    {"id": "grid-drop",  "label": "Grid อ่อนลง −20%",       "icon": "\U0001f53b", "trigger": "grid −20%",        "kind": "grid"},
    {"id": "load-spike", "label": "โหลดพุ่ง +15%",          "icon": "\U0001f4c8", "trigger": "load +15%",        "kind": "load"},
    {"id": "d9-trip",    "label": "Diesel #9 trip 1 unit", "icon": "⚙️", "trigger": "Diesel #9 −1 unit", "kind": "d9"},
]


def _peak_by_source(rows) -> dict:
    """Peak MW per local source over the window (battery counts discharge only)."""
    return {
        name: max((max(0.0, r[key]) if key == "battery_mw" else r[key] for r in rows), default=0.0)
        for name, key in _SOURCE_KEYS
    }


def _peak_support(rows) -> float:
    """Peak total local support (diesel A + diesel C + battery discharge) over the window."""
    return max(
        (r["diesel_a_mw"] + r["diesel_c_mw"] + max(0.0, r["battery_mw"]) for r in rows),
        default=0.0,
    )


def _fail_result(sc) -> dict:
    return {
        "id": sc["id"], "label": sc["label"], "icon": sc["icon"], "trigger": sc["trigger"],
        "status": "fail", "peak_support_mw": 0.0, "extra_cost_thb": 0.0, "assets": [],
        "action": "ลดโหลดที่ไม่จำเป็น / เดินดีเซลเต็มกำลังทันที", "lead_min": _DIESEL_LEAD_MIN,
    }


def _ok_result(sc, rows, base_cost, base_peak) -> dict:
    peak = _peak_by_source(rows)
    assets = [name for name, _ in _SOURCE_KEYS
              if peak[name] > base_peak[name] + _SUPPORT_MARGIN_MW]
    extra = max(0.0, plan_cost_token(rows) - base_cost)
    if assets:
        status = "manage"
        lead = _DIESEL_LEAD_MIN if any("Diesel" in a for a in assets) else 0
        action = (f"เตรียมสตาร์ท {assets[0]} ล่วงหน้า {lead} นาที" if lead
                  else f"เตรียมจ่าย {assets[0]}")
    else:
        status, lead = "safe", 0
        action = "ระบบรับมือได้ ไม่ต้องดำเนินการเพิ่ม"
    return {
        "id": sc["id"], "label": sc["label"], "icon": sc["icon"], "trigger": sc["trigger"],
        "status": status, "peak_support_mw": round(_peak_support(rows), 2),
        "extra_cost_thb": round(extra, 1), "assets": assets, "action": action, "lead_min": lead,
    }


def evaluate_scenarios(loads_a, loads_b, loads_c, timestamps, grid_cap, *, dt_hours, soc_pct=60.0):
    """Solve a base plan, then re-solve each of the 3 scenarios with its stress applied.
    Returns a list of result dicts (see _ok_result / _fail_result). A scenario that the
    MILP cannot solve is returned as a 'fail' result, never raised."""
    base = solve_milp(loads_a, loads_b, loads_c, timestamps,
                      dt_hours=dt_hours, init_soc_pct=soc_pct, grid_cap=grid_cap)
    base_cost = plan_cost_token(base)
    base_peak = _peak_by_source(base)

    results = []
    for sc in _SCENARIOS:
        la, lb, lc, gc, d9u = loads_a, loads_b, loads_c, grid_cap, None
        if sc["kind"] == "grid":
            gc = [g * (1.0 - GRID_DROP) for g in grid_cap]
        elif sc["kind"] == "load":
            la = [x * (1.0 + LOAD_SPIKE) for x in loads_a]
            lb = [x * (1.0 + LOAD_SPIKE) for x in loads_b]
            lc = [x * (1.0 + LOAD_SPIKE) for x in loads_c]
        elif sc["kind"] == "d9":
            d9u = D9_TRIP_UNITS
        try:
            rows = solve_milp(la, lb, lc, timestamps, dt_hours=dt_hours,
                              init_soc_pct=soc_pct, grid_cap=gc, d9_units=d9u)
        except RuntimeError:
            results.append(_fail_result(sc))
            continue
        results.append(_ok_result(sc, rows, base_cost, base_peak))
    return results
