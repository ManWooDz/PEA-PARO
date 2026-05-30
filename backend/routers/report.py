"""
Operational report generator (Tab-bar "รายงาน" button).

GET /api/report?scope=current|full&tab=<tab>&format=html|csv
  → a complete, styled report built from the REAL data at the simulation clock.

The frontend downloads HTML/CSV directly; for PDF it opens the HTML and prints
(browser "Save as PDF") — which renders Thai perfectly with no PDF/font library.
"""
import csv
import io
import html as _html
from fastapi import APIRouter, Query
from fastapi.responses import Response

from data.clock import now as sim_now
from data.loader import get_current_state, get_blended_cost
from data.seed import LINES, PRACTICAL_GRID_KW
from data.forecast_store import get_forecast_series
from models.dispatch_optimizer import build_multi_day_plan, compute_plan_cost
from models.recommendation import build_recommendations, detect_intraday_alerts
from models.forecasting import forecast_7_days, model_info

router = APIRouter(prefix="/api/report", tags=["report"])

TAB_LABELS = {
    "realtime": "ภาพรวมระบบ (เรียลไทม์)",
    "dispatch": "แผนการจ่ายไฟ",
    "forecast": "พยากรณ์โหลด",
    "alerts":   "การแจ้งเตือน",
}
_ORDER = ["realtime", "dispatch", "forecast", "alerts"]
_GRID_MW = PRACTICAL_GRID_KW / 1000.0
_SEV_TH = {"critical": "เสี่ยงสูง", "warn": "เฝ้าระวัง", "info": "แจ้งเตือน"}


def _sections(scope: str, tab: str) -> list[str]:
    if scope == "full":
        return _ORDER
    return [tab if tab in TAB_LABELS else "realtime"]


def _day_ahead():
    series = list(get_forecast_series("7day"))
    hourly_kw = []
    for h in range(24):
        w = series[h * 4:(h + 1) * 4]
        vals = [p["predicted_safe"] for p in w if p.get("predicted_safe") is not None]
        hourly_kw.append((sum(vals) / len(vals) if vals else 0.0) * 1000.0)
    rows = build_multi_day_plan(hourly_kw, days=1)
    return rows, compute_plan_cost(rows), build_recommendations(rows)


def _strip_day(t: str) -> str:
    return t.split(" ")[-1] if isinstance(t, str) and t.startswith("Day ") else (t or "")


def _gather() -> dict:
    state = get_current_state()
    soc = float(state.get("soc_pct", 0.0))
    rows, cost, recs = _day_ahead()
    series6 = list(get_forecast_series("6h"))[:24]
    alerts = detect_intraday_alerts(
        series6, current_state={"soc_pct": soc}, grid_available_mw=_GRID_MW,
    ) + [r for r in recs if r["severity"] in ("warn", "critical")]
    line6 = float(state.get("line6_mw", 0.0))
    return {
        "state": state,
        "blended": get_blended_cost(state),
        "line6_util": round(line6 / LINES[6]["limit_mw"] * 100, 1),
        "plan_rows": rows,
        "cost": cost,
        "recs": recs,
        "alerts": alerts,
        "days": forecast_7_days(),
        "model": model_info(),
    }


# ── HTML rendering ────────────────────────────────────────────────────────────

def _e(v) -> str:
    return _html.escape(str(v))


def _sec_realtime(d: dict) -> str:
    s, st = d["state"], ""
    kpis = [
        ("โหลดเกาะ C", f'{s.get("load_c_mw", 0):.2f} MW'),
        ("SoC แบตเตอรี่", f'{s.get("soc_pct", 0):.1f}% ({s.get("soc_mwh", 0):.1f} MWh)'),
        ("Line 6 ใช้งาน", f'{d["line6_util"]:.1f}% ({s.get("line6_mw", 0):.2f}/{LINES[6]["limit_mw"]} MW)'),
        ("ต้นทุนเฉลี่ย", f'{d["blended"]:.2f} ฿/kWh'),
    ]
    st += '<div class="cards">' + "".join(
        f'<div class="card"><div class="k">{_e(k)}</div><div class="v">{_e(v)}</div></div>'
        for k, v in kpis
    ) + "</div>"
    line_rows = "".join(
        f"<tr><td>Line {i} · {_e(LINES[i]['name'])}</td><td>{s.get(f'line{i}_mw', 0):.2f}</td>"
        f"<td>{LINES[i]['limit_mw']}</td><td>{s.get(f'line{i}_mw', 0) / LINES[i]['limit_mw'] * 100:.0f}%</td></tr>"
        for i in range(1, 7)
    )
    st += ('<table><thead><tr><th>สายส่ง</th><th>Flow (MW)</th><th>พิกัด (MW)</th>'
           f'<th>ใช้งาน</th></tr></thead><tbody>{line_rows}</tbody></table>')
    return st


def _sec_dispatch(d: dict) -> str:
    c = d["cost"]
    cost_cards = [
        ("Grid", c["grid_thb"]), ("Battery", c["battery_thb"]),
        ("Diesel", c["diesel_thb"]), ("รวม 24 ชม.", c["total_thb"]),
    ]
    out = '<div class="cards">' + "".join(
        f'<div class="card"><div class="k">{_e(k)}</div><div class="v">฿{v:,.0f}</div></div>'
        for k, v in cost_cards
    ) + "</div>"
    rec_rows = "".join(
        f'<tr><td>{_e(_strip_day(r["act_time"]))}</td><td>{_e(r["device"])}</td>'
        f'<td>{_e(r["action"])}</td><td>{"📻 วิทยุ" if r["control_type"] == "radio" else "🖥️ SCADA"}</td>'
        f'<td>{_e(r["reason"])}</td></tr>'
        for r in d["recs"]
    ) or '<tr><td colspan="5">ไม่มีคำสั่งในช่วงนี้</td></tr>'
    out += ('<h3>ไทม์ไลน์คำสั่ง (Day-ahead 24 ชม.)</h3>'
            '<table><thead><tr><th>เวลา</th><th>อุปกรณ์</th><th>คำสั่ง</th>'
            f'<th>ช่องทาง</th><th>เหตุผล</th></tr></thead><tbody>{rec_rows}</tbody></table>')
    return out


def _sec_forecast(d: dict) -> str:
    m = d["model"]
    out = (f'<p>โมเดล: <b>{_e(m["name"])}</b> · MAE {m["mae_mw"]:.3f} MW · '
           f'RMSE {m["rmse_mw"]:.3f} MW</p>')
    rows = "".join(
        f'<tr><td>{_e(x["date"])}</td><td>{x["peak_mw"]:.2f}</td>'
        f'<td>{x["avg_mw"]:.2f}</td><td>{x["min_mw"]:.2f}</td></tr>'
        for x in d["days"]
    )
    out += ('<table><thead><tr><th>วันที่</th><th>สูงสุด (MW)</th><th>เฉลี่ย (MW)</th>'
            f'<th>ต่ำสุด (MW)</th></tr></thead><tbody>{rows}</tbody></table>')
    return out


def _sec_alerts(d: dict) -> str:
    rows = "".join(
        f'<tr><td>{_e(_SEV_TH.get(a["severity"], a["severity"]))}</td>'
        f'<td>{_e(a["device"])} · {_e(a["action"])}</td><td>{_e(a["reason"])}</td></tr>'
        for a in d["alerts"]
    ) or '<tr><td colspan="3">🟢 ปกติ — ไม่มีการแจ้งเตือน</td></tr>'
    return ('<table><thead><tr><th>ระดับ</th><th>รายการ</th><th>รายละเอียด</th></tr>'
            f'</thead><tbody>{rows}</tbody></table>')


_RENDERERS = {
    "realtime": _sec_realtime, "dispatch": _sec_dispatch,
    "forecast": _sec_forecast, "alerts": _sec_alerts,
}


def render_html(scope: str, tab: str) -> str:
    d = _gather()
    now = sim_now()
    gen = now.strftime("%d/%m/%Y %H:%M")
    body = ""
    for sec in _sections(scope, tab):
        body += f'<section><h2>{_e(TAB_LABELS[sec])}</h2>{_RENDERERS[sec](d)}</section>'
    return f"""<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">
<title>PEA-PARO Report {gen}</title>
<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Prompt', sans-serif; color:#1a1320; margin:0; padding:32px 40px; }}
  header {{ border-bottom:3px solid #d040b8; padding-bottom:12px; margin-bottom:20px; }}
  header h1 {{ margin:0; font-size:22px; color:#d040b8; }}
  header .meta {{ font-size:12px; color:#6b6470; margin-top:4px; }}
  section {{ margin:22px 0; page-break-inside:avoid; }}
  h2 {{ font-size:16px; border-left:4px solid #d040b8; padding-left:10px; margin:0 0 12px; }}
  h3 {{ font-size:13px; color:#6b6470; margin:16px 0 8px; }}
  .cards {{ display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px; }}
  .card {{ flex:1; min-width:150px; border:1px solid #eadcf0; border-radius:10px; padding:12px; background:#fbf6fc; }}
  .card .k {{ font-size:11px; color:#6b6470; text-transform:uppercase; }}
  .card .v {{ font-size:18px; font-weight:600; margin-top:4px; }}
  table {{ width:100%; border-collapse:collapse; font-size:12px; margin-top:6px; }}
  th, td {{ text-align:left; padding:6px 8px; border-bottom:1px solid #eee; }}
  th {{ color:#6b6470; text-transform:uppercase; font-size:10px; }}
  footer {{ margin-top:28px; font-size:11px; color:#9a93a0; border-top:1px solid #eee; padding-top:10px; }}
  @media print {{ body {{ padding:0; }} @page {{ margin:1.4cm; }} }}
</style></head><body>
<header>
  <h1>PEA-PARO · รายงานการปฏิบัติการ</h1>
  <div class="meta">ระบบบริหารจัดการพลังงานเกาะ C (เกาะเต่า) · สร้างเมื่อ {gen} · ขอบเขต: {('ทุกหน้า' if scope == 'full' else 'หน้าปัจจุบัน')}</div>
</header>
{body}
<footer>PEA-PARO Energy Management System · ข้อมูล ณ เวลาจำลอง {gen} · เอกสารสร้างอัตโนมัติ</footer>
</body></html>"""


def render_csv(scope: str, tab: str) -> str:
    d = _gather()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["PEA-PARO Report", sim_now().strftime("%Y-%m-%d %H:%M")])
    secs = _sections(scope, tab)

    if "realtime" in secs:
        s = d["state"]
        w.writerow([]); w.writerow(["== ภาพรวมระบบ =="])
        w.writerow(["metric", "value"])
        w.writerow(["load_c_mw", f'{s.get("load_c_mw", 0):.2f}'])
        w.writerow(["soc_pct", f'{s.get("soc_pct", 0):.1f}'])
        w.writerow(["line6_util_pct", d["line6_util"]])
        w.writerow(["blended_cost_thb_kwh", f'{d["blended"]:.2f}'])

    if "dispatch" in secs:
        w.writerow([]); w.writerow(["== แผนการจ่ายไฟ · ไทม์ไลน์คำสั่ง =="])
        w.writerow(["act_time", "device", "action", "control_type", "reason"])
        for r in d["recs"]:
            w.writerow([_strip_day(r["act_time"]), r["device"], r["action"],
                        r["control_type"], r["reason"]])

    if "forecast" in secs:
        w.writerow([]); w.writerow(["== พยากรณ์โหลด 7 วัน =="])
        w.writerow(["date", "peak_mw", "avg_mw", "min_mw"])
        for x in d["days"]:
            w.writerow([x["date"], x["peak_mw"], x["avg_mw"], x["min_mw"]])

    if "alerts" in secs:
        w.writerow([]); w.writerow(["== การแจ้งเตือน =="])
        w.writerow(["severity", "device", "action", "reason"])
        for a in d["alerts"]:
            w.writerow([a["severity"], a["device"], a["action"], a["reason"]])

    return buf.getvalue()


@router.get("")
def get_report(
    scope: str = Query("current"),
    tab: str = Query("realtime"),
    format: str = Query("html"),
):
    if format == "csv":
        return Response(content=render_csv(scope, tab),
                        media_type="text/csv; charset=utf-8")
    return Response(content=render_html(scope, tab),
                    media_type="text/html; charset=utf-8")
