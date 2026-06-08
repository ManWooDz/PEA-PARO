"use client";
import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Icon } from "@/components/shared/Icon";
import { Dot } from "@/components/shared/Dot";
import { ApplyPlanDialog } from "@/components/operational/ApplyPlanDialog";
import { useApplyPlan } from "@/hooks/useApplyPlan";
import { DispatchModeToggle } from "@/components/tabs/dispatch/DispatchModeToggle";
import { ForecastChart } from "@/components/tabs/dispatch/ForecastChart";
import { DieselScheduleSection } from "@/components/tabs/dispatch/DieselScheduleSection";
import { IntradayScheduleSection } from "@/components/tabs/dispatch/IntradayScheduleSection";
import { FuelReservePanel } from "@/components/tabs/dispatch/FuelReservePanel";
import { EmergencyRecommendations } from "@/components/tabs/dispatch/EmergencyRecommendations";
import { useForecastSeries } from "@/hooks/useForecastSeries";
import { useDayAheadPlans, useIntradayAlerts, useTodayPlanActions } from "@/hooks/useRecommendations";
import { useActivePlan } from "@/hooks/useActivePlan";

const fmt1 = (v) => (v == null ? "—" : Number(v).toFixed(1));
const fmt2 = (v) => (v == null ? "—" : Number(v).toFixed(2));
const fmtBaht = (v) => (v == null ? "—" : `฿${(v / 1000).toFixed(1)}k`);
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
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="mono text-muted mb-1">
        {typeof label === "number" ? `${String(label).padStart(2, "0")}:00` : label}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span style={{ color: p.color }}>●</span>
          <span className="text-muted">{p.name}</span>
          <span className="mono">{fmt2(p.value)} MW</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────
export function Tab2Dispatch({
  rt,
  activeId,
  applyPlan,
  hasSolar,
  setHasSolar,
  loading,
  activePlanId,
  setActivePlanId,
  focusedHour,
  onHourClick,
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { apply, submitting } = useApplyPlan();

  // ── Day-ahead / Intra-day mode ──
  const [mode, setMode] = useState("day-ahead");
  const [horizonDays, setHorizonDays] = useState(1); // 1 = 24h · 7 = 7 วัน
  const fc = useForecastSeries(mode === "intra-day" ? "6h" : "7day");
  // MILP day-ahead plans (baseline + min-cost). Custom keeps its slider plan (plans.custom).
  const da = useDayAheadPlans({ days: horizonDays, hasSolar });
  const planFor = (id) => da.plans?.[id];
  const intraday = useIntradayAlerts({ soc_pct: 60, grid_available_mw: 1.3 });
  const planActions = useTodayPlanActions();
  const activePlanState = useActivePlan();

  const baselinePlan = da.plans?.baseline;
  const baselineCost = baselinePlan?.cost?.total_thb ?? 0;
  const baselineLitres = baselinePlan?.cost?.diesel_litres ?? 0;

  const activePlan = planFor(activeId) ?? da.plans?.baseline;
  const rows = activePlan?.rows ?? [];

  // ── Apply Plan ──
  const handleConfirmApply = async () => {
    try {
      const result = await apply({
        strategy: activeId,
        horizon_hours: 24,
      });
      setActivePlanId?.(result.plan_id);
    } catch (e) {
      console.error(e);
    }
    setDialogOpen(false);
  };

  // ── Chart data ──
  const isMultiDay = rows.length > 24;
  const chartData = rows.map((r) => ({
    h: isMultiDay ? `D${(r.day ?? 0) + 1} ${String(r.hour).padStart(2, "0")}` : r.hour,
    Grid: +(r.grid_mw?.toFixed(2) ?? 0),
    Solar: +(r.solar_mw?.toFixed(2) ?? 0),
    Battery: +Math.max(0, r.battery_mw ?? 0).toFixed(2),  // only discharge (positive) in stacked bar
    "Diesel A": +((r.diesel_a_mw ?? 0) < 0.01 ? 0 : r.diesel_a_mw).toFixed(2),
    "Diesel C": +((r.diesel_c_mw ?? 0) < 0.01 ? 0 : r.diesel_c_mw).toFixed(2),
    SoC: +(r.soc_pct?.toFixed(1) ?? 0),
  }));

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <section className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase eyebrow text-muted thai">
            แผนการจ่ายไฟ
          </div>
          <h1 className="text-xl font-semibold mt-0.5 thai">
            การจ่ายไฟที่เหมาะสม · 24 ชม.
          </h1>
          <div className="text-xs text-muted mt-1 thai">
            ดีเซล <span className="mono">฿12/kWh</span> · ขาย{" "}
            <span className="mono">฿{SALE_BAHT_PER_KWH}/kWh</span> · ดีเซลทุก
            kWh{" "}
            <span style={{ color: "#ef4444" }} className="mono">
              ขาดทุน ฿8
            </span>
          </div>
        </div>
      </section>

      {/* ── Mode toggle (day-ahead / intra-day) ── */}
      <DispatchModeToggle mode={mode} setMode={setMode} />

      {mode === "day-ahead" && (
        <>
          {/* ── Horizon sub-toggle ── */}
          <div className="flex gap-2">
            <button
              onClick={() => setHorizonDays(1)}
              className="px-3 py-1.5 rounded text-sm border thai cursor-pointer"
              style={
                horizonDays === 1
                  ? { borderColor: "var(--primary)", color: "var(--primary)", fontWeight: 600 }
                  : { borderColor: "var(--border-soft)", color: "var(--muted)" }
              }
            >
              24 ชม.
            </button>
            <button
              onClick={() => setHorizonDays(7)}
              className="px-3 py-1.5 rounded text-sm border thai cursor-pointer"
              style={
                horizonDays === 7
                  ? { borderColor: "var(--primary)", color: "var(--primary)", fontWeight: 600 }
                  : { borderColor: "var(--border-soft)", color: "var(--muted)" }
              }
            >
              7 วัน
            </button>
          </div>

          {/* ── Forecast vs actual (พยากรณ์ทับจริง + Line 6 cap) ── */}
          <ForecastChart points={fc.points.slice(0, horizonDays * 96)} />

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
              ☀️ <span className="thai">มี Solar</span>{" "}
              <span className="text-[11px] ml-1">(0.8 MWp)</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── strategy cards (แผนปัจจุบัน / ลดต้นทุน) ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STRATEGIES.map((s) => (
          <StrategyCard
            key={s.id}
            strat={s}
            plan={planFor(s.id)}
            baselineCost={baselineCost}
            baselineLitres={baselineLitres}
            isActive={activeId === s.id}
            onSelect={() => applyPlan(s.id)}
          />
        ))}
      </section>

      {/* ── 7-day diesel fuel reserve (procurement planning) ── */}
      {horizonDays === 7 && (
        <FuelReservePanel
          baseline={da.plans?.baseline?.cost}
          minCost={da.plans?.["min-cost"]?.cost}
        />
      )}

      {/* ── diesel warm-up note (ramp-derived; for scheduling start times) ── */}
      <div className="text-[11px] text-muted thai">
        ⏱ เวลาวอร์มเครื่องดีเซล: Diesel #8 ~1 นาที 42 วินาที · Diesel #9 ~30 วินาที — ต้องสตาร์ทล่วงหน้าก่อนถึงเวลาเป้าหมาย (น้ำมันช่วงวอร์มถูกคิดในต้นทุน + แผนสำรองแล้ว)
      </div>

      {/* ── 24h Dispatch Chart ── */}
      <section>
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div className="text-xs uppercase eyebrow text-muted thai">
            แผนการจ่ายไฟ 24 ชั่วโมง
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            className="px-4 py-2 rounded text-sm font-semibold cursor-pointer hover:opacity-90 bg-gradient thai"
            style={{ color: "#fff" }}
          >
            ▶ นำแผนไปใช้
          </button>
        </div>
        {activePlanId && (
          <div className="text-xs mono mb-2" style={{ color: "#10b981" }}>
            ● Active plan: {String(activePlanId).slice(0, 8)}
          </div>
        )}

        <div className="panel rounded-xl p-4">
          {loading && !chartData.length ? (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm gap-2">
              <Dot color="var(--primary)" pulse /> <span>กำลังคำนวณ…</span>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-soft)"
                />
                <XAxis
                  dataKey="h"
                  tickFormatter={isMultiDay
                    ? (v) => (typeof v === "string" ? v.replace(" ", "\n") : `${v}h`)
                    : (h) => `${h}h`}
                  tick={{ fontSize: isMultiDay ? 9 : 10, fill: "var(--muted)" }}
                  tickLine={false}
                  interval={isMultiDay ? 23 : 0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  tickLine={false}
                  axisLine={false}
                  unit=" MW"
                />
                <Tooltip content={<ChartTip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "var(--muted)" }}
                />
                <Bar dataKey="Grid" stackId="a" fill="var(--primary)" />
                <Bar dataKey="Solar" stackId="a" fill="#f59e0b" />
                <Bar dataKey="Battery" stackId="a" fill="#10b981" />
                <Bar dataKey="Diesel A" stackId="a" fill="#8b5cf6" />
                <Bar
                  dataKey="Diesel C"
                  stackId="a"
                  fill="#ef4444"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">
              No plan data
            </div>
          )}

          <div className="flex items-center gap-4 mt-2 text-xs text-muted flex-wrap thai">
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-2"
                style={{ background: "rgba(59,130,246,0.18)" }}
              />
              ช่วงเวลาชาร์จแบตเตอรี่ (22:00–08:59)
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-2"
                style={{ background: "rgba(245,158,11,0.18)" }}
              />
              ช่วงเวลาจ่ายไฟแบตเตอรี่ (09:00–21:59)
            </span>
          </div>
        </div>
      </section>

          {/* ── 15-min day-ahead diesel schedule (B1) — replaces the Action Timeline ── */}
          <DieselScheduleSection activePlan={activePlanState.active} onUploaded={activePlanState.refresh} />
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

          {/* ── 6-hour forecast (24 × 15-min) ── */}
          <section>
            <div className="text-xs uppercase eyebrow text-muted mb-2 thai">
              พยากรณ์ 6 ชั่วโมงข้างหน้า · ทุก 15 นาที
            </div>
            <ForecastChart points={fc.points.slice(0, 24)} height={300} />
          </section>

          <div className="text-[11px] thai mb-2 rounded px-2 py-1"
               style={activePlanState.active?.uploaded
                 ? { background: "rgba(16,185,129,0.10)", color: "#10b981", border: "1px solid #10b98140" }
                 : { background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border-soft)" }}>
            {activePlanState.active?.uploaded
              ? `Early-Warning อ้างอิงแผนที่อัปโหลด (${String(activePlanState.active.uploaded_at).slice(11, 16)})`
              : "ยังไม่อัปโหลดแผน — Early-Warning ใช้คำแนะนำมาตรฐาน"}
          </div>
          <IntradayScheduleSection />
          <EmergencyRecommendations
            title="🛠 คำแนะนำการเดินเครื่องวันนี้ · ตามแผนแนะนำ"
            recommendations={planActions.recommendations}
            loading={planActions.loading}
            emptyLabel="🟢 ไม่มีการเปลี่ยนแปลงการเดินเครื่องในช่วงที่เหลือ — เดินตามแผนปกติ"
          />
          <EmergencyRecommendations
            title="⚠ การเตือนล่วงหน้า · ความเสี่ยง (ถ้าจริงแย่กว่าพยากรณ์)"
            recommendations={intraday.recommendations}
            loading={intraday.loading}
            emptyLabel="🟢 ไม่มีความเสี่ยงเด่น — เป็นไปตามแผน"
          />
        </>
      )}

      <ApplyPlanDialog
        open={dialogOpen}
        strategy={activeId}
        onConfirm={handleConfirmApply}
        onCancel={() => setDialogOpen(false)}
        submitting={submitting}
      />
    </div>
  );
}
