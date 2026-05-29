import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.recommendation import build_recommendations, detect_intraday_alerts


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


def test_detects_battery_charge_start():
    rows = [
        _row(0, 1, battery_mw=0.0),
        _row(0, 2, battery_mw=-1.5),
    ]
    recs = build_recommendations(rows)
    chg = [r for r in recs if r["device"] == "BESS #7" and r["action"] == "ชาร์จ"]
    assert len(chg) == 1
    assert chg[0]["control_type"] == "radio"


def test_no_false_discharge_start_on_small_nonzero_prev():
    # prev battery 0.04 MW (below active threshold) then 1.5 MW — should still count as a start,
    # but prev 1.5 then 1.6 (already discharging) must NOT emit a new start.
    rows = [
        _row(0, 9, battery_mw=1.5),
        _row(0, 10, battery_mw=1.6),
    ]
    recs = build_recommendations(rows)
    assert [r for r in recs if r["action"] == "จ่าย"] == []


def test_multi_day_time_format_rollover():
    rows = [
        _row(0, 23, diesel_c_mw=0.0),
        _row(1, 0, diesel_c_mw=2.5, status="diesel", diesel9_units_on=1),
    ]
    recs = build_recommendations(rows)
    starts = [r for r in recs if r["device"] == "Diesel #9" and r["action"] == "สตาร์ท"]
    assert len(starts) == 1
    assert starts[0]["effect_time"] == "Day 1 00:00"
    assert starts[0]["act_time"] == "Day 0 23:45"


def test_T1_load_exceeds_grid_triggers_critical():
    forecast = [
        {"datetime": "2026-03-01T14:30:00", "predicted_safe": 1.2},
        {"datetime": "2026-03-01T14:45:00", "predicted_safe": 3.4},
    ]
    alerts = detect_intraday_alerts(
        forecast, current_state={"soc_pct": 60.0}, grid_available_mw=1.3,
    )
    t1 = [a for a in alerts if a["severity"] == "critical"]
    assert len(t1) >= 1
    assert "ดีเซล" in t1[0]["action"] or "สตาร์ท" in t1[0]["action"]
    assert t1[0]["control_type"] == "radio"
    assert t1[0]["act_time"] == "14:45"   # earliest breaching step, not the worst


def test_T2_low_soc_projection_warns():
    forecast = [{"datetime": f"2026-03-01T{h:02d}:00:00", "predicted_safe": 3.0}
                for h in range(15, 21)]
    alerts = detect_intraday_alerts(
        forecast, current_state={"soc_pct": 15.0}, grid_available_mw=1.3,
    )
    assert any(a["device"] == "BESS #7" and a["severity"] == "warn" for a in alerts)


def test_T3_actual_deviation_from_plan_warns():
    forecast = [{"datetime": "2026-03-01T14:30:00", "predicted_safe": 1.2}]
    alerts = detect_intraday_alerts(
        forecast, current_state={"soc_pct": 60.0}, grid_available_mw=1.3,
        actual_now_mw=3.0, plan_now_mw=2.0,
    )
    assert any("แผน" in a["reason"] or "re-plan" in a["action"].lower() for a in alerts)


def test_no_alerts_when_within_plan():
    forecast = [{"datetime": "2026-03-01T14:30:00", "predicted_safe": 1.0}]
    alerts = detect_intraday_alerts(
        forecast, current_state={"soc_pct": 80.0}, grid_available_mw=1.3,
        actual_now_mw=1.0, plan_now_mw=1.0,
    )
    assert alerts == []


from fastapi.testclient import TestClient


def _client():
    import main
    return TestClient(main.app)


def test_forecast_series_endpoint():
    c = _client()
    r = c.get("/api/forecast/series", params={"horizon": "7day"})
    assert r.status_code == 200
    body = r.json()
    assert body["horizon"] == "7day"
    assert len(body["points"]) == 672


def test_dayahead_endpoint_returns_plan_and_recommendations():
    c = _client()
    r = c.get("/api/dispatch/day-ahead", params={"strategy": "min-cost", "days": 1})
    assert r.status_code == 200
    body = r.json()
    assert "rows" in body and "recommendations" in body
    assert len(body["rows"]) == 24


def test_intraday_alerts_endpoint():
    c = _client()
    r = c.post("/api/intraday/alerts", json={"soc_pct": 15.0, "grid_available_mw": 1.3})
    assert r.status_code == 200
    assert "recommendations" in r.json()
