"""
24-hour dispatch optimizer for Island C — reality-aligned merit order.

Correct merit order (min-cost, based on operational data):
  1. Grid (Cable 6)  — cheapest, but practically limited to ~1.3 MW by cascading
  2. Battery ⑦       — peak-shave 09:00–21:59, 25 MWh daily budget
  3. Diesel Gen ⑨    — primary local source, Island C (2 × 2.5 MW)
  4. Diesel Gen ⑧    — last resort, Island A (3 × 5 MW, most expensive)

Internal calculations are in kW; output converted to MW.
grid_available_kw defaults to PRACTICAL_GRID_KW (~1.3 MW) and can be
overridden at call-time with a live SCADA reading.
"""
from data.seed import COST, LINES, PRACTICAL_GRID_KW, ISLAND_C_LOAD_PROFILE, ISLAND_C_PEAK_KW, LINE6_LIMIT_KW_PHYSICAL
from models.battery import compute_battery_schedule, is_discharge_hour
from models.diesel import commit_units, make_initial_states, DIESEL_8, DIESEL_9


def _grid_cost(hour: int, weekday: bool = True) -> float:
    """Return grid cost (Token/kWh) based on hour and day type."""
    is_peak = (9 <= hour < 22) and weekday
    return COST["grid_peak"] if is_peak else COST["grid_offpeak"]


def _load_at_hour(hour: int, scale: float = 1.0) -> float:
    """Island C load in kW for a given hour (static profile fallback)."""
    return ISLAND_C_LOAD_PROFILE[hour % 24] * ISLAND_C_PEAK_KW * scale


def build_dispatch_plan(
    strategy: str = "min-cost",
    has_solar: bool = False,
    custom_cfg: dict | None = None,
    load_scale: float = 1.0,
    initial_soc_pct: float = 65.0,
    weekday: bool = True,
    forecast_kw: list[float] | None = None,
    grid_available_kw: float = PRACTICAL_GRID_KW,
) -> list[dict]:
    """
    Build a 24-hour hourly dispatch plan for Island C.

    Merit order: Grid → Battery → Diesel ⑨ → Diesel ⑧

    Args:
        strategy:          'min-cost' | 'reliability' | 'eco' | 'baseline'
        forecast_kw:       24-element list of hourly Island C loads (kW).
                           Uses static profile when None.
        grid_available_kw: Practical grid supply available at Island C through
                           Cable 6 (kW). Default = PRACTICAL_GRID_KW (~1.3 MW).
                           Pass a live SCADA reading to improve accuracy.
                           Hard-capped at LINE6_LIMIT_KW_PHYSICAL (8 MW).
        initial_soc_pct:   Battery starting SoC (0–100 %).
        weekday:           True = Mon–Fri grid pricing; False = Sat–Sun off-peak all day.

    Returns:
        list[dict] — 24 DispatchRow-compatible dicts (all power in MW).
    """
    # ── Enforce physical cable hard cap ──────────────────────────────────────
    grid_cap_kw = min(float(grid_available_kw), LINE6_LIMIT_KW_PHYSICAL)

    # ── Apply strategy modifier to grid cap ──────────────────────────────────
    if strategy == "reliability":
        # Use only 90% of available grid — keep headroom for voltage stability
        grid_cap_kw = grid_cap_kw * 0.90
    elif strategy == "eco":
        # Deliberately reduce grid draw; push more to battery peak-shave
        grid_cap_kw = grid_cap_kw * 0.60

    # ── Hourly loads ─────────────────────────────────────────────────────────
    if forecast_kw is not None and len(forecast_kw) == 24:
        loads_kw = [float(k) for k in forecast_kw]
    else:
        loads_kw = [_load_at_hour(h, load_scale) for h in range(24)]

    # ── Solar generation (when has_solar=True): mock 0.8 MWp diurnal curve ───
    # Bell curve peaking at noon, zero at night — matches Open-Meteo's typical shape
    solar_kw = [0.0] * 24
    if has_solar:
        for h in range(24):
            # 0 at midnight, peak at hour 12, 0 again after sunset
            solar_kw[h] = max(0.0, 800.0 * max(0.0, 1 - ((h - 12) / 6) ** 2))

    # ── Battery schedule ─────────────────────────────────────────────────────
    # Battery shortage input = (load − solar) − grid for discharge hours only.
    # Battery discharges BEFORE Diesel ⑨ during 09:00–21:59.
    battery_shortage = [
        max(0.0, max(0.0, loads_kw[h] - solar_kw[h]) - grid_cap_kw)
        if is_discharge_hour(h) else 0.0
        for h in range(24)
    ]
    battery_schedule = compute_battery_schedule(
        battery_shortage, initial_soc_pct=initial_soc_pct
    )

    # ── Diesel unit states ────────────────────────────────────────────────────
    d8_states = make_initial_states(DIESEL_8)
    d9_states = make_initial_states(DIESEL_9)

    rows = []
    for h in range(24):
        load_kw = loads_kw[h]

        # Subtract solar (treated as load reduction)
        net_load_kw = max(0.0, load_kw - solar_kw[h])

        # 1. Grid — capped at practical (and strategy-adjusted) limit
        grid_kw = min(net_load_kw, grid_cap_kw)
        after_grid = max(0.0, net_load_kw - grid_kw)

        # 2. Battery — discharge only during 09:00–21:59
        bat = battery_schedule[h]
        bat_kw = max(0.0, bat["dispatch_kw"])  # positive = discharge
        after_bat = max(0.0, after_grid - bat_kw)

        # 3. Diesel ⑨ (Island C, primary local source)
        # Always call commit_units to advance the state machine even with 0 demand
        # (ensures hours_on/hours_off track correctly for max-up-time enforcement)
        d9_out, d9_states, d9_units = commit_units(after_bat, DIESEL_9, d9_states)

        # 4. Diesel ⑧ (Island A, last resort)
        # d8 covers both unmet demand and any Diesel ⑨ ramp-rate shortfall on first startup
        d8_remaining = max(0.0, after_bat - d9_out)
        d8_out, d8_states, d8_units = commit_units(d8_remaining, DIESEL_8, d8_states)

        # ── Token cost for this hour ──────────────────────────────────────────
        gc = _grid_cost(h, weekday)
        token_hr = (
            grid_kw * gc
            + bat_kw * COST["battery"]
            + d9_out * COST["diesel_c"]
            + d8_out * COST["diesel_a"]
        )

        # ── Row status ────────────────────────────────────────────────────────
        l6_util = (grid_kw / LINE6_LIMIT_KW_PHYSICAL) * 100
        if bat["soc_pct"] < 20:
            status = "low-soc"
        elif l6_util > 90:
            status = "line6-near"
        elif d9_out > 0 or d8_out > 0:
            status = "diesel"
        elif grid_kw >= grid_cap_kw - 1:
            status = "grid-limited"   # at practical grid cap
        else:
            status = "normal"

        rows.append({
            "hour":             h,
            "load_mw":          round(load_kw / 1000, 3),
            "grid_mw":          round(grid_kw / 1000, 3),
            "battery_mw":       round(bat["dispatch_kw"] / 1000, 3),   # +/- MW
            "diesel_a_mw":      round(d8_out / 1000, 3),
            "diesel_c_mw":      round(d9_out / 1000, 3),
            "solar_mw":         round(solar_kw[h] / 1000, 3),
            "soc_pct":          round(bat["soc_pct"], 1),
            "token_per_hour":   round(token_hr, 1),
            "status":           status,
            "diesel8_units_on": sum(1 for u in d8_units if u["on"]),
            "diesel9_units_on": sum(1 for u in d9_units if u["on"]),
        })

    return rows


def compute_plan_cost(rows: list[dict]) -> dict:
    """Aggregate Token costs from a 24-hour plan (rows values in MW).

    Uses the per-hour token cost already computed by build_dispatch_plan
    so that weekday/weekend pricing is always consistent.
    """
    # Grid cost derived from total minus non-grid components
    bat_t  = sum(max(0.0, r["battery_mw"]) * 1000 * COST["battery"]  for r in rows)
    da_t   = sum(r["diesel_a_mw"]         * 1000 * COST["diesel_a"]  for r in rows)
    dc_t   = sum(r["diesel_c_mw"]         * 1000 * COST["diesel_c"]  for r in rows)
    total  = sum(r["token_per_hour"]                                   for r in rows)
    grid_t = max(0.0, total - bat_t - da_t - dc_t)
    return {
        "grid_thb":    round(grid_t,      1),
        "battery_thb": round(bat_t,       1),
        "diesel_thb":  round(da_t + dc_t, 1),
        "total_thb":   round(total,       1),
    }
