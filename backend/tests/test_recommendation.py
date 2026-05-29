import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.recommendation import build_recommendations


def _row(day, hour, **kw):
    base = dict(hour=hour, day=day, load_mw=3.0, grid_mw=1.3, battery_mw=0.0,
                diesel_a_mw=0.0, diesel_c_mw=0.0, solar_mw=0.0, soc_pct=60.0,
                token_per_hour=0.0, status="normal",
                diesel8_units_on=0, diesel9_units_on=0)
    base.update(kw)
    return base


def test_detects_diesel9_start_with_radio_leadtime():
    rows = [
        _row(0, 17, diesel_c_mw=0.0),
        _row(0, 18, diesel_c_mw=2.5, status="diesel", diesel9_units_on=1),
    ]
    recs = build_recommendations(rows)
    starts = [r for r in recs if r["device"] == "Diesel #9" and r["action"] == "สตาร์ท"]
    assert len(starts) == 1
    r = starts[0]
    assert r["control_type"] == "radio"
    assert r["effect_time"] == "Day 0 18:00"
    assert r["act_time"] == "Day 0 17:45"


def test_detects_diesel9_stop():
    rows = [
        _row(0, 21, diesel_c_mw=2.5, status="diesel", diesel9_units_on=1),
        _row(0, 22, diesel_c_mw=0.0),
    ]
    recs = build_recommendations(rows)
    stops = [r for r in recs if r["device"] == "Diesel #9" and r["action"] == "ดับ"]
    assert len(stops) == 1
    assert stops[0]["control_type"] == "radio"


def test_detects_battery_discharge_start():
    rows = [
        _row(0, 8, battery_mw=0.0),
        _row(0, 9, battery_mw=1.5),
    ]
    recs = build_recommendations(rows)
    disc = [r for r in recs if r["device"] == "BESS #7" and r["action"] == "จ่าย"]
    assert len(disc) == 1
    assert disc[0]["control_type"] == "radio"


def test_grid_near_cap_is_scada_warn():
    rows = [
        _row(0, 11, status="normal"),
        _row(0, 12, status="line6-near"),
    ]
    recs = build_recommendations(rows)
    grid = [r for r in recs if r["device"] == "Line 6"]
    assert len(grid) == 1
    assert grid[0]["control_type"] == "scada"
    assert grid[0]["severity"] == "warn"


def test_stable_plan_yields_no_recommendations():
    rows = [_row(0, h) for h in range(24)]
    recs = build_recommendations(rows)
    assert recs == []
