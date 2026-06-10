"use client";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSolarPanel, faClock } from "@fortawesome/free-solid-svg-icons";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Icon } from "@/components/shared/Icon";
import { Dot } from "@/components/shared/Dot";
import { DispatchModeToggle } from "@/components/tabs/dispatch/DispatchModeToggle";
import { ForecastChart } from "@/components/tabs/dispatch/ForecastChart";
import { DieselScheduleSection } from "@/components/tabs/dispatch/DieselScheduleSection";
import { IntradayScheduleSection } from "@/components/tabs/dispatch/IntradayScheduleSection";
import { TodayFullScheduleSection } from "@/components/tabs/dispatch/IntradayScheduleSection";
import { FuelReservePanel } from "@/components/tabs/dispatch/FuelReservePanel";
import { EmergencyRecommendations } from "@/components/tabs/dispatch/EmergencyRecommendations";
import { useForecastSeries } from "@/hooks/useForecastSeries";
import { useDayAheadPlans, useIntradayAlerts, useTodayPlanActions, useTodayFullPlan } from "@/hooks/useRecommendations";
import { useActivePlan } from "@/hooks/useActivePlan";

const fmt1 = (v) => (v == null ? "—" : Number(v).toFixed(1));
const fmt2 = (v) => (v == null ? "—" : Number(v).toFixed(2));
const fmtBaht = (v) => (v == null ? "—" : `฿${Number(v).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`);
const SALE_BAHT_PER_KWH = 4;

// ── Source Mix Breakdown ────────────────────────────────────────────
// Shows what fraction of the 24-hour demand each source covers, with
// peak MW and active-hours window — so the operator knows what to
// radio to the field staff handling BESS / Diesel #8 / Diesel #9.
const SOURCE_DEFS = [
  {
    key: "grid_mw",
    label: "Grid",
    sub: "Line 6 · auto",
    color: "var(--primary)",
    radio: false,
  },
  {
    key: "solar_mw",
    label: "Solar",
    sub: "PV 0.8 MWp",
    color: "#f59e0b",
    radio: false,
  },
  {
    key: "battery_mw",
    label: "BESS",
    sub: "Battery #7",
    color: "#10b981",
    radio: true,
    positiveOnly: true,
  },
  {
    key: "diesel_a_mw",
    label: "Diesel #8",
    sub: "Island A",
    color: "#8b5cf6",
    radio: true,
  },
  {
    key: "diesel_c_mw",
    label: "Diesel #9",
    sub: "Island C",
    color: "#ef4444",
    radio: true,
  },
];

function activeWindow(rows, key, positiveOnly = false) {
  // Returns [startHour, endHour] of contiguous-or-not range when source > threshold
  const hours = [];
  rows.forEach((r) => {
    const v = positiveOnly ? Math.max(0, r[key] ?? 0) : (r[key] ?? 0);
    if (v > 0.05) hours.push(r.hour);
  });
  if (hours.length === 0) return null;
  return [Math.min(...hours), Math.max(...hours), hours.length];
}

function SourceMixBreakdown({ rows = [], compact = false, showRadio = true }) {
  const data = SOURCE_DEFS.map((s) => {
    const vals = rows.map((r) =>
      s.positiveOnly ? Math.max(0, r[s.key] ?? 0) : (r[s.key] ?? 0),
    );
    const totalMwh = vals.reduce((sum, v) => sum + v, 0); // 1h × MW = 1 MWh per hour-row
    const peak = vals.length ? Math.max(0, ...vals) : 0;
    const win = activeWindow(rows, s.key, s.positiveOnly);
    return { ...s, totalMwh, peak, win };
  });
  const totalAll = data.reduce((s, x) => s + x.totalMwh, 0) || 1;

  return (
    <div>
      <div className="text-xs uppercase eyebrow text-muted mb-1.5 thai">
        สัดส่วนพลังงาน · 24 ชม.
      </div>

      {/* Stacked bar */}
      <div
        className="h-2 rounded-full overflow-hidden flex"
        style={{ background: "var(--surface-2)" }}
      >
        {data.map(
          (s) =>
            s.totalMwh > 0 && (
              <div
                key={s.key}
                style={{
                  width: `${(s.totalMwh / totalAll) * 100}%`,
                  background: s.color,
                }}
              />
            ),
        )}
      </div>

      {/* Per-source rows — dot + label stay tight on the left,
          stats and window push to the right via ml-auto. */}
      <div className="mt-2 space-y-1 text-[11px]">
        {data
          .filter((s) => s.totalMwh > 0.05 || s.peak > 0.05)
          .map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ background: s.color }}
              />
              <span
                className="font-medium flex-shrink-0"
                style={{ color: s.color }}
              >
                {s.label}
              </span>
              {!compact && (
                <span className="text-[9px] text-muted truncate min-w-0">
                  {s.sub}
                </span>
              )}
              {showRadio && s.radio && s.totalMwh > 0.05 && (
                <Icon.Radio
                  width="10"
                  height="10"
                  title="ต้องวิทยุแจ้งเจ้าหน้าที่ภาคสนาม"
                  style={{ color: s.color }}
                />
              )}
              <span
                className="ml-auto mono text-muted whitespace-nowrap"
                title="Total energy delivered in 24h"
              >
                {s.totalMwh.toFixed(1)} <span className="text-[9px]">MWh</span>
              </span>
              <span
                className="mono text-muted whitespace-nowrap"
                title="Peak instantaneous output"
              >
                peak {s.peak.toFixed(1)} <span className="text-[9px]">MW</span>
              </span>
              {s.win && (
                <span
                  className="mono text-[11px] whitespace-nowrap"
                  style={{ color: s.color }}
                  title="ช่วงเวลาเดินเครื่อง"
                >
                  {compact
                    ? `${String(s.win[0]).padStart(2, "0")}–${String(s.win[1] + 1).padStart(2, "0")}h`
                    : `${String(s.win[0]).padStart(2, "0")}–${String(s.win[1] + 1).padStart(2, "0")}h · เดินเครื่อง ${s.win[2]} ชม.`}
                </span>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Strategy metadata ───────────────────────────────────────────────
const STRATEGIES = [
  { id: "baseline", th: "แผนปัจจุบัน", en: "BASELINE", color: "#0ea5e9" },
  { id: "min-cost", th: "ลดต้นทุน", en: "MIN COST", color: "#6366f1" },
];

// ── Strategy summary card ───────────────────────────────────────────
function StrategyCard({ strat, plan, baselineCost, baselineLitres, isActive, onSelect }) {
  if (!plan) {
    return (
      <button
        onClick={onSelect}
        className="panel rounded-xl p-4 text-left opacity-60 cursor-pointer"
      >
        <div className="text-[10px] uppercase eyebrow text-muted">
          {strat.en}
        </div>
        <div className="text-xs mt-2 text-muted">Loading…</div>
      </button>
    );
  }

  const totalCost = plan.cost?.total_thb ?? 0;
  // Diesel total MWh / day
  const dieselMwh = (plan.rows ?? []).reduce(
    (s, r) => s + (r.diesel_a_mw ?? 0) + (r.diesel_c_mw ?? 0),
    0,
  );
  // SoC at last hour
  const socEnd = plan.rows?.[plan.rows.length - 1]?.soc_pct ?? 0;
  // Revenue = total load × sale rate
  const totalLoadKwh = (plan.rows ?? []).reduce(
    (s, r) => s + (r.load_mw ?? 0) * 1000,
    0,
  );
  const revenue = totalLoadKwh * SALE_BAHT_PER_KWH;
  const net = revenue - totalCost;
  const vsBaseline = baselineCost ? totalCost - baselineCost : 0;
  const vsBaselinePct = baselineCost ? (vsBaseline / baselineCost) * 100 : 0;
  const litres = plan.cost?.diesel_litres ?? 0;
  const litresSaved = baselineLitres ? baselineLitres - litres : 0;

  return (
    <button
      onClick={onSelect}
      className="panel rounded-xl p-4 text-left cursor-pointer transition hover:opacity-95"
      style={{
        borderColor: isActive ? strat.color : "var(--border-soft)",
        borderWidth: isActive ? "2px" : "1px",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div
            className="text-base thai font-semibold"
            style={{ color: strat.color }}
          >
            {strat.th}
          </div>
        </div>
        {isActive && (
          <span
            className="px-1.5 py-0.5 rounded text-[11px] font-bold uppercase eyebrow thai"
            style={{ background: `${strat.color}22`, color: strat.color }}
          >
            กำลังใช้งาน
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <div className="mono font-semibold text-base">
            {fmt2(dieselMwh)}{" "}
            <span className="text-[11px] text-muted thai">MWh ดีเซล</span>
          </div>
          <div className="mono text-[11px] text-muted thai">
            ≈ {Math.round(litres).toLocaleString("th-TH")} ลิตร
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase eyebrow text-muted thai">
            ต้นทุนรวม · 24 ชม.
          </div>
          <div className="mono font-semibold text-base">
            {fmtBaht(totalCost)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase eyebrow text-muted thai">
            กำไรสุทธิ (รายได้ - ต้นทุน)
          </div>
          <div
            className="mono font-semibold"
            style={{ color: net >= 0 ? "#10b981" : "#ef4444" }}
          >
            {net >= 0 ? "+" : ""}
            {fmtBaht(net)}
          </div>
        </div>
        {strat.id !== "baseline" && baselineCost > 0 && (
          <div className="text-right">
            <div className="text-[11px] uppercase eyebrow text-muted thai">
              เทียบกับแผนปัจจุบัน
            </div>
            <div
              className="mono font-semibold"
              style={{ color: vsBaseline <= 0 ? "#10b981" : "#ef4444" }}
            >
              {vsBaseline >= 0 ? "+" : "−"}
              {(Math.abs(vsBaseline) / 1000).toFixed(1)}k ·{" "}
              {vsBaseline >= 0 ? "+" : "−"}
              {Math.abs(vsBaselinePct).toFixed(1)}%
            </div>
            {baselineLitres > 0 && (
              <div className="mono text-[11px] thai" style={{ color: litresSaved >= 0 ? "#10b981" : "#ef4444" }}>
                {litresSaved >= 0 ? "ประหยัดน้ำมัน " : "ใช้น้ำมันเพิ่ม "}
                {Math.abs(Math.round(litresSaved)).toLocaleString("th-TH")} ลิตร
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Source mix breakdown — what to radio to staff ── */}
      <div className="mt-4 pt-3 border-t hairline">
        <SourceMixBreakdown rows={plan.rows ?? []} compact={true} />
      </div>
    </button>
  );
}



// ── Chart tooltip ───────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter((p) => p.value > 0 && !String(p.dataKey).startsWith("_"));
  if (!visible.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="mono text-muted mb-1">
        {label}
      </div>
      {visible.map((p) => {
        if (p.dataKey === "โหลดรวม A+B+C") {
          // Show per-island breakdown
          return (
            <div key={p.dataKey}>
              <div className="flex items-center gap-2">
                <span style={{ color: p.color }}>●</span>
                <span className="text-muted">{p.name}</span>
                <span className="mono">{fmt2(p.value)} MW</span>
              </div>
              {data?._loadA > 0 && (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-muted">Island A</span>
                  <span className="mono">{fmt2(data._loadA)} MW</span>
                </div>
              )}
              {data?._loadB > 0 && (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-muted">Island B</span>
                  <span className="mono">{fmt2(data._loadB)} MW</span>
                </div>
              )}
              {data?._loadC > 0 && (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-muted">Island C</span>
                  <span className="mono">{fmt2(data._loadC)} MW</span>
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span style={{ color: p.color }}>●</span>
            <span className="text-muted">{p.name}</span>
            <span className="mono">{fmt2(p.value)} MW</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────
export function Tab2Dispatch({
  rt,
  hasSolar,
  setHasSolar,
  loading,
  focusedHour,
  onHourClick,
}) {
  // ── Day-ahead / Intra-day mode ──
  const [mode, setMode] = useState("day-ahead");
  const horizonDays = 1;
  const fc = useForecastSeries(mode === "intra-day" ? "6h" : "7day");
  const fcA = useForecastSeries("7day", "A");
  const fcB = useForecastSeries("7day", "B");
  const fcC = useForecastSeries("7day", "C");
  // MILP day-ahead plans (baseline + min-cost). Custom keeps its slider plan (plans.custom).
  const da = useDayAheadPlans({ days: horizonDays, hasSolar, resolution: '15min' });
  const da7 = useDayAheadPlans({ days: 7, hasSolar });
  const todayFull = useTodayFullPlan();
  const intraday = useIntradayAlerts({ soc_pct: 60, grid_available_mw: 1.3 });
  const planActions = useTodayPlanActions();
  const activePlanState = useActivePlan();

  const baselinePlan = da.plans?.baseline;
  const baselineCost = baselinePlan?.cost?.total_thb ?? 0;
  const baselineLitres = baselinePlan?.cost?.diesel_litres ?? 0;

  const activePlan = da.plans?.["min-cost"] ?? da.plans?.baseline;
  const rows = activePlan?.rows ?? [];

  // ── Chart data (dispatch bars + system load forecast line) ──

  // For both 24h and 7d, the dispatch rows start at tomorrow 00:00.
  // The forecast starts at today 09:15. Offset = steps from 09:15 to 00:00 = 59 steps.
  const fcOffset = 59;

  const chartData = rows.map((r, i) => {
    // 15-min resolution: 1:1 mapping with forecast points
    const ptsA = fcA.points || [], ptsB = fcB.points || [], ptsC = fcC.points || [];
    const idx = fcOffset + i;
    let sysLoad = null, loadA = null, loadB = null, loadC = null;
    if (ptsA.length > idx && ptsB.length > idx && ptsC.length > idx) {
      loadA = +(ptsA[idx]?.predicted_safe ?? 0).toFixed(2);
      loadB = +(ptsB[idx]?.predicted_safe ?? 0).toFixed(2);
      loadC = +(ptsC[idx]?.predicted_safe ?? 0).toFixed(2);
      sysLoad = +(loadA + loadB + loadC).toFixed(2);
    }
    const batCharge = Math.max(0, -(r.battery_mw ?? 0));
    const hLabel = `${String(r.hour).padStart(2, "0")}:${String(r.minute ?? 0).padStart(2, "0")}`;
    return {
      h: hLabel,
      Grid: +Math.max(0, (r.grid_mw ?? 0) - batCharge).toFixed(2),
      "ชาร์จ BESS": +(batCharge > 0.01 ? batCharge : 0).toFixed(2),
      Solar: +(r.solar_mw?.toFixed(2) ?? 0),
      "จ่าย BESS": +Math.max(0, r.battery_mw ?? 0).toFixed(2),
      "Diesel A": +((r.diesel_a_mw ?? 0) < 0.01 ? 0 : r.diesel_a_mw).toFixed(2),
      "Diesel C": +((r.diesel_c_mw ?? 0) < 0.01 ? 0 : r.diesel_c_mw).toFixed(2),
      "โหลดรวม A+B+C": sysLoad,
      "_loadA": loadA,
      "_loadB": loadB,
      "_loadC": loadC,
      SoC: +(r.soc_pct?.toFixed(1) ?? 0),
    };
  });

  // ── 7-day chart data ──
  const plan7 = da7.plans?.["min-cost"] ?? da7.plans?.baseline;
  const rows7 = plan7?.rows ?? [];
  const chartData7 = rows7.map((r, i) => {
    const day = r.day ?? 0;
    const batCharge = Math.max(0, -(r.battery_mw ?? 0));
    const serverNow = rt?.server_datetime ? new Date(rt.server_datetime) : new Date();
    const base = new Date(serverNow);
    base.setDate(base.getDate() + 1 + day);
    const dd = String(base.getDate()).padStart(2, "0");
    const mm = String(base.getMonth() + 1).padStart(2, "0");
    const hLabel = `${dd}/${mm} ${String(r.hour).padStart(2, "0")}:00`;
    const ptsA = fcA.points || [], ptsB = fcB.points || [], ptsC = fcC.points || [];
    const s = fcOffset + i * 4, e = s + 4;
    let sysLoad = null, loadA = null, loadB = null, loadC = null;
    if (ptsA.length > s && ptsB.length > s && ptsC.length > s) {
      let sumA = 0, sumB = 0, sumC = 0, n = 0;
      for (let j = s; j < Math.min(e, ptsA.length, ptsB.length, ptsC.length); j++) {
        sumA += (ptsA[j]?.predicted_safe ?? 0);
        sumB += (ptsB[j]?.predicted_safe ?? 0);
        sumC += (ptsC[j]?.predicted_safe ?? 0);
        n++;
      }
      if (n > 0) {
        loadA = +(sumA / n).toFixed(2);
        loadB = +(sumB / n).toFixed(2);
        loadC = +(sumC / n).toFixed(2);
        sysLoad = +(loadA + loadB + loadC).toFixed(2);
      }
    }
    return {
      h: hLabel,
      Grid: +Math.max(0, (r.grid_mw ?? 0) - batCharge).toFixed(2),
      "ชาร์จ BESS": +(batCharge > 0.01 ? batCharge : 0).toFixed(2),
      Solar: +(r.solar_mw?.toFixed(2) ?? 0),
      "จ่าย BESS": +Math.max(0, r.battery_mw ?? 0).toFixed(2),
      "Diesel A": +((r.diesel_a_mw ?? 0) < 0.01 ? 0 : r.diesel_a_mw).toFixed(2),
      "Diesel C": +((r.diesel_c_mw ?? 0) < 0.01 ? 0 : r.diesel_c_mw).toFixed(2),
      "โหลดรวม A+B+C": sysLoad,
      "_loadA": loadA,
      "_loadB": loadB,
      "_loadC": loadC,
      SoC: +(r.soc_pct?.toFixed(1) ?? 0),
    };
  });

  // ── Today full-day chart data (15-min, 00:00–23:45) ──
  const todayRows = todayFull.plan?.rows ?? [];
  const chartDataToday = todayRows.map((r, i) => {
    const batCharge = Math.max(0, -(r.battery_mw ?? 0));
    const hLabel = `${String(r.hour).padStart(2, "0")}:${String(r.minute ?? 0).padStart(2, "0")}`;
    const ptsA = fcA.points || [], ptsB = fcB.points || [], ptsC = fcC.points || [];
    let loadA = null, loadB = null, loadC = null, sysLoad = null;
    if (ptsA.length > i && ptsB.length > i && ptsC.length > i) {
      loadA = +(ptsA[i]?.predicted_safe ?? 0).toFixed(2);
      loadB = +(ptsB[i]?.predicted_safe ?? 0).toFixed(2);
      loadC = +(ptsC[i]?.predicted_safe ?? 0).toFixed(2);
      sysLoad = +(loadA + loadB + loadC).toFixed(2);
    }
    return {
      h: hLabel,
      Grid: +Math.max(0, (r.grid_mw ?? 0) - batCharge).toFixed(2),
      "ชาร์จ BESS": +(batCharge > 0.01 ? batCharge : 0).toFixed(2),
      Solar: +(r.solar_mw?.toFixed(2) ?? 0),
      "จ่าย BESS": +Math.max(0, r.battery_mw ?? 0).toFixed(2),
      "Diesel A": +((r.diesel_a_mw ?? 0) < 0.01 ? 0 : r.diesel_a_mw).toFixed(2),
      "Diesel C": +((r.diesel_c_mw ?? 0) < 0.01 ? 0 : r.diesel_c_mw).toFixed(2),
      "โหลดรวม A+B+C": sysLoad ?? (r.load_mw > 0 ? +r.load_mw.toFixed(2) : null),
      "_loadA": loadA,
      "_loadB": loadB,
      "_loadC": loadC,
    };
  });

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <section className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase eyebrow text-muted thai">
            แผนการจ่ายไฟ
          </div>
          <h1 className="text-xl font-semibold mt-0.5 thai">
            แผนการจ่ายไฟ
          </h1>
          <div className="text-xs text-muted mt-1 thai">
            Diesel #9 <span className="mono">฿12/kWh</span> · Diesel #8{" "}
            <span className="mono">฿15/kWh</span> · ขาย{" "}
            <span className="mono">฿{SALE_BAHT_PER_KWH}/kWh</span> · ดีเซลทุก
            kWh{" "}
            <span style={{ color: "#ef4444" }} className="mono">
              ขาดทุน ฿8–11
            </span>
          </div>
        </div>
      </section>

      {/* ── Mode toggle (day-ahead / intra-day) ── */}
      <DispatchModeToggle mode={mode} setMode={setMode} />

      {mode === "day-ahead" && (
        <>


      {/* ── Solar Scenario toggle ── */}
      <section className="panel rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase eyebrow text-muted thai">
              สถานการณ์ Solar
            </div>
            <div className="text-xs text-muted mt-0.5 thai">
              เปรียบเทียบเกาะปัจจุบัน vs หลังติดตั้ง PV
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setHasSolar(false)}
              className="px-4 py-2 rounded-lg text-sm border cursor-pointer transition hover:opacity-90"
              style={
                !hasSolar
                  ? {
                      borderColor: "var(--primary)",
                      background:
                        "color-mix(in srgb, var(--primary) 10%, transparent)",
                      color: "var(--primary)",
                      fontWeight: 600,
                    }
                  : {
                      borderColor: "var(--border-soft)",
                      background: "var(--surface-2)",
                      color: "var(--muted)",
                    }
              }
            >
              <span className="thai">ไม่มี Solar</span>{" "}
              <span className="text-[11px] ml-1">(ปัจจุบัน)</span>
            </button>
            <button
              onClick={() => setHasSolar(true)}
              className="px-4 py-2 rounded-lg text-sm border cursor-pointer transition hover:opacity-90"
              style={
                hasSolar
                  ? {
                      borderColor: "#f59e0b",
                      background: "rgba(245,158,11,0.10)",
                      color: "#f59e0b",
                      fontWeight: 600,
                    }
                  : {
                      borderColor: "var(--border-soft)",
                      background: "var(--surface-2)",
                      color: "var(--muted)",
                    }
              }
            >
              <FontAwesomeIcon icon={faSolarPanel} className="mr-1" /> <span className="thai">มี Solar</span>{" "}
              <span className="text-[11px] ml-1">(0.8 MWp)</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── strategy cards (แผนปัจจุบัน / ลดต้นทุน) ── */}
      {/* ── diesel warm-up note (ramp-derived; for scheduling start times) ── */}
      <div className="text-[11px] text-muted thai">
        <FontAwesomeIcon icon={faClock} className="mr-1" /> เวลาวอร์มเครื่องดีเซล: Diesel #8 ~1 นาที 42 วินาที · Diesel #9 ~30 วินาที — ต้องสตาร์ทล่วงหน้าก่อนถึงเวลาเป้าหมาย (น้ำมันช่วงวอร์มถูกคิดในต้นทุน + แผนสำรองแล้ว)
      </div>

      {/* ── Plan cost summary ── */}
      {activePlan?.cost && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="panel rounded-xl p-4">
            <div className="text-[10px] uppercase eyebrow text-muted thai">ต้นทุนรวม</div>
            <div className="mono font-bold text-lg mt-1" style={{ color: "var(--primary)" }}>
              {fmtBaht(activePlan.cost.total_thb)}
            </div>
          </div>
          <div className="panel rounded-xl p-4">
            <div className="text-[10px] uppercase eyebrow text-muted thai">ดีเซลรวม</div>
            <div className="mono font-bold text-lg mt-1" style={{ color: "#8b5cf6" }}>
              {Math.round(activePlan.cost.diesel_litres ?? 0).toLocaleString("th-TH")} <span className="text-xs text-muted">ลิตร</span>
            </div>
          </div>
          <div className="panel rounded-xl p-4">
            <div className="text-[10px] uppercase eyebrow text-muted thai">ต้นทุน Grid</div>
            <div className="mono font-bold text-lg mt-1" style={{ color: "var(--primary)" }}>
              {fmtBaht(activePlan.cost.grid_thb)}
            </div>
          </div>
          <div className="panel rounded-xl p-4">
            <div className="text-[10px] uppercase eyebrow text-muted thai">ต้นทุนดีเซล</div>
            <div className="mono font-bold text-lg mt-1" style={{ color: "#ef4444" }}>
              {fmtBaht(activePlan.cost.diesel_thb)}
            </div>
          </div>
        </section>
      )}

      {/* ── 24h Dispatch Chart ── */}
      <section>
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div className="text-xs uppercase eyebrow text-muted thai">
            แผนการจ่ายไฟ 24 ชั่วโมง
          </div>
        </div>

        <div className="panel rounded-xl p-4">
          {loading && !chartData.length ? (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm gap-2">
              <Dot color="var(--primary)" pulse /> <span>กำลังคำนวณ…</span>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart
                data={chartData}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-soft)"
                />
                <XAxis
                  dataKey="h"
                  tickFormatter={(v) => v}
                  tick={{ fontSize: 9, fill: "var(--muted)" }}
                  tickLine={false}
                  interval={7}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  tickLine={false}
                  axisLine={false}
                  unit=" MW"
                  width={48}
                />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                <Bar dataKey="Grid" stackId="a" fill="var(--primary)" name="Grid (จ่ายโหลด)" />
                <Bar dataKey="ชาร์จ BESS" stackId="a" fill="#94a3b8" name="ชาร์จ BESS" />
                <Bar dataKey="Solar" stackId="a" fill="#f59e0b" />
                <Bar dataKey="จ่าย BESS" stackId="a" fill="#10b981" name="จ่าย BESS" />
                <Bar dataKey="Diesel A" stackId="a" fill="#8b5cf6" />
                <Bar
                  dataKey="Diesel C"
                  stackId="a"
                  fill="#ef4444"
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="โหลดรวม A+B+C"
                  name="โหลดรวม A+B+C (Forecast)"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">
              No plan data
            </div>
          )}


        </div>
      </section>

          {/* ── 15-min day-ahead diesel schedule (B1) — replaces the Action Timeline ── */}
          <DieselScheduleSection activePlan={activePlanState.active} onUploaded={activePlanState.refresh} />

          {/* ── 7-day Dispatch Chart ── */}
          <section>
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <div className="text-xs uppercase eyebrow text-muted thai">
                แผนการจ่ายไฟ 7 วันข้างหน้า
              </div>
            </div>
            <div className="panel rounded-xl p-4">
              {da7.loading && !chartData7.length ? (
                <div className="h-[260px] flex items-center justify-center text-muted text-sm gap-2">
                  <Dot color="var(--primary)" pulse /> <span>กำลังคำนวณ…</span>
                </div>
              ) : chartData7.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={chartData7} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                    <XAxis dataKey="h" tickFormatter={(v) => (typeof v === "string" && v.includes(":00") ? v.slice(0, 5) : v)} tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} interval={23} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} unit=" MW" width={48} />
                    <Tooltip content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                    <Bar dataKey="Grid" stackId="a" fill="var(--primary)" name="Grid (จ่ายโหลด)" />
                    <Bar dataKey="ชาร์จ BESS" stackId="a" fill="#94a3b8" name="ชาร์จ BESS" />
                    <Bar dataKey="Solar" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="จ่าย BESS" stackId="a" fill="#10b981" name="จ่าย BESS" />
                    <Bar dataKey="Diesel A" stackId="a" fill="#8b5cf6" />
                    <Bar dataKey="Diesel C" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} />
                    <Line type="monotone" dataKey="โหลดรวม A+B+C" name="โหลดรวม A+B+C (Forecast)" stroke="#f59e0b" strokeWidth={2.5} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex items-center justify-center text-muted text-sm">
                  No plan data
                </div>
              )}
            </div>
          </section>

          {/* ── 7-day diesel fuel reserve (procurement planning) ── */}
          <FuelReservePanel minCost={da7.plans?.["min-cost"]?.cost} />
        </>
      )}

      {mode === "intra-day" && (
        <>
          {/* ── Current status (real reading at the sim clock) ── */}
          <section>
            <div className="text-xs uppercase eyebrow text-muted mb-2 thai">
              สถานะปัจจุบัน · {rt?.server_time ?? "—"}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "โหลดเกาะ C", value: fmt2(rt?.kpi?.island_c_load_mw), unit: "MW", color: "var(--primary)" },
                { label: "SoC แบตเตอรี่", value: fmt1(rt?.kpi?.battery_soc_pct), unit: "%", color: "#10b981" },
                { label: "Line 6 ใช้งาน", value: fmt1(rt?.kpi?.line6_util_pct), unit: "%", color: "#f59e0b" },
                { label: "ต้นทุนเฉลี่ย", value: fmt2(rt?.kpi?.blended_cost_token_per_kwh), unit: "฿/kWh", color: "#6366f1" },
              ].map((k) => (
                <div key={k.label} className="panel rounded-xl p-4">
                  <div className="text-[11px] uppercase eyebrow text-muted thai">{k.label}</div>
                  <div className="mono font-bold text-2xl mt-1" style={{ color: k.color }}>
                    {k.value}
                    <span className="text-xs text-muted ml-1">{k.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Today full-day 24h dispatch chart (15-min) ── */}
          <section>
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <div className="text-xs uppercase eyebrow text-muted thai">
                แผนการจ่ายไฟ 24 ชั่วโมง · วันนี้
              </div>
            </div>
            <div className="panel rounded-xl p-4">
              {todayFull.loading && !chartDataToday.length ? (
                <div className="h-[260px] flex items-center justify-center text-muted text-sm gap-2">
                  <Dot color="var(--primary)" pulse /> <span>กำลังคำนวณ…</span>
                </div>
              ) : chartDataToday.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={chartDataToday} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                    <XAxis dataKey="h" tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} interval={7} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} unit=" MW" width={48} />
                    <Tooltip content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                    <Bar dataKey="Grid" stackId="a" fill="var(--primary)" name="Grid (จ่ายโหลด)" />
                    <Bar dataKey="ชาร์จ BESS" stackId="a" fill="#94a3b8" name="ชาร์จ BESS" />
                    <Bar dataKey="Solar" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="จ่าย BESS" stackId="a" fill="#10b981" name="จ่าย BESS" />
                    <Bar dataKey="Diesel A" stackId="a" fill="#8b5cf6" />
                    <Bar dataKey="Diesel C" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} />
                    <Line type="monotone" dataKey="โหลดรวม A+B+C" name="โหลดรวม A+B+C (Forecast)" stroke="#f59e0b" strokeWidth={2.5} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex items-center justify-center text-muted text-sm">
                  No plan data
                </div>
              )}
            </div>
          </section>

          {/* ── Today full-day diesel schedule table (00:00–23:45) ── */}
          <TodayFullScheduleSection />
        </>
      )}

    </div>
  );
}
