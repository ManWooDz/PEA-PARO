import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.forecast_store import get_forecast_series


def test_per_island_series_lengths():
    for island in ("A", "B", "C"):
        pts = get_forecast_series("7day", island=island)
        assert len(pts) == 672, f"{island} 7day must be 672 pts, got {len(pts)}"
        assert pts[0]["predicted_safe"] is not None


def test_island_loads_differ():
    a = get_forecast_series("7day", island="A")[0]["predicted_safe"]
    c = get_forecast_series("7day", island="C")[0]["predicted_safe"]
    assert a > c   # Island A (~48 MW) much larger than Island C (~3 MW)


def test_default_island_is_c():
    # Backward-compat: no island arg → Island C series.
    assert get_forecast_series("7day") == get_forecast_series("7day", island="C")
