"""
Early Warning engine.
Scans real-time telemetry and upcoming forecast for breach conditions.
Returns list of alert dicts with severity + recommended action.
"""
from data.seed import LINES, BATTERY_7, DIESEL_8, DIESEL_9

LINE6_LIMIT_KW = LINES[6]["limit_mw"] * 1000


def check_warnings(
    line6_flow_kw: float,
    battery_soc_pct: float,
    battery_action: str,          # "charge" | "discharge" | "idle"
    diesel8_hours_on: float,
    diesel9_hours_on: float,
    forecast_peak_kw: float,      # expected peak within next 2 hours
    current_hour: int,
) -> list[dict]:
    """
    Returns a list of active warning dicts:
      { level, title, detail, recommended_action }
    """
    warnings = []

    # 1. Line 6 near-limit
    util = line6_flow_kw / LINE6_LIMIT_KW * 100
    if util >= 90:
        warnings.append({
            "level": "high",
            "title": f"Line 6 overload risk — {util:.1f}% utilization ({line6_flow_kw/1000:.2f} MW / 8 MW)",
            "detail": "กำลังส่งผ่านสาย 33kV เกาะ B–เกาะ C เกิน 90% ของขีดจำกัด",
            "recommended_action": "เดินเครื่อง Diesel Gen #9 เกาะ C เพื่อลดภาระ Line 6",
        })
    elif util >= 75:
        warnings.append({
            "level": "medium",
            "title": f"Line 6 at {util:.1f}% — เฝ้าระวัง",
            "detail": "กำลังส่งผ่าน Line 6 เกิน 75% ติดต่อกัน — เฝ้าระวัง peak ช่วงเย็น",
            "recommended_action": "เตรียม Diesel Gen #9 ให้พร้อม Standby",
        })

    # 2. Battery low SoC during discharge window
    if battery_soc_pct < 20 and 9 <= current_hour <= 21:
        warnings.append({
            "level": "high",
            "title": f"Battery #7 SoC ต่ำ — {battery_soc_pct:.1f}% (ต่ำกว่า 20%)",
            "detail": "Battery SoC ต่ำกว่าระดับขั้นต่ำในช่วง Discharge — ระบบจะหยุด Discharge",
            "recommended_action": "เดินเครื่อง Diesel Gen #9 หรือ #8 ทดแทนกำลังจาก Battery",
        })
    elif battery_soc_pct < 30 and 9 <= current_hour <= 21:
        warnings.append({
            "level": "medium",
            "title": f"Battery #7 SoC ใกล้ระดับต่ำ — {battery_soc_pct:.1f}%",
            "detail": "SoC กำลังเข้าสู่โซนเสี่ยง — ควรพิจารณาลด Discharge",
            "recommended_action": "ลด Dispatch จาก Battery และเพิ่ม Grid หรือ Diesel",
        })

    # 3. Diesel max-up-time approaching
    max_up = DIESEL_8["max_up_time_hr"]
    if diesel8_hours_on >= max_up * 0.9 and diesel8_hours_on > 0:
        remaining = max_up - diesel8_hours_on
        warnings.append({
            "level": "medium",
            "title": f"Diesel Gen #8 เข้าใกล้ Max Up Time ({diesel8_hours_on:.1f}/{max_up} hr)",
            "detail": f"เหลือเวลาเดินเครื่องอีก {remaining:.1f} ชม. ก่อนถึงขีดจำกัด 12 ชม.",
            "recommended_action": "วางแผน Shutdown และ Standby Unit ถัดไปให้พร้อม",
        })

    max_up9 = DIESEL_9["max_up_time_hr"]
    if diesel9_hours_on >= max_up9 * 0.9 and diesel9_hours_on > 0:
        remaining = max_up9 - diesel9_hours_on
        warnings.append({
            "level": "medium",
            "title": f"Diesel Gen #9 เข้าใกล้ Max Up Time ({diesel9_hours_on:.1f}/{max_up9} hr)",
            "detail": f"เหลือเวลาเดินเครื่องอีก {remaining:.1f} ชม.",
            "recommended_action": "วางแผน Shutdown Unit #9 และเตรียม Unit #8 Standby",
        })

    # 4. Forecast demand breach
    if forecast_peak_kw > LINE6_LIMIT_KW * 0.95 and battery_soc_pct < 40:
        warnings.append({
            "level": "high",
            "title": f"คาดการณ์โหลดเกิน 95% ของ Line 6 — {forecast_peak_kw/1000:.2f} MW",
            "detail": f"แนวโน้มโหลดช่วง 2 ชม. ข้างหน้าเกิน {LINE6_LIMIT_KW*0.95/1000:.1f} MW และ Battery SoC ต่ำ",
            "recommended_action": "เดินเครื่อง Diesel Gen #9 ล่วงหน้าก่อน Peak",
            "forecast_peak_mw": round(forecast_peak_kw / 1000, 2),
            "battery_soc_pct": battery_soc_pct,
        })

    return warnings
