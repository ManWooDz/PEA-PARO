import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta
from models.milp_dispatch import solve_milp, _GRID_CAP, _AB_CAP, _BC_CAP, _BAT_CAP_MWH


def _ts(n, start="2025-12-28T09:00:00", dt_h=1.0):
    base = datetime.fromisoformat(start)
    return [base + timedelta(hours=dt_h * i) for i in range(n)]


def test_milp_balances_nodes_and_respects_cables():
    n = 4
    la = [40.0] * n; lb = [10.0] * n; lc = [3.0] * n
    rows = solve_milp(la, lb, lc, _ts(n), dt_hours=1.0, init_soc_pct=65.0)
    assert len(rows) == n
    for i, r in enumerate(rows):
        # system supply = system load (lossless)
        supply = r["grid_mw"] + r["battery_mw"] + r["diesel_a_mw"] + r["diesel_c_mw"]
        assert abs(supply - (la[i] + lb[i] + lc[i])) < 0.05
        # cable limits
        assert r["grid_mw"] <= _GRID_CAP + 1e-3
        assert r["line6_mw"] <= _BC_CAP + 1e-3


def test_milp_prefers_grid_over_diesel_when_capacity_allows():
    # Total load 53 MW << grid cap 72 and cable 6 covers C → all-grid optimal, no diesel.
    n = 3
    rows = solve_milp([40.0]*n, [10.0]*n, [3.0]*n, _ts(n), dt_hours=1.0)
    for r in rows:
        assert r["diesel_a_mw"] < 0.05 and r["diesel_c_mw"] < 0.05


def test_milp_uses_local_diesel_when_cable6_saturated():
    # Island C load 12 MW > Line 6 cap 8 → C must use Diesel #9 for the remainder.
    n = 2
    rows = solve_milp([40.0]*n, [10.0]*n, [12.0]*n, _ts(n), dt_hours=1.0)
    for r in rows:
        assert r["line6_mw"] <= _BC_CAP + 1e-3
        assert r["diesel_c_mw"] >= 12.0 - _BC_CAP - 0.05   # >= ~4 MW


def test_milp_battery_only_discharges_in_window():
    # Steps at 02:00–05:00 (charge window) → battery must NOT discharge.
    ts = _ts(4, start="2025-12-28T02:00:00", dt_h=1.0)
    rows = solve_milp([40.0]*4, [10.0]*4, [3.0]*4, ts, dt_hours=1.0)
    for r in rows:
        assert r["battery_mw"] <= 0.05   # <=0 means charging or idle, never discharging


def test_milp_grid_cap_forces_local_generation():
    # Grid capped below system load → MILP must use battery/diesel for the deficit.
    n = 4
    la, lb, lc = [45.0]*n, [11.0]*n, [3.0]*n     # total system load 59 MW
    grid_cap = [40.0]*n                          # only 40 MW main-grid available
    rows = solve_milp(la, lb, lc, _ts(n), dt_hours=1.0, grid_cap=grid_cap)
    for r in rows:
        assert r["grid_mw"] <= 40.0 + 1e-3                       # respects the availability cap
        local = max(0.0, r["battery_mw"]) + r["diesel_a_mw"] + r["diesel_c_mw"]
        assert local >= (59.0 - 40.0) - 0.1                     # covers the ~19 MW deficit

from data.forecast_store import get_forecast_series


def test_per_island_series_lengths():
    for island in ("A", "B", "C"):
        pts = get_forecast_series("7day", island=island)
        assert len(pts) == 672, f"{island} 7day must be 672 pts, got {len(pts)}"
        # every point must have a usable forecast value (catches a renamed/missing column)
        assert all(p["predicted_safe"] is not None for p in pts), f"{island} has None predicted_safe"


def test_island_loads_differ():
    a = get_forecast_series("7day", island="A")[0]["predicted_safe"]
    c = get_forecast_series("7day", island="C")[0]["predicted_safe"]
    assert a > c * 2, f"Island A ({a}) should be far larger than Island C ({c})"


def test_default_island_is_c():
    # Backward-compat: no island arg → Island C series.
    assert get_forecast_series("7day") == get_forecast_series("7day", island="C")


from models.schemas import DispatchRow


def test_dispatchrow_has_line6_field_default_zero():
    row = DispatchRow(
        hour=0, load_mw=1.0, grid_mw=1.0, battery_mw=0.0, diesel_a_mw=0.0,
        diesel_c_mw=0.0, soc_pct=50.0, token_per_hour=0.0, status="normal",
        diesel8_units_on=0, diesel9_units_on=0,
    )
    assert row.line6_mw == 0.0
    row2 = DispatchRow(**{**row.model_dump(), "line6_mw": 3.2})
    assert row2.line6_mw == 3.2


def test_milp_max_up_time_makes_sustained_double_diesel_infeasible():
    import pytest
    n = 14
    ts = _ts(n, dt_h=1.0)   # 14 hourly steps from 09:00
    # Island C load 12 MW > Line 6 cap (8) needs Diesel #9 = 4 MW = BOTH units every
    # step; max-up-time 12h forbids any unit running all 14 steps → infeasible.
    with pytest.raises(RuntimeError):
        solve_milp([40.0] * n, [10.0] * n, [12.0] * n, ts, dt_hours=1.0)


from models.milp_dispatch import aggregate_to_hourly


def test_aggregate_15min_to_hourly():
    # 8 fifteen-min steps (2 hours) → 2 hourly rows, means + last SoC.
    from datetime import timedelta
    base = datetime(2025, 12, 28, 9, 0)
    ts = [base + timedelta(minutes=15 * i) for i in range(8)]
    rows15 = [{
        "hour": t.hour, "day": 0, "load_mw": 50.0, "grid_mw": 50.0, "battery_mw": 0.0,
        "diesel_a_mw": 0.0, "diesel_c_mw": 0.0, "solar_mw": 0.0, "soc_pct": 60.0 - i,
        "token_per_hour": 10.0, "status": "normal", "diesel8_units_on": 0,
        "diesel9_units_on": 0, "line6_mw": 3.0,
    } for i, t in enumerate(ts)]
    hourly = aggregate_to_hourly(rows15)
    assert len(hourly) == 2
    assert hourly[0]["hour"] == 9 and hourly[1]["hour"] == 10
    assert abs(hourly[0]["grid_mw"] - 50.0) < 1e-6           # mean of 4
    assert abs(hourly[0]["token_per_hour"] - 40.0) < 1e-6    # SUM of 4 (cost adds up)
    assert hourly[0]["soc_pct"] == rows15[3]["soc_pct"]      # end-of-hour SoC (last)


from fastapi.testclient import TestClient


def _client():
    import main
    return TestClient(main.app)


def test_day_ahead_min_cost_returns_24_hourly_rows_with_line6():
    c = _client()
    r = c.get("/api/dispatch/day-ahead", params={"strategy": "min-cost", "days": 1})
    assert r.status_code == 200
    body = r.json()
    assert len(body["rows"]) == 24
    assert all("line6_mw" in row for row in body["rows"])
    assert body["cost"]["total_thb"] > 0


def test_day_ahead_min_cost_cheaper_than_baseline():
    c = _client()
    mc = c.get("/api/dispatch/day-ahead", params={"strategy": "min-cost", "days": 1}).json()
    bl = c.get("/api/dispatch/day-ahead", params={"strategy": "baseline", "days": 1}).json()
    assert mc["cost"]["total_thb"] <= bl["cost"]["total_thb"] + 1.0


from models.milp_dispatch import solve_baseline, plan_cost_token


def test_baseline_balances_and_respects_cables():
    n = 4
    la, lb, lc = [40.0]*n, [10.0]*n, [3.0]*n
    rows = solve_baseline(la, lb, lc, _ts(n), dt_hours=1.0, init_soc_pct=65.0)
    assert len(rows) == n
    for i, r in enumerate(rows):
        supply = r["grid_mw"] + r["battery_mw"] + r["diesel_a_mw"] + r["diesel_c_mw"]
        assert abs(supply - (la[i] + lb[i] + lc[i])) < 0.05
        assert r["line6_mw"] <= _BC_CAP + 1e-3


def test_milp_cost_not_worse_than_baseline():
    # Same forecast; MILP (global optimum) must be <= greedy baseline.
    n = 24
    ts = _ts(n, start="2025-12-28T00:00:00", dt_h=1.0)
    la = [45 + 8 * (1 if 9 <= (t.hour) <= 21 else 0) for t in ts]  # daytime peak
    lb = [11.0] * n
    lc = [3.0 + 2 * (1 if 18 <= t.hour <= 21 else 0) for t in ts]  # evening peak
    milp = plan_cost_token(solve_milp(la, lb, lc, ts, dt_hours=1.0))
    base = plan_cost_token(solve_baseline(la, lb, lc, ts, dt_hours=1.0))
    assert milp <= base + 1.0   # MILP optimal <= greedy (tiny tolerance)
