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
  ReferenceLine,
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import { Dot } from "@/components/shared/Dot";
import { useWeather } from "@/hooks/useWeather";
import { useForecastAccuracy } from "@/hooks/useForecastAccuracy";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt1 = (v) => (v == null ? "—" : Number(v).toFixed(1));
const fmt0 = (v) => (v == null ? "—" : Number(v).toFixed(0));
const fmt2 = (v) => (v == null ? "—" : Number(v).toFixed(2)); // chart tooltips: match dispatch-tab precision
const fmtB = (v) =>
  v == null
    ? "—"
    : `฿${Number(v).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  grid: "#3b82f6",
  battery: "#10b981",
  dieselC: "#f59e0b",
  dieselA: "#ef4444",
  safe: "#f59e0b",
};

// ── Horizon buttons (only API-supported horizons) ─────────────────────────────
const HORIZONS = [
  { h: 6, label: "6h" },
  { h: 24, label: "24h" },
];

// ── Tooltip components ────────────────────────────────────────────────────────
function ForecastTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="mono text-muted mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span style={{ color: p.color ?? p.fill }}>●</span>
          <span className="text-muted">{p.name}</span>
          <span className="mono">{fmt2(p.value)} MW</span>
        </div>
      ))}
    </div>
  );
}

function DispatchTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="mono text-muted mb-1">{label}</div>
      {payload.map((p) => (
        <div
          key={p.dataKey}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-1">
            <span style={{ color: p.fill }}>●</span>
            <span className="text-muted">{p.name}</span>
          </div>
          <span className="mono">{fmt2(p.value)} MW</span>
        </div>
      ))}
    </div>
  );
}

function WeekTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-muted mb-1">{label}</div>
      {payload.map((p) => (
        <div
          key={p.dataKey}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-1">
            <span style={{ color: p.color }}>●</span>
            <span className="text-muted">{p.name}</span>
          </div>
          <span className="mono">{fmt2(p.value)} MW</span>
        </div>
      ))}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────
function RiskBadge({ val, cap = 8 }) {
  const pct = (val / cap) * 100;
  const color = pct > 90 ? "#ef4444" : pct > 75 ? "#f59e0b" : "#10b981";
  const label = pct > 90 ? "HIGH RISK" : pct > 75 ? "MEDIUM" : "OK";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{
        background: `${color}18`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  );
}

function StrategyBadge({ strategy }) {
  const map = {
    "min-cost": "#3b82f6",
    reliability: "#10b981",
    eco: "#8b5cf6",
    baseline: "#6b7280",
  };
  const c = map[strategy] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mono"
      style={{ background: `${c}18`, color: c, border: `1px solid ${c}40` }}
    >
      {strategy ?? "—"}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function Tab3Forecast({
  fd,
  week,
  hours,
  setHorizon,
  loading,
  focusedHour,
}) {
  // ── Solar/weather overlay state ────────────────────────────────────────────
  const [showWeather, setShowWeather] = useState(false);
  const { weather } = useWeather();
  const accuracy = useForecastAccuracy({ island: "C", horizon: "6h" });

  // Build hour-of-day map of solar irradiance
  const solarByHour = {};
  weather?.points?.forEach((p) => {
    const hh = p.ts.slice(11, 13);
    solarByHour[hh] = p.solar_irradiance_w_m2;
  });

  // ── Chart data ─────────────────────────────────────────────────────────────

  /** 15-min LSTM forecast → AreaChart (all points, thin x-axis labels) */
  const forecastData =
    fd?.forecast_15min?.map((p) => ({
      t: p.datetime?.slice(11, 16) ?? "",
      Load: +(p.load_mw?.toFixed(2) ?? 0),
      Safe: +(p.load_mw_safe?.toFixed(2) ?? 0),
    })) ?? [];

  // Augment chart data with solar values (matched by hour, t is "HH:MM")
  const chartData = forecastData.map((d) => ({
    ...d,
    solar: solarByHour[d.t?.slice(0, 2)] ?? null,
  }));

  /** Hourly dispatch → stacked BarChart */
  const dispatchData =
    fd?.dispatch_hourly?.map((r) => ({
      h: String(r.hour).padStart(2, "0") + ":00",
      Grid: +(r.grid_mw?.toFixed(2) ?? 0),
      Battery: +Math.max(0, r.battery_mw ?? 0).toFixed(2), // discharge only
      "Diesel C": +(r.diesel_c_mw?.toFixed(2) ?? 0),
      "Diesel A": +(r.diesel_a_mw?.toFixed(2) ?? 0),
    })) ?? [];

  /** 7-day daily forecast → grouped BarChart */
  const weekData =
    week?.days?.map((d) => ({
      day: d.date?.slice(5) ?? "",
      Peak: +(d.peak_mw?.toFixed(2) ?? 0),
      Avg: +(d.avg_mw?.toFixed(2) ?? 0),
      Min: +(d.min_mw?.toFixed(2) ?? 0),
    })) ?? [];

  // ── KPI helpers ────────────────────────────────────────────────────────────
  const peakSafe =
    fd?.forecast_15min?.reduce(
      (mx, p) => Math.max(mx, p.load_mw_safe ?? 0),
      0,
    ) ?? 0;
  const cost = fd?.cost;

  // x-axis label thinning: ~8 labels across the chart
  const xInterval =
    forecastData.length > 8 ? Math.floor(forecastData.length / 8) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── horizon selector ── */}
      <section>
        <div className="text-xs uppercase eyebrow text-muted mb-3 thai">
          ช่วงพยากรณ์
        </div>
        <div className="flex gap-2 flex-wrap">
          {HORIZONS.map(({ h, label }) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className="px-4 py-1.5 rounded-lg text-sm border font-medium mono transition cursor-pointer"
              style={
                hours === h
                  ? {
                      borderColor: "var(--primary)",
                      background:
                        "color-mix(in srgb, var(--primary) 10%, transparent)",
                      color: "var(--primary)",
                    }
                  : {
                      borderColor: "var(--border-soft)",
                      background: "var(--surface-2)",
                      color: "var(--muted)",
                    }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ── model / run info ── */}
      {fd && (
        <section>
          <div className="text-xs uppercase eyebrow text-muted mb-3 thai">
            ข้อมูลโมเดลพยากรณ์ LSTM
          </div>
          <div className="panel rounded-xl p-4 flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-[11px] text-muted eyebrow uppercase mb-0.5 thai">
                โมเดล
              </div>
              <div className="font-semibold mono">LSTM · Island C</div>
            </div>
            <div>
              <div className="text-[11px] text-muted eyebrow uppercase mb-0.5 thai">
                กลยุทธ์
              </div>
              <StrategyBadge strategy={fd.strategy} />
            </div>
            <div>
              <div className="text-[11px] text-muted eyebrow uppercase mb-0.5 thai">
                ส่วนเผื่อความปลอดภัย
              </div>
              <div className="font-semibold mono">
                +{(fd.margin_mw * 1000).toFixed(0)} kW
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted eyebrow uppercase mb-0.5 thai">
                MAPE · LSTM+Margin
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold mono">
                  {accuracy ? `${accuracy.mape_pct.toFixed(2)}%` : "—"}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted eyebrow uppercase mb-0.5 thai">
                โหลดสูงสุด (ปลอดภัย)
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold mono">{fmt1(peakSafe)} MW</span>
                <RiskBadge val={peakSafe} />
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted eyebrow uppercase mb-0.5 thai">
                สร้างเมื่อ
              </div>
              <div className="font-semibold mono text-xs">
                {fd.generated_at
                  ? new Date(fd.generated_at).toLocaleTimeString("th-TH", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Bangkok",
                    })
                  : "—"}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── LSTM forecast chart: raw + safe-margin overlay ── */}
      <section>
        <div className="text-xs uppercase eyebrow text-muted mb-3 thai">
          พยากรณ์โหลด LSTM ({hours} ชม.) — ทุก 15 นาที
        </div>
        <div className="panel rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase eyebrow text-muted thai">
              พยากรณ์เทียบกับความจุ
            </div>
            <button
              onClick={() => setShowWeather((v) => !v)}
              className="text-xs px-2.5 py-1 rounded border cursor-pointer transition hover:opacity-80 thai"
              style={{
                borderColor: showWeather ? "#f59e0b" : "var(--border-soft)",
                background: showWeather
                  ? "rgba(245,158,11,0.10)"
                  : "var(--surface-2)",
                color: showWeather ? "#f59e0b" : "var(--muted)",
              }}
            >
              ☀️ แสดงแนวโน้ม Solar / อากาศ
            </button>
          </div>
          {loading && !forecastData.length ? (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm gap-2">
              <Dot color="var(--primary)" pulse />
              <span>กำลังคำนวณ LSTM…</span>
            </div>
          ) : forecastData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
              >
                <defs>
                  <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--primary)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--primary)"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                  <linearGradient id="safeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.safe} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={C.safe} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-soft)"
                />
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  tickLine={false}
                  interval={xInterval}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  tickLine={false}
                  axisLine={false}
                  unit=" MW"
                />
                {showWeather && (
                  <>
                    <YAxis
                      yAxisId="solar"
                      orientation="right"
                      tick={{ fontSize: 10, fill: "#f59e0b" }}
                      tickLine={false}
                      axisLine={false}
                      unit=" W/m²"
                      domain={[0, 1000]}
                    />
                    <Line
                      yAxisId="solar"
                      type="monotone"
                      dataKey="solar"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      dot={false}
                      name="Solar irradiance"
                    />
                  </>
                )}
                <Tooltip content={<ForecastTip />} />
                <ReferenceLine
                  y={8}
                  stroke="#ef4444"
                  strokeDasharray="4 2"
                  label={{
                    value: "Line 6 Cap 8 MW",
                    position: "insideTopRight",
                    fontSize: 9,
                    fill: "#ef4444",
                  }}
                />
                {focusedHour != null && (
                  <ReferenceLine
                    x={`${String(focusedHour).padStart(2, "0")}:00`}
                    stroke="#f59e0b"
                    strokeDasharray="3 3"
                    label={{
                      value: `from Dispatch h${focusedHour}`,
                      position: "top",
                      fontSize: 10,
                      fill: "#f59e0b",
                    }}
                  />
                )}
                {/* LSTM + safety margin — the official forecast used by dispatch */}
                <Area
                  type="monotone"
                  dataKey="Safe"
                  name="LSTM + Margin"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#fcGrad)"
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm">
              No forecast data
            </div>
          )}
        </div>
      </section>

      {/* ── Dispatch plan stacked bar chart ── */}
      {dispatchData.length > 0 && (
        <section>
          <div className="text-xs uppercase eyebrow text-muted mb-3 thai">
            แผนการจ่ายไฟ · 24 ชม.
          </div>
          <div className="panel rounded-xl p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={dispatchData}
                margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-soft)"
                />
                <XAxis
                  dataKey="h"
                  tick={{ fontSize: 9, fill: "var(--muted)" }}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  tickLine={false}
                  axisLine={false}
                  unit=" MW"
                />
                <Tooltip content={<DispatchTip />} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                <ReferenceLine y={8} stroke="#ef4444" strokeDasharray="4 2" />
                <Bar
                  dataKey="Grid"
                  stackId="s"
                  fill={C.grid}
                  name="Grid"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="Battery"
                  stackId="s"
                  fill={C.battery}
                  name="Battery"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="Diesel C"
                  stackId="s"
                  fill={C.dieselC}
                  name="Diesel C"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="Diesel A"
                  stackId="s"
                  fill={C.dieselA}
                  name="Diesel A"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── Cost breakdown cards ── */}
      {cost && (
        <section>
          <div className="text-xs uppercase eyebrow text-muted mb-3 thai">
            รายละเอียดต้นทุนพลังงาน
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Grid", val: cost.grid_thb, color: C.grid },
              { label: "Battery", val: cost.battery_thb, color: C.battery },
              { label: "Diesel", val: cost.diesel_thb, color: C.dieselC },
              {
                label: "Total",
                val: cost.total_thb,
                color: "var(--primary)",
                bold: true,
              },
            ].map(({ label, val, color, bold }) => (
              <div
                key={label}
                className="panel rounded-xl p-4 flex flex-col gap-1"
              >
                <div className="text-[11px] eyebrow uppercase text-muted thai">
                  {label}
                </div>
                <div
                  className={`mono ${bold ? "text-base font-bold" : "text-sm font-semibold"}`}
                  style={{ color }}
                >
                  {fmtB(val)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 7-day forecast bar chart ── */}
      <section>
        <div className="text-xs uppercase eyebrow text-muted mb-3 thai">
          พยากรณ์ล่วงหน้า 7 วัน
        </div>
        <div className="panel rounded-xl p-4">
          {loading && !weekData.length ? (
            <div className="h-[200px] flex items-center justify-center text-muted text-sm gap-2">
              <Dot color="var(--primary)" pulse /> <span>กำลังโหลด…</span>
            </div>
          ) : weekData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={weekData}
                margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-soft)"
                />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  tickLine={false}
                  axisLine={false}
                  unit=" MW"
                />
                <Tooltip content={<WeekTip />} />
                <ReferenceLine y={8} stroke="#ef4444" strokeDasharray="4 2" />
                <Bar
                  dataKey="Min"
                  fill="#334155"
                  radius={[0, 0, 0, 0]}
                  name="Min"
                />
                <Bar
                  dataKey="Avg"
                  fill="var(--primary)"
                  radius={[0, 0, 0, 0]}
                  name="Avg"
                />
                <Bar
                  dataKey="Peak"
                  fill="#f59e0b"
                  radius={[2, 2, 0, 0]}
                  name="Peak"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted text-sm">
              No 7-day data
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
