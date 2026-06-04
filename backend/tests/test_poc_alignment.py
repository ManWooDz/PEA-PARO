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
    acc = compute_accuracy("7day", "C")
    assert acc["island"] == "C" and acc["horizon"] == "7day"
    assert acc["n_points"] > 0
    assert 0.0 < acc["mape_pct"] < 15.0      # actual CSV yields ~10.4%; confirm sane range
    assert isinstance(acc["within_target"], bool)


from fastapi.testclient import TestClient


def _client():
    import main
    return TestClient(main.app)


def test_accuracy_endpoint_returns_within_target():
    c = _client()
    r = c.get("/api/forecast/accuracy", params={"island": "C", "horizon": "7day"})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["within_target"], bool)
    assert 0.0 < body["mape_pct"] < 15.0      # actual CSV yields ~10.4%
    assert body["n_points"] > 0
