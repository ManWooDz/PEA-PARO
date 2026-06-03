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
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { Icon } from "@/components/shared/Icon";
import { Dot } from "@/components/shared/Dot";
import { ApplyPlanDialog } from "@/components/operational/ApplyPlanDialog";
import { useApplyPlan } from "@/hooks/useApplyPlan";
import { DispatchModeToggle } from "@/components/tabs/dispatch/DispatchModeToggle";
import { ForecastChart } from "@/components/tabs/dispatch/ForecastChart";
import { ActionTimeline } from "@/components/tabs/dispatch/ActionTimeline";
import { EmergencyRecommendations } from "@/components/tabs/dispatch/EmergencyRecommendations";
import { ScenarioCards } from "@/components/tabs/dispatch/ScenarioCards";
import { useForecastSeries } from "@/hooks/useForecastSeries";
import { useDayAheadPlans, useIntradayAlerts, useIntradayScenarios } from "@/hooks/useRecommendations";

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
    color: "#f97316",
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
function StrategyCard({ strat, plan, baselineCost, isActive, onSelect }) {
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

// ── Slider row in Custom Dispatch ──────────────────────────────────
function SliderRow({ label, sub, color, value, onChange, window, onWindow }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[110px_minmax(0,1fr)_minmax(0,160px)] gap-3 items-center py-3 border-b hairline last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate" style={{ color }}>
          {label}
        </div>
        <div className="text-[10px] text-muted truncate">{sub}</div>
      </div>
      <div className="flex items-center gap-3 min-w-0">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          className="tk flex-1 min-w-0"
          onChange={(e) => onChange(parseInt(e.target.value))}
        />
        <span
          className="mono text-sm font-semibold w-10 text-right flex-shrink-0"
          style={{ color }}
        >
          {value}%
        </span>
      </div>
      <div className="flex items-center gap-1 text-xs min-w-0 justify-end">
        <select
          value={window[0]}
          onChange={(e) => onWindow([parseInt(e.target.value), window[1]])}
          className="panel-2 border hairline rounded px-1 py-0.5 mono text-[11px] min-w-0"
        >
          {Array.from({ length: 25 }, (_, i) => (
            <option key={i} value={i}>
              {String(i).padStart(2, "0")}
            </option>
          ))}
        </select>
        <span className="text-muted text-[10px]">→</span>
        <select
          value={window[1]}
          onChange={(e) => onWindow([window[0], parseInt(e.target.value)])}
          className="panel-2 border hairline rounded px-1 py-0.5 mono text-[11px] min-w-0"
        >
          {Array.from({ length: 25 }, (_, i) => (
            <option key={i} value={i}>
              {String(i).padStart(2, "0")}
            </option>
          ))}
        </select>
        <span className="text-muted text-[10px] flex-shrink-0">h</span>
      </div>
    </div>
  );
}

// ── Chart tooltip ───────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="mono text-muted mb-1">
        {String(label).padStart(2, "0")}:00
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
  plans,
  activeId,
  applyPlan,
  customCfg,
  setCustomCfg,
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
  const planFor = (id) => (id === "custom" ? plans?.custom : da.plans?.[id]);
  const intraday = useIntradayAlerts({ soc_pct: 60, grid_available_mw: 1.3 });
  const scenarioData = useIntradayScenarios({ soc_pct: 60 });

  const baselinePlan = da.plans?.baseline;
  const baselineCost = baselinePlan?.cost?.total_thb ?? 0;

  const activePlan = planFor(activeId) ?? da.plans?.baseline;
  const rows = activePlan?.rows ?? [];

  // ── Custom slider helpers ──
  const setShare = (k, v) =>
    setCustomCfg((c) => ({ ...c, shares: { ...c.shares, [k]: v } }));
  const setWindow = (k, v) =>
    setCustomCfg((c) => ({ ...c, windows: { ...c.windows, [k]: v } }));

  const customCost = plans?.custom?.cost?.total_thb ?? 0;
  const customRows = plans?.custom?.rows ?? [];
  const customTotalLoadKwh = customRows.reduce(
    (s, r) => s + (r.load_mw ?? 0) * 1000,
    0,
  );
  const customNet = customTotalLoadKwh * SALE_BAHT_PER_KWH - customCost;

  // ── Apply Plan ──
  const handleConfirmApply = async () => {
    try {
      const result = await apply({
        strategy: activeId,
        horizon_hours: 24,
        custom_cfg: activeId === "custom" ? customCfg : null,
      });
      setActivePlanId?.(result.plan_id);
    } catch (e) {
      console.error(e);
    }
    setDialogOpen(false);
  };

  // ── Chart data ──
  const chartData = rows.map((r) => ({
    h: r.hour,
    Grid: +(r.grid_mw?.toFixed(2) ?? 0),
    Solar: +(r.solar_mw?.toFixed(2) ?? 0),
    Battery: +(r.battery_mw?.toFixed(2) ?? 0),
    "Diesel A": +(r.diesel_a_mw?.toFixed(2) ?? 0),
    "Diesel C": +(r.diesel_c_mw?.toFixed(2) ?? 0),
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
            isActive={activeId === s.id}
            onSelect={() => applyPlan(s.id)}
          />
        ))}
      </section>

      {/* ── Custom Dispatch ── */}
      <section className="panel rounded-xl p-5">
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Icon.Sliders width="16" height="16" />
              <span className="text-base font-semibold thai">
                Custom Dispatch
              </span>
            </div>
            <div className="text-xs uppercase eyebrow text-muted mt-1 thai">
              สัดส่วนต่อแหล่งจ่ายไฟ + ช่วงเวลาทำงาน
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase eyebrow text-muted thai">
              ต้นทุนแผนกำหนดเอง
            </div>
            <div className="text-lg font-bold mono">{fmtBaht(customCost)}</div>
            <div
              className="text-[11px] mono"
              style={{ color: customNet >= 0 ? "#10b981" : "#ef4444" }}
            >
              สุทธิ {customNet >= 0 ? "+" : ""}
              {fmtBaht(customNet)}
            </div>
          </div>
        </div>

        <div>
          <SliderRow
            label="BESS"
            sub="Battery #7 · 30 MWh / 12.5 MW"
            color="#10b981"
            value={customCfg.shares.battery ?? 0}
            onChange={(v) => setShare("battery", v)}
            window={customCfg.windows.battery ?? [9, 22]}
            onWindow={(w) => setWindow("battery", w)}
          />
          <SliderRow
            label="Diesel #8"
            sub="Island A · 3 × 5 MW"
            color="#f97316"
            value={customCfg.shares.diesel_a ?? 0}
            onChange={(v) => setShare("diesel_a", v)}
            window={customCfg.windows.diesel_a ?? [19, 22]}
            onWindow={(w) => setWindow("diesel_a", w)}
          />
          <SliderRow
            label="Diesel #9"
            sub="Island C · 2 × 2.5 MW"
            color="#ef4444"
            value={customCfg.shares.diesel_c ?? 0}
            onChange={(v) => setShare("diesel_c", v)}
            window={customCfg.windows.diesel_c ?? [18, 22]}
            onWindow={(w) => setWindow("diesel_c", w)}
          />
          {hasSolar && (
            <SliderRow
              label="Solar"
              sub="PV Array · 0.8 MWp"
              color="#f59e0b"
              value={customCfg.shares.solar ?? 0}
              onChange={(v) => setShare("solar", v)}
              window={customCfg.windows.solar ?? [7, 18]}
              onWindow={(w) => setWindow("solar", w)}
            />
          )}
        </div>

        {/* ── Source mix breakdown of the custom plan ── */}
        {customRows.length > 0 && (
          <div className="mt-4 pt-3 border-t hairline">
            <SourceMixBreakdown rows={customRows} compact={false} />
          </div>
        )}

        <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
          <button
            onClick={() => applyPlan("custom")}
            className="px-3 py-1.5 rounded text-sm border hairline cursor-pointer hover:opacity-80"
            style={{
              background:
                activeId === "custom"
                  ? "rgba(14,165,233,0.10)"
                  : "var(--surface-2)",
              color: activeId === "custom" ? "var(--primary)" : "var(--muted)",
              borderColor:
                activeId === "custom" ? "var(--primary)" : "var(--border-soft)",
            }}
          >
            ใช้แผนแบบกำหนดเอง
          </button>
          <div className="text-[10px] text-muted thai flex items-center gap-1.5">
            <Icon.Radio width="12" height="12" />:
            แหล่งที่ต้องวิทยุแจ้งเจ้าหน้าที่ภาคสนาม (BESS / Diesel)
          </div>
        </div>
      </section>

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
                <ReferenceArea
                  x1={0}
                  x2={9}
                  fill="#3b82f6"
                  fillOpacity={0.06}
                />
                <ReferenceArea
                  x1={22}
                  x2={23.5}
                  fill="#3b82f6"
                  fillOpacity={0.06}
                />
                <ReferenceArea
                  x1={9}
                  x2={22}
                  fill="#f59e0b"
                  fillOpacity={0.06}
                />
                <XAxis
                  dataKey="h"
                  tickFormatter={(h) => `${h}h`}
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  tickLine={false}
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
                <ReferenceLine
                  y={8}
                  stroke="#ef4444"
                  strokeDasharray="4 2"
                  label={{
                    value: "Line 6 Cap",
                    position: "right",
                    fontSize: 9,
                    fill: "#ef4444",
                  }}
                />
                <Bar dataKey="Grid" stackId="a" fill="var(--primary)" />
                <Bar dataKey="Solar" stackId="a" fill="#f59e0b" />
                <Bar dataKey="Battery" stackId="a" fill="#10b981" />
                <Bar dataKey="Diesel A" stackId="a" fill="#f97316" />
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

          {/* ── Action Timeline (day-ahead) — replaces the old hourly table ── */}
          <section>
            <div className="text-xs uppercase eyebrow text-muted mb-3 thai">
              ★ ไทม์ไลน์คำสั่ง · สิ่งที่ต้องทำ
            </div>
            <ActionTimeline recommendations={da.plans?.[activeId === "custom" ? "min-cost" : activeId]?.recommendations ?? []} />
          </section>
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

          <EmergencyRecommendations
            recommendations={intraday.recommendations}
            loading={intraday.loading}
          />

          <ScenarioCards
            scenarios={scenarioData.scenarios}
            loading={scenarioData.loading}
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
