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
