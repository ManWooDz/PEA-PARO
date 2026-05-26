"""
Diesel unit commitment model for Gen #8 (Island A) and Gen #9 (Island C).
Enforces: ramp rate, minimum down time (10 min), maximum up time (12 hr).
"""
from dataclasses import dataclass, field
from data.seed import DIESEL_8, DIESEL_9


@dataclass
class UnitState:
    unit_id: int
    on: bool = False
    hours_on: float = 0.0
    hours_off: float = 999.0  # start as if long-idle
    current_output_kw: float = 0.0


def commit_units(
    required_kw: float,
    asset: dict,
    states: list[UnitState],
) -> tuple[float, list[UnitState], list[dict]]:
    """
    Given required_kw of diesel needed, commit/decommit units greedily.
    Returns (actual_kw_dispatched, updated_states, unit_schedule_list).

    unit_schedule_list: [{unit_id, on, output_kw, cooldown_remaining_min}]
    """
    def _cooldown_min(state, asset_min_down_min: float) -> int:
        if state.on:
            return 0
        min_down_h = asset_min_down_min / 60
        remaining_h = max(0.0, min_down_h - state.hours_off)
        return int(round(remaining_h * 60))

    max_per_unit_kw = asset["capacity_per_unit_mw"] * 1000
    min_down_h = asset["min_down_time_min"] / 60
    max_up_h = asset["max_up_time_hr"]

    total_dispatched = 0.0
    schedule = []
    remaining = required_kw

    for state in states:
        if remaining <= 0:
            # No more power needed — try to shut down if constraints allow
            if state.on and state.hours_on >= min_down_h:
                state.on = False
                state.hours_off = 0.0
                state.current_output_kw = 0.0
            elif state.on:
                # Can't shut down yet, run at minimum
                state.hours_on += 1
                state.current_output_kw = max_per_unit_kw * 0.20
                total_dispatched += state.current_output_kw
            else:
                state.hours_off += 1
            schedule.append({
                "unit_id": state.unit_id,
                "on": state.on,
                "output_kw": round(state.current_output_kw, 1),
                "cooldown_remaining_min": _cooldown_min(state, asset["min_down_time_min"]),
            })
            continue

        if state.on:
            # Check max up time
            if state.hours_on >= max_up_h:
                # Force shutdown
                state.on = False
                state.hours_off = 0.0
                state.current_output_kw = 0.0
                state.hours_on = 0.0
                schedule.append({
                    "unit_id": state.unit_id,
                    "on": False,
                    "output_kw": 0.0,
                    "cooldown_remaining_min": _cooldown_min(state, asset["min_down_time_min"]),
                })
                continue

            # Unit is on: ramp toward required
            ramp_kw_per_hr = asset["ramp_pct_per_sec"] * max_per_unit_kw * 3600
            target_kw = min(remaining, max_per_unit_kw)
            new_output = min(
                state.current_output_kw + ramp_kw_per_hr,
                target_kw,
            )
            state.current_output_kw = new_output
            state.hours_on += 1
            total_dispatched += new_output
            remaining -= new_output

        else:
            # Unit is off: start if min down time satisfied
            if state.hours_off >= min_down_h:
                state.on = True
                state.hours_off = 0.0
                state.hours_on = 0.0
                # First hour output = ramp from 0
                ramp_kw_per_hr = asset["ramp_pct_per_sec"] * max_per_unit_kw * 3600
                state.current_output_kw = min(ramp_kw_per_hr, remaining, max_per_unit_kw)
                total_dispatched += state.current_output_kw
                remaining -= state.current_output_kw
                state.hours_on += 1
            else:
                state.hours_off += 1

        schedule.append({
            "unit_id": state.unit_id,
            "on": state.on,
            "output_kw": round(state.current_output_kw, 1),
            "cooldown_remaining_min": _cooldown_min(state, asset["min_down_time_min"]),
        })

    return round(total_dispatched, 1), states, schedule


def make_initial_states(asset: dict) -> list[UnitState]:
    return [UnitState(unit_id=i + 1) for i in range(asset["units"])]
