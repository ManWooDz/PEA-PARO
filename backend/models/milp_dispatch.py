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
_BAT_CHARGE_TARGET_MWH    = 0.80 * _BAT_CAP_MWH   # baseline charges only to 80% (leaves headroom)
_BAT_BASELINE_CHARGE_RATE = 0.5                   # baseline charges at 50% of max power (conservative)
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


def _grid_cap_at(grid_cap, t: int) -> float:
    """Per-step main-grid availability cap (MW), clamped to the physical cable limit.
    grid_cap None → the full physical _GRID_CAP."""
    if grid_cap is not None and t < len(grid_cap):
        return min(max(0.0, float(grid_cap[t])), _GRID_CAP)
    return _GRID_CAP


def solve_milp(loads_a, loads_b, loads_c, timestamps, *, dt_hours, init_soc_pct=65.0, grid_cap=None):
    """Solve the dispatch MILP. Inputs are per-step lists (MW) + datetimes.

    grid_cap: optional per-step main-grid availability (MW) that bounds grid import each
    step (clamped to the physical cable limit). None → the full physical limit.
    Returns one DispatchRow-compatible dict per step (system asset schedule + line6_mw).
    Raises RuntimeError if the solver does not reach optimality.
    """
    T = len(loads_a)
    p = pulp.LpProblem("dispatch", pulp.LpMinimize)

    grid = [pulp.LpVariable(f"grid_{t}", lowBound=0, upBound=_grid_cap_at(grid_cap, t)) for t in range(T)]
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


def _units_on(power, cap):
    return int(-(-power // cap)) if power > _DIESEL_ON_MW else 0   # ceil(power/cap)


def plan_cost_token(rows) -> float:
    """Total Token cost of a plan (sum of token_per_hour)."""
    return round(sum(r["token_per_hour"] for r in rows), 1)


def aggregate_to_hourly(rows):
    """Collapse sub-hourly rows into one row per (day, hour): power fields = mean,
    token_per_hour = SUM (energy adds up), SoC = end-of-hour (last), units_on = max,
    status = the worst (most severe) status in the hour."""
    _SEV = {"normal": 0, "grid-limited": 1, "diesel": 2, "line6-near": 3, "low-soc": 4}
    groups: dict[tuple, list] = {}
    order: list[tuple] = []
    for r in rows:
        key = (r["day"], r["hour"])
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(r)

    out = []
    mean_fields = ("load_mw", "grid_mw", "battery_mw", "diesel_a_mw",
                   "diesel_c_mw", "solar_mw", "line6_mw")
    for key in order:
        g = groups[key]
        n = len(g)
        row = {"day": key[0], "hour": key[1]}
        for f in mean_fields:
            row[f] = round(sum(x[f] for x in g) / n, 3)
        row["token_per_hour"] = round(sum(x["token_per_hour"] for x in g), 1)
        row["soc_pct"] = g[-1]["soc_pct"]
        row["diesel8_units_on"] = max(x["diesel8_units_on"] for x in g)
        row["diesel9_units_on"] = max(x["diesel9_units_on"] for x in g)
        row["status"] = max((x["status"] for x in g), key=lambda s: _SEV.get(s, 0))
        out.append(row)
    return out


def solve_baseline(loads_a, loads_b, loads_c, timestamps, *, dt_hours, init_soc_pct=65.0, grid_cap=None):
    """Deterministic network-greedy baseline ('แผนปัจจุบัน') on the SAME network — no
    look-ahead. Decide the battery's naive fixed schedule first (charge in its window,
    discharge in its window), route grid downstream to C (capped by cable 6 / cable A->B
    with Diesel #9 covering C's remainder), then cover the A-side balance with grid
    (capped by availability) and Diesel #8. Node balance is exact each step.
    grid_cap: optional per-step main-grid availability (MW). None → physical limit.
    Returns rows in the same shape as solve_milp for a fair cost comparison.
    """
    soc_mwh = init_soc_pct / 100.0 * _BAT_CAP_MWH
    discharged = {}   # per-date MWh discharged
    day0 = timestamps[0].date()
    rows = []
    for t in range(len(loads_a)):
        ts = timestamps[t]
        la, lb, lc = loads_a[t], loads_b[t], loads_c[t]

        # 1) Battery naive schedule (decided BEFORE grid so node A balances exactly).
        bdis = bch = 0.0
        if _is_charge(ts):
            headroom = max(0.0, _BAT_CHARGE_TARGET_MWH - soc_mwh) / dt_hours
            bch = min(_BAT_POWER_MW * _BAT_BASELINE_CHARGE_RATE, headroom)
        elif _is_discharge(ts):
            avail = max(0.0, soc_mwh - _BAT_FLOOR_MWH) / dt_hours
            budget_left = (_BAT_DAILY_MWH - discharged.get(ts.date(), 0.0)) / dt_hours
            bdis = max(0.0, min(_BAT_POWER_MW, avail, budget_left, la + lb + lc))

        # 2) Cable flow to C: grid via Line 6 (cheap), Diesel #9 covers the remainder.
        f_bc = min(_BC_CAP, lc)
        d9 = min(_D9_UNITS * _D9_CAP, max(0.0, lc - f_bc))
        f_bc = lc - d9
        f_ab = lb + f_bc
        if f_ab > _AB_CAP:                       # A->B cable clip -> push deficit to Diesel #9
            extra = f_ab - _AB_CAP
            f_ab = _AB_CAP
            f_bc = max(0.0, f_bc - extra)
            d9 = min(_D9_UNITS * _D9_CAP, lc - f_bc)
            f_bc = lc - d9

        # 3) Node A balance: grid_A + d8 + bdis = la + bch + f_ab
        grid_needed = la + bch + f_ab - bdis
        grid_A = min(_grid_cap_at(grid_cap, t), max(0.0, grid_needed))
        d8 = min(_D8_UNITS * _D8_CAP, max(0.0, grid_needed - grid_A))

        soc_mwh = min(_BAT_CAP_MWH, max(0.0, soc_mwh + (bch - bdis) * dt_hours))
        discharged[ts.date()] = discharged.get(ts.date(), 0.0) + bdis * dt_hours
        socp = soc_mwh / _BAT_CAP_MWH * 100.0
        token = dt_hours * _MW_TO_KW * (
            grid_A * _grid_rate(ts) + bdis * _C_BAT + d8 * _C_D8 + d9 * _C_D9
        )
        rows.append({
            "hour": ts.hour, "day": (ts.date() - day0).days,
            "load_mw": round(la + lb + lc, 3), "grid_mw": round(grid_A, 3),
            "battery_mw": round(bdis - bch, 3), "diesel_a_mw": round(d8, 3),
            "diesel_c_mw": round(d9, 3), "solar_mw": 0.0, "soc_pct": round(socp, 1),
            "token_per_hour": round(token, 1),
            "status": _status(grid_A, f_bc, d8, d9, socp),
            "diesel8_units_on": _units_on(d8, _D8_CAP),
            "diesel9_units_on": _units_on(d9, _D9_CAP),
            "line6_mw": round(f_bc, 3),
        })
    return rows
