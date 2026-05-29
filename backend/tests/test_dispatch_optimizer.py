# backend/tests/test_dispatch_optimizer.py
"""
Tests for the reality-aligned dispatch optimizer.
Merit order: Grid (~1.3 MW) → Battery (discharge window) → Diesel ⑨ → Diesel ⑧
"""
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.dispatch_optimizer import build_dispatch_plan, compute_plan_cost, build_multi_day_plan
from data.seed import PRACTICAL_GRID_KW, LINE6_LIMIT_KW_PHYSICAL


# ── Helpers ───────────────────────────────────────────────────────────────────
FLAT_LOAD_3MW = [3_000.0] * 24   # 3 MW flat — well above practical grid limit


# ── Task 1: Grid is capped at practical limit, not physical limit ─────────────

def test_grid_never_exceeds_practical_limit():
    """Grid supply must not exceed PRACTICAL_GRID_KW (~1300) in any hour."""
    rows = build_dispatch_plan(forecast_kw=FLAT_LOAD_3MW)
    for r in rows:
        assert r["grid_mw"] * 1000 <= PRACTICAL_GRID_KW + 1, (
            f"Hour {r['hour']}: grid {r['grid_mw']*1000:.0f} kW > practical limit {PRACTICAL_GRID_KW}"
        )


def test_grid_physical_cap_still_respected():
    """grid_available_kw override must not exceed the physical 8 MW cable limit."""
    rows = build_dispatch_plan(
        forecast_kw=[9_000.0] * 24,  # 9 MW demand
        grid_available_kw=LINE6_LIMIT_KW_PHYSICAL,  # pass max physical
    )
    for r in rows:
        assert r["grid_mw"] <= 8.0 + 0.001, (
            f"Hour {r['hour']}: grid {r['grid_mw']:.3f} MW > physical 8 MW cap"
        )


# ── Task 2: Battery discharges BEFORE Diesel ⑨ during 09:00–21:59 ─────────────

def test_battery_dispatched_before_diesel9_in_discharge_window():
    """
    When load > grid during 09:00–21:59, battery should discharge before Diesel ⑨
    starts (given initial SOC is high enough).
    """
    rows = build_dispatch_plan(
        forecast_kw=FLAT_LOAD_3MW,
        initial_soc_pct=80.0,
    )
    for r in rows:
        hour = r["hour"]
        if 9 <= hour <= 21:
            # If battery is discharging, diesel9 should be lower OR zero
            bat_mw = r["battery_mw"]
            d9_mw  = r["diesel_c_mw"]
            # When battery covers all remaining demand, diesel9 should be 0
            remaining_after_grid = r["load_mw"] - r["grid_mw"]
            if bat_mw >= remaining_after_grid - 0.01:
                assert d9_mw < 0.01, (
                    f"Hour {hour}: battery covers demand but Diesel ⑨ still runs ({d9_mw} MW)"
                )


def test_battery_does_not_discharge_outside_window():
    """Battery must not discharge during 22:00–08:59 (charge window)."""
    rows = build_dispatch_plan(forecast_kw=FLAT_LOAD_3MW, initial_soc_pct=90.0)
    for r in rows:
        hour = r["hour"]
        if hour < 9 or hour >= 22:
            assert r["battery_mw"] <= 0.0, (
                f"Hour {hour} is charge window but battery discharging: {r['battery_mw']} MW"
            )


# ── Task 3: Diesel ⑨ covers what battery cannot ────────────────────────────────

def test_diesel9_covers_remaining_after_battery():
    """
    Total supply = grid + battery + diesel9 + diesel8 should equal load (within ramp tolerance).
    """
    rows = build_dispatch_plan(forecast_kw=FLAT_LOAD_3MW)
    for r in rows:
        total_supply = (
            r["grid_mw"] +
            max(0.0, r["battery_mw"]) +
            r["diesel_c_mw"] +
            r["diesel_a_mw"]
        )
        assert abs(total_supply - r["load_mw"]) < 0.5, (
            f"Hour {r['hour']}: supply {total_supply:.3f} MW ≠ load {r['load_mw']:.3f} MW (gap > 0.5 MW)"
        )


def test_diesel8_only_used_when_diesel9_insufficient():
    """
    Diesel ⑧ (Island A, most expensive) must be 0 whenever Diesel ⑨ alone
    can cover the post-grid, post-battery remainder (load ≤ 1.3 + 5 MW = 6.3 MW).
    """
    load_within_d9_cap = [5_000.0] * 24   # 5 MW — grid (1.3) + diesel9 (5) = 6.3 MW > 5
    rows = build_dispatch_plan(forecast_kw=load_within_d9_cap)
    for r in rows:
        assert r["diesel_a_mw"] < 0.01, (
            f"Hour {r['hour']}: Diesel ⑧ should be 0 but got {r['diesel_a_mw']} MW"
        )


# ── Task 4: grid_available_kw override works ────────────────────────────────────

def test_grid_available_kw_override():
    """Passing grid_available_kw=3000 should allow up to 3 MW from grid."""
    rows = build_dispatch_plan(
        forecast_kw=[4_000.0] * 24,
        grid_available_kw=3_000.0,
    )
    for r in rows:
        assert r["grid_mw"] * 1000 <= 3_000.0 + 1, (
            f"Hour {r['hour']}: grid {r['grid_mw']*1000:.0f} kW > 3000 kW override"
        )
        # And must not exceed physical line 6 cap
        assert r["grid_mw"] <= 8.0 + 0.001


# ── Task 5: cost aggregation ───────────────────────────────────────────────────

def test_compute_plan_cost_returns_positive_totals():
    rows = build_dispatch_plan(forecast_kw=FLAT_LOAD_3MW)
    cost = compute_plan_cost(rows)
    assert cost["total_thb"] > 0
    assert cost["diesel_thb"] > 0      # Diesel ⑨ must be running
    assert cost["grid_thb"] >= 0
    assert cost["battery_thb"] >= 0


# --- Multi-day plan -----------------------------------------------------------

def test_multi_day_plan_row_count_and_day_index():
    """7 วัน × 24 ชม. = 168 แถว, มี field 'day' 0..6 และ hour 0..23."""
    forecast_kw = [3_000.0] * (24 * 7)
    rows = build_multi_day_plan(forecast_kw, days=7)
    assert len(rows) == 168
    assert rows[0]["day"] == 0 and rows[0]["hour"] == 0
    assert rows[-1]["day"] == 6 and rows[-1]["hour"] == 23
    for d in range(7):
        day_rows = [r for r in rows if r["day"] == d]
        assert any(r["battery_mw"] > 0.01 for r in day_rows), f"day {d} no battery discharge"


def test_multi_day_carries_soc_between_days():
    """day 1 ต้องเริ่มจาก SoC ปลายวัน 0 จริง — พิสูจน์ด้วยการรัน day เดี่ยวอิสระแล้วต้องตรงกัน."""
    forecast_kw = [3_000.0] * (24 * 2)
    rows = build_multi_day_plan(forecast_kw, days=2, initial_soc_pct=70.0)
    day0 = [r for r in rows if r["day"] == 0]
    day1 = [r for r in rows if r["day"] == 1]
    day0_last_soc = day0[-1]["soc_pct"]
    # Independent single-day run seeded with day0's terminal SoC must reproduce day1 exactly.
    independent = build_dispatch_plan(
        strategy="min-cost", forecast_kw=[3_000.0] * 24, initial_soc_pct=day0_last_soc,
    )
    assert day1[0]["soc_pct"] == independent[0]["soc_pct"]
    assert day1[12]["soc_pct"] == independent[12]["soc_pct"]
