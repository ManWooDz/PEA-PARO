"""
Static seed data: grid topology, asset specs, alert templates, cost constants.
All values from PEA PDF spec (EMS for Startup_rev3.pdf).
"""

# ── Cost model (Token / kWh) ─────────────────────────────────────────────────
COST = {
    "grid_peak":    4.5,   # 09:00-22:00 Mon-Fri
    "grid_offpeak": 3.0,   # 22:00-09:00 Mon-Fri; all day Sat-Sun
    "battery":      12.0,  # Battery #7, Island A
    "diesel_a":     15.0,  # Diesel Gen #8, Island A
    "diesel_c":     12.0,  # Diesel Gen #9, Island C
    "sale":          4.0,  # Customer tariff (Token/kWh) — assumed same as design
}

# ── Submarine cable operating limits (MW) ────────────────────────────────────
LINES = {
    1: {"name": "Mainland–Island A (115kV)", "limit_mw": 32, "voltage": "115kV"},
    2: {"name": "Mainland–Island A (115kV)", "limit_mw": 27, "voltage": "115kV"},
    3: {"name": "Mainland–Island A (33kV)",  "limit_mw": 13, "voltage": "33kV"},
    4: {"name": "Island A–Island B (115kV)", "limit_mw": 27, "voltage": "115kV"},
    5: {"name": "Island A–Island B (33kV)",  "limit_mw":  7, "voltage": "33kV"},
    6: {"name": "Island B–Island C (33kV)",  "limit_mw":  8, "voltage": "33kV"},  # CRITICAL
}

# Practical grid availability at Island C after upstream consumption by Islands A & B.
# Cable 6 physical limit = 8 MW, but cascading consumption leaves ~1.3 MW on average.
# Pass a live value from SCADA to build_dispatch_plan(grid_available_kw=...) to override.
PRACTICAL_GRID_KW: float = 1_300.0   # kW  (~1.3 MW historical average)

# ── Asset specs ──────────────────────────────────────────────────────────────
BATTERY_7 = {
    "id": "battery_7",
    "name": "Battery #7",
    "island": "A",
    "capacity_mw": 12.5,
    "capacity_mwh": 30.0,
    "daily_discharge_avg_mwh": 25.0,
    "daily_discharge_max_mwh": 30.0,
    "charge_window": (22, 9),    # 22:00–08:59
    "discharge_window": (9, 22), # 09:00–21:59
    "cost_token_kwh": COST["battery"],
}

DIESEL_8 = {
    "id": "diesel_8",
    "name": "Diesel Gen #8",
    "island": "A",
    "units": 3,
    "capacity_per_unit_mw": 5.0,
    "total_capacity_mw": 15.0,
    "ramp_pct_per_sec": 0.01,  # 1% of kW target / sec
    "min_down_time_min": 10,
    "max_up_time_hr": 12,
    "cost_token_kwh": COST["diesel_a"],
}

DIESEL_9 = {
    "id": "diesel_9",
    "name": "Diesel Gen #9",
    "island": "C",
    "units": 2,
    "capacity_per_unit_mw": 2.5,
    "total_capacity_mw": 5.0,
    "ramp_pct_per_sec": 0.03,  # 3% of kW target / sec
    "min_down_time_min": 10,
    "max_up_time_hr": 12,
    "cost_token_kwh": COST["diesel_c"],
}

# ── Initial alerts ────────────────────────────────────────────────────────────
INITIAL_ALERTS = [
    {
        "id": 1,
        "time": "14:28",
        "level": "high",
        "title": "คาดการณ์โหลดเกินขีดจำกัด Line 6 (8 MW) เวลา 19:00–21:00 น.",
        "detail": "Battery SoC คาดว่าจะต่ำกว่า 20% — แนะนำเดินเครื่อง Diesel #9 (เกาะ C) เพื่อรองรับ peak demand",
        "status": "open",
        "forecast_peak_mw": 8.4,
        "battery_soc_pct": 16.0,
        "recommended_action": "Diesel Gen #9 Unit-1 · 2.5 MW · 19:00–22:00",
    },
    {
        "id": 2,
        "time": "13:51",
        "level": "medium",
        "title": "Line 6 utilization เกิน 85% — เฝ้าระวัง",
        "detail": "กำลังส่งผ่าน Line 6 อยู่ที่ 6.8 MW จากขีดจำกัด 8 MW (85%) ติดต่อกัน 45 นาที",
        "status": "open",
    },
    {
        "id": 3,
        "time": "12:14",
        "level": "medium",
        "title": "Diesel Gen #8 Unit-2 เข้าใกล้ Max Up Time (12 ชม.)",
        "detail": "Unit-2 เดินเครื่องมาแล้ว 11 ชม. 20 นาที — ต้องวางแผนหยุดก่อน 13:34 น.",
        "status": "open",
    },
    {
        "id": 4,
        "time": "11:02",
        "level": "low",
        "title": "Battery #7 SoC ถึงระดับ Discharge ขั้นต่ำ 20%",
        "detail": "SoC อยู่ที่ 21% — ระบบจะหยุด Discharge อัตโนมัติหากต่ำกว่า 20%",
        "status": "open",
    },
    {
        "id": 5,
        "time": "09:47",
        "level": "resolved",
        "title": "สั่งเดินเครื่อง Diesel Gen #9 Unit-1 สำเร็จ",
        "detail": "เจ้าหน้าที่ภาคสนาม เกาะ C ยืนยันสถานะ ON-LINE เมื่อ 09:46 น.",
        "status": "resolved",
    },
    {
        "id": 6,
        "time": "08:12",
        "level": "resolved",
        "title": "Line 6 กลับสู่ระดับปกติ (<70%)",
        "detail": "หลังจาก Battery #7 เริ่ม Discharge อีกครั้ง ภาระบน Line 6 ลดลงเหลือ 5.2 MW (65%)",
        "status": "resolved",
    },
]

# ── Island load profiles (diurnal base, kW) ───────────────────────────────────
# Island C: tourism island — evening peak 19-21, morning shoulder 09-11
# Values represent average load factor (0–1) scaled to peak
ISLAND_C_LOAD_PROFILE = [
    0.38, 0.34, 0.31, 0.29, 0.28, 0.30,  # 00-05
    0.34, 0.40, 0.48, 0.55, 0.60, 0.62,  # 06-11
    0.64, 0.63, 0.62, 0.61, 0.63, 0.66,  # 12-17
    0.72, 0.88, 0.96, 0.94, 0.80, 0.55,  # 18-23
]
ISLAND_C_PEAK_KW = 7200   # Peak demand Island C (kW), within 8MW Line 6 limit

ISLAND_A_LOAD_PROFILE = [
    0.42, 0.38, 0.35, 0.33, 0.32, 0.34,
    0.38, 0.45, 0.55, 0.63, 0.68, 0.70,
    0.72, 0.71, 0.70, 0.69, 0.71, 0.74,
    0.80, 0.92, 0.98, 0.95, 0.82, 0.58,
]
ISLAND_A_PEAK_KW = 18000  # Peak demand Island A (kW)
