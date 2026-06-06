"""Manual operator edits to the 15-min day-ahead schedule (B2).

Applies MW overrides to the recommended diesel/BESS setpoints, balances the grid
with the remainder, and re-costs the edited plan WITHOUT re-solving the MILP.
Re-costing reuses aggregate_to_hourly + compute_plan_cost so litres/startup math
stays identical to the recommended plan.
"""
import math
from datetime import timedelta

from models.milp_dispatch import (
    step_token, aggregate_to_hourly,
    _D8_CAP, _D9_CAP, _D8_UNITS, _D9_UNITS, _BAT_POWER_MW, _DIESEL_ON_MW,
)
from models.dispatch_optimizer import compute_plan_cost

_FIELDS = ("diesel_a", "diesel_c", "bess")
_D8_MAX = _D8_UNITS * _D8_CAP   # 15 MW
_D9_MAX = _D9_UNITS * _D9_CAP   # 5 MW


def parse_hhmm(s: str) -> int:
    """'HH:MM' -> minutes from midnight (allows '24:00' = 1440). Raises ValueError
    if malformed or not on the 15-minute grid."""
    parts = str(s).split(":")
    if len(parts) != 2:
        raise ValueError(f"เวลาไม่ถูกต้อง: {s}")
    try:
        h, m = int(parts[0]), int(parts[1])
    except ValueError:
        raise ValueError(f"เวลาไม่ถูกต้อง: {s}")
    total = h * 60 + m
    if total < 0 or total > 1440 or m % 15 != 0:
        raise ValueError(f"เวลาต้องเป็นช่วง 15 นาที 00:00–24:00: {s}")
    return total


def _range_for(field: str) -> tuple[float, float]:
    if field == "diesel_a":
        return 0.0, _D8_MAX
    if field == "diesel_c":
        return 0.0, _D9_MAX
    return -_BAT_POWER_MW, _BAT_POWER_MW   # bess (signed)


def validate_overrides(overrides) -> None:
    """Raise ValueError on any malformed override (bad field, window, or range)."""
    for o in overrides:
        field = o.get("field")
        if field not in _FIELDS:
            raise ValueError(f"field ไม่ถูกต้อง: {field}")
        start, end = parse_hhmm(o.get("start")), parse_hhmm(o.get("end"))
        if end <= start:
            raise ValueError(f"ช่วงเวลาไม่ถูกต้อง: {o.get('start')}–{o.get('end')}")
        lo, hi = _range_for(field)
        v = float(o.get("value_mw"))
        if v < lo - 1e-9 or v > hi + 1e-9:
            raise ValueError(f"ค่า {v} MW เกินพิกัดของ {field} ({lo}–{hi} MW)")


def _setpoints(base_rows, ts, overrides):
    """(d8, d9, bess) per step after applying overrides in order (last wins)."""
    sp = [(r["diesel_a_mw"], r["diesel_c_mw"], r["battery_mw"]) for r in base_rows]
    mins = [t.hour * 60 + t.minute for t in ts]
    for o in overrides:
        s, e = parse_hhmm(o["start"]), parse_hhmm(o["end"])
        field, val = o["field"], float(o["value_mw"])
        for i, mm in enumerate(mins):
            if s <= mm < e:
                d8, d9, b = sp[i]
                if field == "diesel_a":
                    d8 = val
                elif field == "diesel_c":
                    d9 = val
                else:
                    b = val
                sp[i] = (d8, d9, b)
    return sp


def _grid_warnings(ts, grids, grid_cap, base_grids=None):
    """Contiguous windows where the edited grid exceeds the per-step cap AND
    was worsened by the overrides relative to the baseline (grids[i] > base_grids[i]).
    If base_grids is None, all over-cap steps are flagged."""
    runs, cur = [], None
    for i in range(len(ts)):
        cap = grid_cap[i] if grid_cap is not None and i < len(grid_cap) else None
        # Flag if over cap AND (no baseline to compare, or edit increased the grid)
        edit_worsened = base_grids is None or grids[i] > base_grids[i] + 1e-6
        if cap is not None and grids[i] > cap + 1e-6 and edit_worsened:
            if cur is None:
                cur = {"s": i, "e": i, "maxg": grids[i], "cap": cap}
            cur["e"] = i
            cur["maxg"] = max(cur["maxg"], grids[i])
            cur["cap"] = min(cur["cap"], cap)
        elif cur is not None:
            runs.append(cur)
            cur = None
    if cur is not None:
        runs.append(cur)
    out = []
    for w in runs:
        end_label = (ts[w["e"]] + timedelta(minutes=15)).strftime("%H:%M")
        out.append({
            "start": ts[w["s"]].strftime("%H:%M"),
            "end": end_label,
            "kind": "grid_over_cap",
            "detail": f"grid {w['maxg']:.1f} MW > cap {w['cap']:.1f} MW",
        })
    return out


def recost(base_rows, ts, grid_cap, overrides, dt_hours: float = 0.25):
    """Apply overrides → balance grid → re-cost. Returns (cost, steps, warnings).
    cost is a CostBreakdown-shaped dict; steps are 96 ScheduleStep-shaped dicts."""
    validate_overrides(overrides)
    sp = _setpoints(base_rows, ts, overrides)

    # Compute baseline grid (before overrides) to detect edit-introduced violations
    base_grids = [
        max(0.0, r["load_mw"] - r["diesel_a_mw"] - r["diesel_c_mw"] - r["battery_mw"])
        for r in base_rows
    ]

    rows, steps, grids = [], [], []
    prev8 = prev9 = 0
    day0 = ts[0].date()
    for i, t in enumerate(ts):
        d8, d9, bess = sp[i]
        load = base_rows[i]["load_mw"]
        grid = max(0.0, load - d8 - d9 - bess)   # bess signed: charging (neg) raises grid
        d8u = math.ceil(d8 / _D8_CAP) if d8 > _DIESEL_ON_MW else 0
        d9u = math.ceil(d9 / _D9_CAP) if d9 > _DIESEL_ON_MW else 0
        start8, start9 = max(0, d8u - prev8), max(0, d9u - prev9)
        prev8, prev9 = d8u, d9u
        grids.append(grid)
        rows.append({
            "hour": t.hour, "day": (t.date() - day0).days,
            "load_mw": round(load, 3), "grid_mw": round(grid, 3),
            "battery_mw": round(bess, 3), "diesel_a_mw": round(d8, 3),
            "diesel_c_mw": round(d9, 3), "solar_mw": 0.0, "line6_mw": 0.0,
            "soc_pct": 0.0, "token_per_hour": round(step_token(dt_hours, t, grid, bess, d8, d9), 1),
            "status": "normal",
            "diesel8_units_on": d8u, "diesel9_units_on": d9u,
            "diesel8_starts": start8, "diesel9_starts": start9,
        })
        steps.append({
            "datetime": t.isoformat(),
            "diesel_a_mw": round(d8, 3), "diesel_c_mw": round(d9, 3),
            "diesel8_units_on": d8u, "diesel9_units_on": d9u,
            "battery_mw": round(bess, 3),
        })

    cost = compute_plan_cost(aggregate_to_hourly(rows))
    warnings = _grid_warnings(ts, grids, grid_cap, base_grids=base_grids)
    return cost, steps, warnings
