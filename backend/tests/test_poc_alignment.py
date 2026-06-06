import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.forecast_store import _mape, compute_accuracy


def test_mape_basic_math():
    # actual=100, pred=90 → 10% ; actual=200, pred=180 → 10% → mean 10.0
    assert _mape([(100.0, 90.0), (200.0, 180.0)]) == 10.0


def test_mape_skips_nonpositive_actual():
    # rows with actual <= 0 or None are ignored (no divide-by-zero)
    assert _mape([(0.0, 5.0), (100.0, 95.0)]) == 5.0
    assert _mape([]) == 0.0


def test_compute_accuracy_island_c_meets_target():
    acc = compute_accuracy("6h", "C")
    assert acc["island"] == "C" and acc["horizon"] == "6h"
    assert acc["n_points"] > 0
    assert 0.0 < acc["mape_pct"] < 7.0       # 6h LSTM+Margin rolling backtest ≈ 5.0%
    assert acc["within_target"] is True


from models.dispatch_optimizer import compute_plan_cost
from data.seed import DIESEL_L_PER_KWH


def test_compute_plan_cost_diesel_litres():
    # Two hourly rows, total diesel = (2+1)+(0+3) = 6 MWh → 6000 kWh × 0.27 = 1620 L
    rows = [
        {"grid_mw": 1, "battery_mw": 0, "diesel_a_mw": 2, "diesel_c_mw": 1,
         "hour": 0, "token_per_hour": 0},
        {"grid_mw": 1, "battery_mw": 0, "diesel_a_mw": 0, "diesel_c_mw": 3,
         "hour": 1, "token_per_hour": 0},
    ]
    cost = compute_plan_cost(rows)
    assert cost["diesel_litres"] == round(6 * 1000 * DIESEL_L_PER_KWH, 1)   # 1620.0


from fastapi.testclient import TestClient


def _client():
    import main
    return TestClient(main.app)


def test_accuracy_endpoint_returns_within_target():
    c = _client()
    r = c.get("/api/forecast/accuracy", params={"island": "C", "horizon": "6h"})
    assert r.status_code == 200
    body = r.json()
    assert body["within_target"] is True
    assert 0.0 < body["mape_pct"] < 7.0      # LSTM+Margin ≈ 5.0%
    assert body["n_points"] > 0


def test_forecast_series_per_island():
    c = _client()
    # Island A load is far larger than Island C → distinct series.
    a = c.get("/api/forecast/series", params={"horizon": "6h", "island": "A"})
    cc = c.get("/api/forecast/series", params={"horizon": "6h", "island": "C"})
    assert a.status_code == 200 and cc.status_code == 200
    a_first = a.json()["points"][0]["predicted"]
    c_first = cc.json()["points"][0]["predicted"]
    assert a_first > 15.0          # Island A >> Island C
    assert c_first < 8.0
    # default (no island) stays Island C (backward compat)
    d = c.get("/api/forecast/series", params={"horizon": "6h"})
    assert d.json()["points"][0]["predicted"] == c_first
    # bad island → 422
    assert c.get("/api/forecast/series", params={"horizon": "6h", "island": "Z"}).status_code == 422


def test_compute_plan_cost_per_island_litres():
    # diesel A = 2+0 = 2 MWh; diesel C = 1+3 = 4 MWh.
    rows = [
        {"grid_mw": 1, "battery_mw": 0, "diesel_a_mw": 2, "diesel_c_mw": 1,
         "hour": 0, "token_per_hour": 0},
        {"grid_mw": 1, "battery_mw": 0, "diesel_a_mw": 0, "diesel_c_mw": 3,
         "hour": 1, "token_per_hour": 0},
    ]
    cost = compute_plan_cost(rows)
    assert cost["diesel_a_litres"] == round(2 * 1000 * DIESEL_L_PER_KWH, 1)   # 540.0
    assert cost["diesel_c_litres"] == round(4 * 1000 * DIESEL_L_PER_KWH, 1)   # 1080.0
    # per-island parts sum to the existing total
    assert round(cost["diesel_a_litres"] + cost["diesel_c_litres"], 1) == cost["diesel_litres"]


from data.seed import DIESEL_8_STARTUP_LITRES, DIESEL_9_STARTUP_LITRES


def test_diesel_startup_constants_from_ramp():
    # #8: t_ramp=1/0.01=100s; energy=0.5*(100/3600)*5=0.0694 MWh; *1000*0.27 ≈ 18.75 L
    assert abs(DIESEL_8_STARTUP_LITRES - 18.75) < 0.2
    # #9: t_ramp=1/0.03=33.3s; energy=0.5*(33.3/3600)*2.5=0.01157 MWh; *1000*0.27 ≈ 3.12 L
    assert abs(DIESEL_9_STARTUP_LITRES - 3.12) < 0.2


def test_compute_plan_cost_folds_startup_litres():
    # One Diesel-#9 start + steady Diesel-#8: startup litres added to the C island total.
    rows = [
        {"grid_mw": 1, "battery_mw": 0, "diesel_a_mw": 2, "diesel_c_mw": 0,
         "hour": 0, "token_per_hour": 0, "diesel8_starts": 1, "diesel9_starts": 0},
        {"grid_mw": 1, "battery_mw": 0, "diesel_a_mw": 2, "diesel_c_mw": 1,
         "hour": 1, "token_per_hour": 0, "diesel8_starts": 0, "diesel9_starts": 1},
    ]
    cost = compute_plan_cost(rows)
    # diesel A energy = 4 MWh → 1080 L, + 1 start × 18.75
    assert cost["diesel_a_litres"] == round(4 * 1000 * DIESEL_L_PER_KWH + DIESEL_8_STARTUP_LITRES, 1)
    # diesel C energy = 1 MWh → 270 L, + 1 start × 3.12
    assert cost["diesel_c_litres"] == round(1 * 1000 * DIESEL_L_PER_KWH + DIESEL_9_STARTUP_LITRES, 1)
    assert cost["diesel_litres"] == round(cost["diesel_a_litres"] + cost["diesel_c_litres"], 1)


def test_schedule_schemas_construct():
    from models.schemas import ScheduleStep, ScheduleResponse
    step = ScheduleStep(
        datetime="2025-12-29T00:00:00",
        diesel_a_mw=0.0, diesel_c_mw=4.0,
        diesel8_units_on=0, diesel9_units_on=2, battery_mw=1.2,
    )
    resp = ScheduleResponse(date="2025-12-29", steps=[step])
    assert resp.date == "2025-12-29"
    assert resp.steps[0].diesel9_units_on == 2


def test_schedule_endpoint_returns_96_steps():
    c = _client()
    r = c.get("/api/dispatch/schedule")
    assert r.status_code == 200
    body = r.json()
    assert body["date"] == "2025-12-29"          # tomorrow of frozen clock 2025-12-28
    assert len(body["steps"]) == 96
    s0 = body["steps"][0]
    assert s0["datetime"].endswith("T00:00:00")  # first step is midnight
    for k in ("diesel_a_mw", "diesel_c_mw", "diesel8_units_on",
              "diesel9_units_on", "battery_mw"):
        assert k in s0
