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
