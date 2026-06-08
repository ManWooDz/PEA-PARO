import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import plan_store


def _steps():
    return [
        {"datetime": "2025-12-29T00:00:00", "diesel_a_mw": 0.0, "diesel_c_mw": 4.0,
         "diesel8_units_on": 0, "diesel9_units_on": 2, "battery_mw": 1.0},
        {"datetime": "2025-12-29T00:15:00", "diesel_a_mw": 5.0, "diesel_c_mw": 0.0,
         "diesel8_units_on": 1, "diesel9_units_on": 0, "battery_mw": -2.0},
    ]


def test_store_and_get_plan_keys_by_hhmm():
    plan_store.clear()
    uploaded_at = plan_store.store_plan(_steps())
    plan = plan_store.get_plan()
    assert plan is not None
    assert plan["uploaded_at"] == uploaded_at
    assert plan["n_steps"] == 2
    assert set(plan["by_hhmm"].keys()) == {"00:00", "00:15"}
    assert plan["by_hhmm"]["00:00"] == {"diesel_a_mw": 0.0, "diesel_c_mw": 4.0, "battery_mw": 1.0}
    assert plan["by_hhmm"]["00:15"]["battery_mw"] == -2.0   # charging kept signed
    plan_store.clear()


def test_clear_empties_plan():
    plan_store.store_plan(_steps())
    plan_store.clear()
    assert plan_store.get_plan() is None


from datetime import datetime, timedelta
from models.recommendation import detect_plan_sufficiency


def _loads(values):
    base = datetime(2025, 12, 28, 9, 0)
    return [(base + timedelta(minutes=15 * i), v) for i, v in enumerate(values)]


def test_sufficiency_flags_first_breach():
    # plan supplies diesel 2 MW at every slot; grid avail 5 MW → capacity 7 MW.
    loads = _loads([6.0, 6.5, 9.0, 6.0])     # step 2 (09:30) exceeds 7
    grid_avail = [5.0, 5.0, 5.0, 5.0]
    plan = {f"{t.strftime('%H:%M')}": {"diesel_a_mw": 0.0, "diesel_c_mw": 2.0, "battery_mw": 0.0}
            for t, _ in loads}
    alerts = detect_plan_sufficiency(loads, plan, grid_avail)
    assert len(alerts) == 1
    assert alerts[0]["device"] == "Day-Ahead Plan"
    assert alerts[0]["severity"] == "warn"
    assert "09:30" in alerts[0]["reason"]


def test_sufficiency_silent_when_capacity_ample():
    loads = _loads([6.0, 6.0, 6.0])
    grid_avail = [5.0, 5.0, 5.0]
    plan = {f"{t.strftime('%H:%M')}": {"diesel_a_mw": 0.0, "diesel_c_mw": 5.0, "battery_mw": 0.0}
            for t, _ in loads}
    assert detect_plan_sufficiency(loads, plan, grid_avail) == []


def test_sufficiency_empty_plan_returns_empty():
    loads = _loads([99.0, 99.0])
    assert detect_plan_sufficiency(loads, {}, [1.0, 1.0]) == []


def test_sufficiency_skips_unplanned_slots():
    # All slots are over-cap, but only 09:00 has a plan entry → the alert (if any)
    # can only come from a planned slot; the unplanned 09:15/09:30 are skipped.
    loads = _loads([9.0, 9.0, 9.0])
    grid_avail = [5.0, 5.0, 5.0]
    plan = {"09:00": {"diesel_a_mw": 0.0, "diesel_c_mw": 2.0, "battery_mw": 0.0}}
    alerts = detect_plan_sufficiency(loads, plan, grid_avail)
    assert len(alerts) == 1
    assert "09:00" in alerts[0]["reason"]   # the only planned slot, which breaches (9 > 7)
