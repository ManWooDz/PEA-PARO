import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta
import pytest
from models.milp_dispatch import solve_milp


def _ts(n, start="2025-12-28T09:00:00", dt_h=1.0):
    base = datetime.fromisoformat(start)
    return [base + timedelta(hours=dt_h * i) for i in range(n)]


def test_d9_units_override_default_matches_no_arg():
    # Passing the default unit counts explicitly must not change the result.
    n = 4
    la, lb, lc = [40.0]*n, [10.0]*n, [3.0]*n
    base = solve_milp(la, lb, lc, _ts(n), dt_hours=1.0)
    same = solve_milp(la, lb, lc, _ts(n), dt_hours=1.0, d8_units=None, d9_units=None)
    assert base == same


def test_d9_units_one_caps_island_c_diesel():
    # Island C load 11 MW; Line 6 cap 8 → C needs ~3 MW from Diesel #9.
    # With only ONE unit (2.5 MW) that is impossible → solver infeasible → RuntimeError.
    # Battery #7 sits on Island A and cannot cross Line 6, so nothing else can fill C's gap.
    n = 2
    with pytest.raises(RuntimeError):
        solve_milp([40.0]*n, [10.0]*n, [11.0]*n, _ts(n), dt_hours=1.0, d9_units=1)


def test_d9_units_two_explicit_feasible():
    # Same load with both units available (explicit =2) must stay feasible.
    n = 2
    rows = solve_milp([40.0]*n, [10.0]*n, [11.0]*n, _ts(n), dt_hours=1.0, d9_units=2)
    assert len(rows) == n
    for r in rows:
        assert r["diesel_c_mw"] >= 11.0 - 8.0 - 0.05   # >= ~3 MW from Diesel #9


def test_negative_units_rejected():
    import pytest
    with pytest.raises(ValueError):
        solve_milp([40.0]*2, [10.0]*2, [3.0]*2, _ts(2), dt_hours=1.0, d9_units=-1)
