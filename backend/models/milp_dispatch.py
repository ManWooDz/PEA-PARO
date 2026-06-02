"""
MILP economic dispatch over the 3-island cascading network (PuLP + CBC).

Nodes A/B/C (island-aggregated); downstream cables grid→A→B→C with MW limits.
Co-optimizes grid import + Battery #7 + Diesel #8 + Diesel #9 to minimize total
Token cost while meeting every island's load and honoring all engineering limits.

solve_milp returns one DispatchRow-compatible dict per time step.
"""
from datetime import datetime
import pulp

from data.seed import COST, LINES, BATTERY_7, DIESEL_8, DIESEL_9

# ── Aggregated cable limits (MW) ──────────────────────────────────────────────
_GRID_CAP = LINES[1]["limit_mw"] + LINES[2]["limit_mw"] + LINES[3]["limit_mw"]  # 72
_AB_CAP   = LINES[4]["limit_mw"] + LINES[5]["limit_mw"]                          # 34
_BC_CAP   = LINES[6]["limit_mw"]                                                 # 8

# ── Asset specs ───────────────────────────────────────────────────────────────
_BAT_CAP_MWH   = BATTERY_7["capacity_mwh"]                 # 30
_BAT_POWER_MW  = BATTERY_7["capacity_mw"]                  # 12.5
_BAT_FLOOR_MWH = 0.20 * _BAT_CAP_MWH                       # 6  (20% floor)
_BAT_DAILY_MWH = BATTERY_7["daily_discharge_avg_mwh"]      # 25
_D8_UNITS, _D8_CAP = DIESEL_8["units"], DIESEL_8["capacity_per_unit_mw"]  # 3 x 5
_D9_UNITS, _D9_CAP = DIESEL_9["units"], DIESEL_9["capacity_per_unit_mw"]  # 2 x 2.5

_C_BAT = COST["battery"]    # 12
_C_D8  = COST["diesel_a"]   # 15
_C_D9  = COST["diesel_c"]   # 12

_MAX_UP_HOURS_D8 = DIESEL_8["max_up_time_hr"]   # 12
_MAX_UP_HOURS_D9 = DIESEL_9["max_up_time_hr"]   # 12

_MW_TO_KW = 1000.0          # objective is in Token (cost/kWh × kWh)
_DIESEL_ON_MW = 0.05        # output above this = a unit is producing


def _grid_rate(ts: datetime) -> float:
    is_peak = (9 <= ts.hour < 22) and (ts.weekday() < 5)
    return COST["grid_peak"] if is_peak else COST["grid_offpeak"]


def _is_discharge(ts: datetime) -> bool:
    return 9 <= ts.hour <= 21          # 09:00-21:59


def _is_charge(ts: datetime) -> bool:
    return ts.hour >= 22 or ts.hour < 9  # 22:00-08:59


def _status(g, f_bc, sd8, sd9, soc_pct) -> str:
    if soc_pct < 20:
        return "low-soc"
    if f_bc >= _BC_CAP * 0.95:
        return "line6-near"
    if sd8 > _DIESEL_ON_MW or sd9 > _DIESEL_ON_MW:
        return "diesel"
    if g >= _GRID_CAP - 1:
        return "grid-limited"
    return "normal"


def solve_milp(loads_a, loads_b, loads_c, timestamps, *, dt_hours, init_soc_pct=65.0):
    """Solve the dispatch MILP. Inputs are per-step lists (MW) + datetimes.

    Returns one DispatchRow-compatible dict per step (system asset schedule + line6_mw).
    Raises RuntimeError if the solver does not reach optimality.
    """
    T = len(loads_a)
    p = pulp.LpProblem("dispatch", pulp.LpMinimize)

    grid = [pulp.LpVariable(f"grid_{t}", lowBound=0, upBound=_GRID_CAP) for t in range(T)]
    fab  = [pulp.LpVariable(f"fab_{t}",  lowBound=0, upBound=_AB_CAP)   for t in range(T)]
    fbc  = [pulp.LpVariable(f"fbc_{t}",  lowBound=0, upBound=_BC_CAP)   for t in range(T)]
    bch  = [pulp.LpVariable(f"bch_{t}",  lowBound=0, upBound=_BAT_POWER_MW)  for t in range(T)]
    bdis = [pulp.LpVariable(f"bdis_{t}", lowBound=0, upBound=_BAT_POWER_MW)  for t in range(T)]
    soc  = [pulp.LpVariable(f"soc_{t}",  lowBound=_BAT_FLOOR_MWH, upBound=_BAT_CAP_MWH) for t in range(T)]
    d8   = [[pulp.LpVariable(f"d8_{t}_{j}", lowBound=0, upBound=_D8_CAP) for j in range(_D8_UNITS)] for t in range(T)]
    d9   = [[pulp.LpVariable(f"d9_{t}_{k}", lowBound=0, upBound=_D9_CAP) for k in range(_D9_UNITS)] for t in range(T)]
    on8  = [[pulp.LpVariable(f"on8_{t}_{j}", cat="Binary") for j in range(_D8_UNITS)] for t in range(T)]
    on9  = [[pulp.LpVariable(f"on9_{t}_{k}", cat="Binary") for k in range(_D9_UNITS)] for t in range(T)]

    init_soc = init_soc_pct / 100.0 * _BAT_CAP_MWH

    for t in range(T):
        ts = timestamps[t]
        sd8, sd9 = pulp.lpSum(d8[t]), pulp.lpSum(d9[t])
        # node balance (lossless)
        p += grid[t] + sd8 + bdis[t] == loads_a[t] + bch[t] + fab[t]
        p += fab[t] == loads_b[t] + fbc[t]
        p += fbc[t] + sd9 == loads_c[t]
        # battery SoC dynamics
        prev = init_soc if t == 0 else soc[t - 1]
        p += soc[t] == prev + (bch[t] - bdis[t]) * dt_hours
        # battery windows
        if not _is_charge(ts):
            p += bch[t] == 0
        if not _is_discharge(ts):
            p += bdis[t] == 0
        # diesel capacity gating
        for j in range(_D8_UNITS):
            p += d8[t][j] <= _D8_CAP * on8[t][j]
        for k in range(_D9_UNITS):
            p += d9[t][k] <= _D9_CAP * on9[t][k]

    # battery daily discharge budget (per calendar date)
    for d in sorted({ts.date() for ts in timestamps}):
        idxs = [t for t in range(T) if timestamps[t].date() == d]
        p += pulp.lpSum(bdis[t] * dt_hours for t in idxs) <= _BAT_DAILY_MWH

    # diesel max-up-time: in any window of W+1 steps, sum(on) <= W  (W = max-up in steps)
    for onv, n, max_up in ((on8, _D8_UNITS, _MAX_UP_HOURS_D8), (on9, _D9_UNITS, _MAX_UP_HOURS_D9)):
        W = max(1, int(round(max_up / dt_hours)))
        for u in range(n):
            for s in range(0, T - W):
                p += pulp.lpSum(onv[t][u] for t in range(s, s + W + 1)) <= W

    # objective - total Token cost
    p += pulp.lpSum(
        dt_hours * _MW_TO_KW * (
            grid[t] * _grid_rate(timestamps[t])
            + bdis[t] * _C_BAT
            + pulp.lpSum(d8[t]) * _C_D8
            + pulp.lpSum(d9[t]) * _C_D9
        )
        for t in range(T)
    )

    p.solve(pulp.PULP_CBC_CMD(msg=0))
    if pulp.LpStatus[p.status] != "Optimal":
        raise RuntimeError(f"MILP not optimal: {pulp.LpStatus[p.status]}")

    day0 = timestamps[0].date()
    rows = []
    for t in range(T):
        ts = timestamps[t]
        g = grid[t].value() or 0.0
        b = (bdis[t].value() or 0.0) - (bch[t].value() or 0.0)
        sd8 = sum(v.value() or 0.0 for v in d8[t])
        sd9 = sum(v.value() or 0.0 for v in d9[t])
        f_bc = fbc[t].value() or 0.0
        socp = (soc[t].value() or 0.0) / _BAT_CAP_MWH * 100.0
        token = dt_hours * _MW_TO_KW * (
            g * _grid_rate(ts) + max(0.0, b) * _C_BAT + sd8 * _C_D8 + sd9 * _C_D9
        )
        rows.append({
            "hour": ts.hour,
            "day": (ts.date() - day0).days,
            "load_mw": round(loads_a[t] + loads_b[t] + loads_c[t], 3),
            "grid_mw": round(g, 3),
            "battery_mw": round(b, 3),
            "diesel_a_mw": round(sd8, 3),
            "diesel_c_mw": round(sd9, 3),
            "solar_mw": 0.0,
            "soc_pct": round(socp, 1),
            "token_per_hour": round(token, 1),
            "status": _status(g, f_bc, sd8, sd9, socp),
            "diesel8_units_on": sum(1 for v in d8[t] if (v.value() or 0.0) > _DIESEL_ON_MW),
            "diesel9_units_on": sum(1 for v in d9[t] if (v.value() or 0.0) > _DIESEL_ON_MW),
            "line6_mw": round(f_bc, 3),
        })
    return rows
