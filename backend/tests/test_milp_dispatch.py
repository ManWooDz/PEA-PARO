import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

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
