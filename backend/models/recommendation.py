"""
Recommendation engine — turn a dispatch plan into an operator action timeline.

Detects transitions in a plan (diesel start/stop, battery charge/discharge,
grid near-cap) and emits Recommendation dicts. Honors the SCADA constraint:
BESS/Diesel changes need a radio call to field staff (control_type="radio",
with lead time), while line breakers are SCADA-controllable (control_type="scada").
"""

# lead time (minutes) before an action must take effect — time to radio + act
LEAD_TIMES_MIN = {"diesel": 15, "battery": 0, "grid": 0}

_DIESEL_ON_THRESHOLD_MW = 0.01   # diesel considered "on" above this
_BESS_ON_THRESHOLD_MW   = 0.05   # |battery_mw| considered active above this

_DIESEL_SPECS = [
    ("diesel_c_mw", "Diesel #9", "diesel"),
    ("diesel_a_mw", "Diesel #8", "diesel"),
]

# device → how the operator effects the change
CONTROL_TYPE = {
    "Diesel #8": "radio",
    "Diesel #9": "radio",
    "BESS #7":   "radio",
    "Line 6":    "scada",
    "Solar":     "scada",  # stub: no Solar transition emitted yet (future work)
}


def _fmt_time(day: int, hour: int, lead_min: int = 0) -> str:
    """Format 'Day D HH:MM' with an optional lead-time offset (subtracted)."""
    total = day * 24 * 60 + hour * 60 - lead_min
    # clamp: an action cannot be scheduled before the start of the plan
    if total < 0:
        total = 0
    d, rem = divmod(total, 24 * 60)
    h, m = divmod(rem, 60)
    return f"Day {d} {h:02d}:{m:02d}"


def _rec(*, device, action, severity, reason, impact, day, hour, lead_key):
    lead = LEAD_TIMES_MIN.get(lead_key, 0)
    return {
        "act_time":     _fmt_time(day, hour, lead),
        "effect_time":  _fmt_time(day, hour, 0),
        "severity":     severity,
        "device":       device,
        "action":       action,
        "reason":       reason,
        "impact":       impact,
        "control_type": CONTROL_TYPE.get(device, "radio"),
        "day":          day,
    }


def build_recommendations(rows: list[dict]) -> list[dict]:
    """Derive a list of Recommendation dicts from consecutive plan rows."""
    recs: list[dict] = []
    if not rows:
        return recs

    for i in range(1, len(rows)):
        prev, cur = rows[i - 1], rows[i]
        day, hour = cur.get("day", 0), cur["hour"]

        # ── Diesel start / stop ──
        for key, device, lead_key in _DIESEL_SPECS:
            p = prev.get(key, 0.0) or 0.0
            c = cur.get(key, 0.0) or 0.0
            if p <= _DIESEL_ON_THRESHOLD_MW and c > _DIESEL_ON_THRESHOLD_MW:
                recs.append(_rec(
                    device=device, action="สตาร์ท", severity="warn",
                    reason=f"โหลดคาดเกินกำลังจ่ายของ grid ตอน {hour:02d}:00 (ต้องเสริมดีเซล)",
                    impact=f"+{c:.1f} MW · กันไฟตก",
                    day=day, hour=hour, lead_key=lead_key,
                ))
            elif p > _DIESEL_ON_THRESHOLD_MW and c <= _DIESEL_ON_THRESHOLD_MW:
                recs.append(_rec(
                    device=device, action="ดับ", severity="info",
                    reason=f"โหลดลดลง ดีเซลไม่จำเป็นแล้วตอน {hour:02d}:00",
                    impact="ประหยัดต้นทุนดีเซล",
                    day=day, hour=hour, lead_key=lead_key,
                ))

        # ── Battery discharge / charge transitions ──
        pb = prev.get("battery_mw", 0.0) or 0.0
        cb = cur.get("battery_mw", 0.0) or 0.0
        if pb < _DIESEL_ON_THRESHOLD_MW and cb > _BESS_ON_THRESHOLD_MW:
            recs.append(_rec(
                device="BESS #7", action="จ่าย", severity="info",
                reason=f"เริ่มหน้าต่างจ่ายแบต peak-shave ตอน {hour:02d}:00",
                impact=f"จ่าย {cb:.1f} MW ลดพึ่งดีเซล",
                day=day, hour=hour, lead_key="battery",
            ))
        elif pb > -_DIESEL_ON_THRESHOLD_MW and cb < -_BESS_ON_THRESHOLD_MW:
            recs.append(_rec(
                device="BESS #7", action="ชาร์จ", severity="info",
                reason=f"เริ่มหน้าต่างชาร์จแบตตอน {hour:02d}:00 (off-peak)",
                impact=f"ชาร์จ {abs(cb):.1f} MW เตรียมวันถัดไป",
                day=day, hour=hour, lead_key="battery",
            ))

        # ── Grid near cap (SCADA) ──
        if prev.get("status") not in ("line6-near", "grid-limited") and \
           cur.get("status") in ("line6-near", "grid-limited"):
            recs.append(_rec(
                device="Line 6", action="เฝ้าระวัง", severity="warn",
                reason=f"Line 6 ใกล้เต็มพิกัดตอน {hour:02d}:00 (เกาะ A/B ดึงไฟเยอะ)",
                impact="เตรียมแหล่งสำรอง เฝ้าระวัง trip",
                day=day, hour=hour, lead_key="grid",
            ))

    return recs


# ── Intra-day Early-Warning ───────────────────────────────────────────────
SOC_FLOOR_PCT = 20.0
BATTERY_CAPACITY_MWH = 30.0  # MWh; mirror of Battery #7 spec in data/seed.py
DEVIATION_THRESHOLD = 0.10          # 10%


def detect_intraday_alerts(
    forecast: list[dict],
    *,
    current_state: dict,
    grid_available_mw: float,
    actual_now_mw: float | None = None,
    plan_now_mw: float | None = None,
) -> list[dict]:
    """
    Early-Warning for the intra-day (next ~6h) horizon.

    forecast: list of {datetime, predicted_safe} (MW), 15-min steps.
    current_state: {soc_pct: float}.
    Returns Recommendation-shaped dicts (same keys as build_recommendations).
    """
    alerts: list[dict] = []

    def _alert(severity, device, action, reason, impact, control_type, when):
        alerts.append({
            "act_time": when, "effect_time": when, "severity": severity,
            "device": device, "action": action, "reason": reason,
            "impact": impact, "control_type": control_type, "day": 0,
        })

    # T1 — forecast load exceeds available grid within horizon → critical
    breach = next(
        (p for p in forecast if (p.get("predicted_safe") or 0.0) > grid_available_mw),
        None,
    )
    if breach is not None:
        t = str(breach["datetime"])[11:16] or "เร็วๆ นี้"
        deficit = (breach.get("predicted_safe") or 0.0) - grid_available_mw
        _alert(
            "critical", "Diesel #9", "เตรียมสตาร์ทเดี๋ยวนี้",
            f"forecast โหลดจะเกินกำลัง grid ที่ {t} ({breach['predicted_safe']:.1f} > {grid_available_mw:.1f} MW)",
            f"ขาด {deficit:.1f} MW · วิทยุแจ้งล่วงหน้า (lead 15 นาที)",
            "radio", t,
        )

    # T2 — projected SoC falls below floor over the horizon
    soc = current_state.get("soc_pct", 100.0)
    avail_mwh = (soc / 100.0) * BATTERY_CAPACITY_MWH
    # Simplification: treats the whole grid shortfall as battery-supplied (may overlap with T1's diesel start).
    deficit_mwh = sum(
        max(0.0, (p.get("predicted_safe") or 0.0) - grid_available_mw) * 0.25
        for p in forecast
    )
    floor_mwh = (SOC_FLOOR_PCT / 100.0) * BATTERY_CAPACITY_MWH
    headroom_mwh = avail_mwh - floor_mwh
    if headroom_mwh < 0:
        _alert(
            "warn", "BESS #7", "สตาร์ทดีเซลทดแทน / จำกัดการจ่ายแบต",
            f"SoC ปัจจุบัน {soc:.0f}% ต่ำกว่าขั้นต่ำ {SOC_FLOOR_PCT:.0f}% แล้ว",
            "แบตเหลือน้อย เสี่ยงหมด — พึ่งดีเซลแทน", "radio", "ตอนนี้",
        )
    elif deficit_mwh > headroom_mwh:
        _alert(
            "warn", "BESS #7", "จำกัดการจ่ายแบต / สตาร์ทดีเซลเร็วขึ้น",
            f"คาด SoC จะต่ำกว่า {SOC_FLOOR_PCT:.0f}% (พลังงานขาด {deficit_mwh:.1f} MWh)",
            "กันแบตหมดกลางคัน", "radio", "ภายใน 6 ชม.",
        )

    # T3 — actual deviates from day-ahead plan beyond threshold
    if actual_now_mw is not None and plan_now_mw is not None and plan_now_mw != 0.0:
        dev = abs(actual_now_mw - plan_now_mw) / plan_now_mw
        if dev > DEVIATION_THRESHOLD:
            _alert(
                "warn", "Day-Ahead Plan", "ทบทวนแผน (re-plan)",
                f"โหลดจริง {actual_now_mw:.1f} MW เบี่ยงจากแผน {plan_now_mw:.1f} MW ({dev*100:.0f}%)",
                "แผน day-ahead คลาดเคลื่อน ควรคำนวณใหม่", "scada", "ตอนนี้",
            )

    return alerts
