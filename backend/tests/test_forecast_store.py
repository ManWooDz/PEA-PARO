import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.forecast_store import get_forecast_series


def test_7day_series_length_and_shape():
    pts = get_forecast_series("7day")
    assert len(pts) == 672, f"7day must have 672 points, got {len(pts)}"
    p = pts[0]
    assert set(p.keys()) == {"datetime", "actual", "predicted", "predicted_safe"}
    assert isinstance(p["datetime"], str)
    assert p["predicted_safe"] >= p["predicted"] - 1e-6


def test_6h_series_nonempty():
    pts = get_forecast_series("6h")
    assert len(pts) > 0
    assert "actual" in pts[0]


def test_invalid_horizon_raises():
    import pytest
    with pytest.raises(ValueError):
        get_forecast_series("99day")
