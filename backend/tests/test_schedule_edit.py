import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta
import pytest

from models.schedule_edit import parse_hhmm, validate_overrides, recost


def _ts96():
    base = datetime(2025, 12, 29, 0, 0)
    return [base + timedelta(minutes=15 * i) for i in range(96)]


def _base_rows(ts, load=10.0, d8=0.0, d9=4.0, bess=0.0):
    return [{"load_mw": load, "diesel_a_mw": d8, "diesel_c_mw": d9, "battery_mw": bess} for _ in ts]


def test_parse_hhmm():
    assert parse_hhmm("00:00") == 0
    assert parse_hhmm("06:30") == 390
    assert parse_hhmm("24:00") == 1440
    with pytest.raises(ValueError):
        parse_hhmm("06:07")          # not on the 15-min grid


def test_validate_rejects_bad_window_and_range():
    with pytest.raises(ValueError):
        validate_overrides([{"start": "06:00", "end": "06:00", "field": "diesel_c", "value_mw": 1.0}])
    with pytest.raises(ValueError):
        validate_overrides([{"start": "00:00", "end": "06:00", "field": "diesel_c", "value_mw": 99.0}])  # > 5 MW cap
    with pytest.raises(ValueError):
        validate_overrides([{"start": "00:00", "end": "06:00", "field": "nope", "value_mw": 1.0}])


def test_recost_empty_overrides_is_identity_costwise():
    ts = _ts96()
    rows = _base_rows(ts)
    grid_cap = [100.0] * 96
    cost, steps, warnings = recost(rows, ts, grid_cap, [])
    assert len(steps) == 96
    assert warnings == []
    # grid balances: load 10 - d9 4 = 6 grid; diesel_c stays 4
    assert steps[0]["diesel_c_mw"] == 4.0
    assert cost["total_thb"] > 0


def test_recost_override_raises_diesel_cost():
    ts = _ts96()
    rows = _base_rows(ts, d9=0.0)            # baseline: no diesel C
    grid_cap = [100.0] * 96
    base_cost, _, _ = recost(rows, ts, grid_cap, [])
    cost, steps, _ = recost(rows, ts, grid_cap,
                            [{"start": "00:00", "end": "06:00", "field": "diesel_c", "value_mw": 4.0}])
    on = [s for s in steps if s["datetime"].endswith("T00:00:00")][0]
    assert on["diesel_c_mw"] == 4.0
    assert on["diesel9_units_on"] == 2          # ceil(4 / 2.5)
    assert cost["diesel_thb"] > base_cost["diesel_thb"]
    assert cost["diesel_c_litres"] > base_cost["diesel_c_litres"]


def test_recost_flags_grid_over_cap():
    ts = _ts96()
    rows = _base_rows(ts, load=10.0, d9=4.0)   # baseline grid = 10 - 4 = 6 MW
    grid_cap = [7.0] * 96                       # cap above the baseline (6) — pristine plan is within cap
    # force diesel C to 0 over one window → grid must cover the full 10 MW load > 7 cap, there only
    cost, steps, warnings = recost(rows, ts, grid_cap,
                                   [{"start": "09:00", "end": "10:00", "field": "diesel_c", "value_mw": 0.0}])
    assert any(w["kind"] == "grid_over_cap" for w in warnings)
    over = [w for w in warnings if w["kind"] == "grid_over_cap"]
    assert len(over) == 1                        # only the edited window exceeds cap
    assert over[0]["start"] == "09:00"
    assert over[0]["end"] == "10:00"             # 09:00–09:45 over cap, +15min = 10:00


def test_recost_last_override_wins_on_overlap():
    ts = _ts96()
    rows = _base_rows(ts, d9=0.0)
    grid_cap = [100.0] * 96
    # two overrides on the same field+window; the later one must win
    _, steps, _ = recost(rows, ts, grid_cap, [
        {"start": "00:00", "end": "06:00", "field": "diesel_c", "value_mw": 2.0},
        {"start": "00:00", "end": "06:00", "field": "diesel_c", "value_mw": 5.0},
    ])
    assert steps[0]["diesel_c_mw"] == 5.0


def test_recost_bess_charging_raises_grid():
    ts = _ts96()
    rows = _base_rows(ts, load=8.0, d9=0.0, bess=0.0)   # baseline grid = 8
    grid_cap = [100.0] * 96
    # charging the battery (negative bess) must INCREASE the grid draw: 8 - (-3) = 11
    cost, steps, _ = recost(rows, ts, grid_cap,
                            [{"start": "00:00", "end": "01:00", "field": "bess", "value_mw": -3.0}])
    base_cost = recost(rows, ts, grid_cap, [])[0]
    assert steps[0]["battery_mw"] == -3.0
    # charging draws extra grid energy → higher grid cost than the no-override baseline
    assert cost["grid_thb"] > base_cost["grid_thb"]


def test_recost_reuses_stored_values_for_untouched_steps():
    # Untouched steps must reuse the MILP-stored grid_mw + token_per_hour verbatim.
    # Seed deliberately-impossible stored values (that recompute would never produce)
    # and confirm they flow through with empty overrides.
    ts = _ts96()
    rows = []
    for i in range(96):
        rows.append({
            "load_mw": 10.0, "diesel_a_mw": 0.0, "diesel_c_mw": 2.5, "battery_mw": 0.0,
            "grid_mw": 99.0,          # not the 7.5 residual recompute would give
            "token_per_hour": 42.0,   # not step_token(...)
            "diesel8_starts": 0, "diesel9_starts": 0,
        })
    grid_cap = [50.0] * 96
    cost, steps, warnings = recost(rows, ts, grid_cap, [])          # empty → all untouched
    assert cost["total_thb"] == 96 * 42.0                           # stored token reused (not recomputed)
    assert any(w["kind"] == "grid_over_cap" for w in warnings)      # stored grid 99 > cap 50 (recompute → 7.5, no warn)


def test_recost_recomputes_start_after_touched_step():
    # Diesel #9 runs 1 unit all day; the MILP stored its single start at step 0.
    # Overriding step 0 OFF moves the start to the (untouched) step 1 — the stored
    # start[1]=0 must NOT be reused, or the restart would be silently dropped.
    from data.seed import DIESEL_L_PER_KWH, DIESEL_9_STARTUP_LITRES
    ts = _ts96()
    rows = []
    for i in range(96):
        rows.append({
            "load_mw": 10.0, "diesel_a_mw": 0.0, "diesel_c_mw": 2.5, "battery_mw": 0.0,
            "grid_mw": 7.5, "token_per_hour": 100.0,
            "diesel8_starts": 0, "diesel9_starts": (1 if i == 0 else 0),
        })
    grid_cap = [100.0] * 96
    cost, _, _ = recost(rows, ts, grid_cap,
                        [{"start": "00:00", "end": "00:15", "field": "diesel_c", "value_mw": 0.0}])
    # hour 0 avg diesel_c = (0 + 2.5 + 2.5 + 2.5)/4 = 1.875; hours 1-23 = 2.5 each →
    # operating MWh = 1.875 + 2.5*23 = 59.375; litres = 59.375*1000*L_per_kWh + ONE start.
    expected = round(59.375 * 1000 * DIESEL_L_PER_KWH + DIESEL_9_STARTUP_LITRES, 1)
    assert abs(cost["diesel_c_litres"] - expected) < 0.5   # would be short by 1 start if buggy
