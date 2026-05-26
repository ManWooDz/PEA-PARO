"""
Battery #7 (Island A) state-of-charge model.
Charge window : 22:00–08:59
Discharge window: 09:00–21:59
Daily discharge budget: avg 25 MWh, max 30 MWh with rollover.
"""
from data.seed import BATTERY_7


def is_charge_hour(hour: int) -> bool:
    """Returns True if the given hour is in the charge window (22:00–08:59)."""
    return hour >= 22 or hour < 9


def is_discharge_hour(hour: int) -> bool:
    """Returns True if the given hour is in the discharge window (09:00–21:59)."""
    return 9 <= hour <= 21


def compute_battery_schedule(
    hourly_shortage_kw: list[float],
    initial_soc_pct: float = 65.0,
    daily_budget_mwh: float = 25.0,
) -> list[dict]:
    """
    Given an hourly list of remaining shortage (after grid) in kW,
    return hourly battery dispatch dict with:
      { h, dispatch_kw, soc_pct, action }
    Positive dispatch_kw = discharge; negative = charge.
    """
    capacity_kwh = BATTERY_7["capacity_mwh"] * 1000  # 30,000 kWh
    max_power_kw = BATTERY_7["capacity_mw"] * 1000   # 12,500 kW
    max_daily_kwh = min(daily_budget_mwh, BATTERY_7["daily_discharge_max_mwh"]) * 1000

    soc_kwh = initial_soc_pct / 100 * capacity_kwh
    discharged_today_kwh = 0.0
    schedule = []

    for h, shortage_kw in enumerate(hourly_shortage_kw):
        if is_discharge_hour(h) and shortage_kw > 0:
            # Discharge: limited by shortage, power rating, SoC, daily budget
            available_kwh = soc_kwh - capacity_kwh * 0.20  # PEA constraint: 20% floor
            budget_left_kwh = max_daily_kwh - discharged_today_kwh
            dispatch_kw = min(
                shortage_kw,
                max_power_kw,
                available_kwh,
                budget_left_kwh,
                max(0, available_kwh),
            )
            dispatch_kw = max(0.0, dispatch_kw)
            soc_kwh -= dispatch_kw
            discharged_today_kwh += dispatch_kw
            action = "discharge" if dispatch_kw > 0 else "idle"
        elif is_charge_hour(h):
            # Charge at constant rate if SoC < 80%
            headroom_kwh = capacity_kwh * 0.80 - soc_kwh   # PEA constraint: 80% ceiling
            charge_kw = min(max_power_kw * 0.5, headroom_kwh)  # charge at 50% power
            charge_kw = max(0.0, charge_kw)
            dispatch_kw = -charge_kw  # negative = charging
            soc_kwh += charge_kw
            action = "charge" if charge_kw > 0 else "idle"
        else:
            dispatch_kw = 0.0
            action = "idle"

        soc_pct = (soc_kwh / capacity_kwh) * 100
        schedule.append({
            "h": h,
            "dispatch_kw": round(dispatch_kw, 1),
            "soc_pct": round(soc_pct, 1),
            "action": action,
        })

    return schedule
