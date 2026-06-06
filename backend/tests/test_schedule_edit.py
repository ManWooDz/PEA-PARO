import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta
import pytest

from models.schedule_edit import parse_hhmm, validate_overrides, recost


def _ts96():
    base = datetime(2025, 12, 29, 0, 0)
    return [base + timedelta(minutes=15 * i) for i in range(96)]


def _base_rows(ts, load=10.0, d8=0.0, d9=4.0, bess=0.0):
    return [{"load_mw": load, "diesel_a_mw": d8, "diesel_c_mw": d9, "battery_mw": bess} for _ in ts]


def test_parse_hhmm():
    assert parse_hhmm("00:00") == 0
    assert parse_hhmm("06:30") == 390
    assert parse_hhmm("24:00") == 1440
    with pytest.raises(ValueError):
        parse_hhmm("06:07")          # not on the 15-min grid


def test_validate_rejects_bad_window_and_range():
    with pytest.raises(ValueError):
        validate_overrides([{"start": "06:00", "end": "06:00", "field": "diesel_c", "value_mw": 1.0}])
    with pytest.raises(ValueError):
        validate_overrides([{"start": "00:00", "end": "06:00", "field": "diesel_c", "value_mw": 99.0}])  # > 5 MW cap
    with pytest.raises(ValueError):
        validate_overrides([{"start": "00:00", "end": "06:00", "field": "nope", "value_mw": 1.0}])


def test_recost_empty_overrides_is_identity_costwise():
    ts = _ts96()
    rows = _base_rows(ts)
    grid_cap = [100.0] * 96
    cost, steps, warnings = recost(rows, ts, grid_cap, [])
    assert len(steps) == 96
    assert warnings == []
    # grid balances: load 10 - d9 4 = 6 grid; diesel_c stays 4
    assert steps[0]["diesel_c_mw"] == 4.0
    assert cost["total_thb"] > 0


def test_recost_override_raises_diesel_cost():
    ts = _ts96()
    rows = _base_rows(ts, d9=0.0)            # baseline: no diesel C
    grid_cap = [100.0] * 96
    base_cost, _, _ = recost(rows, ts, grid_cap, [])
    cost, steps, _ = recost(rows, ts, grid_cap,
                            [{"start": "00:00", "end": "06:00", "field": "diesel_c", "value_mw": 4.0}])
    on = [s for s in steps if s["datetime"].endswith("T00:00:00")][0]
    assert on["diesel_c_mw"] == 4.0
    assert on["diesel9_units_on"] == 2          # ceil(4 / 2.5)
    assert cost["diesel_thb"] > base_cost["diesel_thb"]
    assert cost["diesel_c_litres"] > base_cost["diesel_c_litres"]


def test_recost_flags_grid_over_cap():
    ts = _ts96()
    rows = _base_rows(ts, load=10.0, d9=4.0)
    grid_cap = [5.0] * 96                     # cap below the 6 MW grid balance
    # force diesel C to 0 over a window → grid must cover the full 10 MW load > 5 cap
    cost, steps, warnings = recost(rows, ts, grid_cap,
                                   [{"start": "09:00", "end": "10:00", "field": "diesel_c", "value_mw": 0.0}])
    assert any(w["kind"] == "grid_over_cap" for w in warnings)
    w = [w for w in warnings if w["kind"] == "grid_over_cap"][0]
    assert w["start"] == "09:00"
