"use client";
import { useMemo } from "react";
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

const fmt1 = (v) => (v == null ? "—" : Number(v).toFixed(1));
const fmt2 = (v) => (v == null ? "—" : Number(v).toFixed(2));

// ── KPI Card ────────────────────────────────────────────────────────
function KPICard({
  icon: I,
  label,
  value,
  unit,
  sub,
  delta,
  accent = "var(--primary)",
}) {
  const TrendIcon =
    delta == null
      ? null
      : delta > 0
        ? Icon.TrendUp
        : delta < 0
          ? Icon.TrendDown
          : null;
  const trendColor =
    delta == null ? "var(--muted)" : delta > 0 ? "#ef4444" : "#10b981";
  return (
    <div className="panel rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs uppercase eyebrow text-muted mb-3">
        {I && <I width="14" height="14" />}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-3xl font-bold mono" style={{ color: accent }}>
            {value}
          </span>
          {unit && <span className="text-sm text-muted">{unit}</span>}
        </div>
        {TrendIcon && (
          <span
            className="text-xs mono inline-flex items-center gap-1 flex-shrink-0"
            style={{ color: trendColor }}
          >
            <TrendIcon width="12" height="12" />
            {Math.abs(delta).toFixed(2)}
          </span>
        )}
      </div>
      {sub && <div className="text-[11px] text-muted mt-2">{sub}</div>}
    </div>
  );
}

// ── Status Badge ────────────────────────────────────────────────────
function StatusBadge({ level, risk }) {
  const meta = {
    normal: { color: "#10b981", th: "ปกติ", en: "ปกติ" },
    watch: { color: "#f59e0b", th: "เฝ้าระวัง", en: "เฝ้าระวัง" },
    high: { color: "#ef4444", th: "เสี่ยงสูง", en: "เสี่ยงสูง" },
  }[level] ?? { color: "#9ca3af", th: "—", en: "—" };
  return (
    <div className="flex items-baseline gap-2">
      <Dot color={meta.color} pulse={level === "high"} />
      <span className="font-semibold thai" style={{ color: meta.color }}>
        {meta.th}
      </span>
      <span className="text-xs uppercase eyebrow" style={{ color: meta.color }}>
        {meta.en}
      </span>
      {risk != null && (
        <span className="text-[11px] text-muted ml-1">
          · ระดับความเสี่ยง {risk}/100
        </span>
      )}
    </div>
  );
}

// ── Source row in Live Telemetry panel ──────────────────────────────
function SourceRow({
  icon: I,
  name,
  sub,
  status,
  value,
  unit,
  updated,
  color,
}) {
  const statusMeta = {
    "on-line": { label: "ออนไลน์", color: "#10b981" },
    standby: { label: "สแตนด์บาย", color: "#9ca3af" },
    warn: { label: "เตือน", color: "#f59e0b" },
    fault: { label: "ขัดข้อง", color: "#ef4444" },
  }[status] ?? { label: status?.toUpperCase() ?? "—", color: "#9ca3af" };
  return (
    <div className="flex items-center gap-4 py-3 border-b hairline last:border-0">
      <div
        className="w-10 h-10 rounded-lg grid place-items-center flex-shrink-0"
        style={{ background: `${color}22`, color }}
      >
        {I && <I width="20" height="20" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{name}</div>
        <div className="text-[11px] text-muted truncate">{sub}</div>
      </div>
      <span
        className="text-xs mono px-2 py-0.5 rounded-full flex-shrink-0 thai"
        style={{ background: `${statusMeta.color}22`, color: statusMeta.color }}
      >
        {statusMeta.label}
      </span>
      <div className="text-right flex-shrink-0 w-24">
        <div className="text-base mono font-semibold" style={{ color }}>
          {value}
        </div>
        <div className="text-[10px] text-muted">{unit}</div>
      </div>
      <div className="text-right flex-shrink-0 hidden md:block w-20">
        <div className="text-xs uppercase eyebrow text-muted thai">
          อัปเดตล่าสุด
        </div>
        <div className="text-[11px] mono">{updated}</div>
      </div>
    </div>
  );
}

// ── Charts ──────────────────────────────────────────────────────────
function LoadTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="mono text-muted mb-1">{label}</div>
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
export function Tab1LiveOps({ rt, history, energyMix, delta }) {
  // "Last sync" = the time the backend stamped on the most recent realtime
  // poll (rt.server_time). NOT the live wall-clock — that was a bug that
  // made the timestamp tick every second instead of every 15-min poll.
  const lastSync = rt?.server_time ?? "--:--:--";

  // ── Load history chart data: Actual (past 24h) + Forecast (next 6h) ──
  // Memoised so the Forecast line is stable across re-renders (the parent
  // re-renders every second for the live clock — without useMemo this would
  // regenerate from scratch each tick).
  // NOTE: must be declared BEFORE any early-return so hook order stays stable.
  const loadData = useMemo(() => {
    const hist =
      history?.points?.map((p) => ({
        t:
          p.hour != null
            ? `${String(p.hour).padStart(2, "0")}:00`
            : (p.ts?.slice(11, 16) ?? ""),
        hour: p.hour ?? parseInt(p.ts?.slice(11, 13) ?? "0"),
        actual: +(p.load_mw?.toFixed(2) ?? 0),
      })) ?? [];
    if (!hist.length) return hist;

    // Anchor: last actual point also carries a forecast value (= its own
    // actual) so the two series share one point and the Forecast line
    // visually starts where Actual ends — no gap.
    const lastEntry = hist[hist.length - 1];
    const merged = hist.map((d, i) =>
      i === hist.length - 1 ? { ...d, forecast: d.actual } : d,
    );
    // Deterministic 6-hour tail — sample the same hour-of-day from history,
    // apply a small fixed taper. NO Math.random() (was causing the line to
    // wiggle on every clock tick).
    for (let i = 1; i <= 6; i++) {
      const futureHour = (lastEntry.hour + i) % 24;
      const sample = hist.find((d) => d.hour === futureHour);
      const base = sample?.actual ?? lastEntry.actual;
      merged.push({
        t: `${String(futureHour).padStart(2, "0")}:00`,
        hour: futureHour,
        actual: null,
        forecast: +(base * 0.97).toFixed(2),
      });
    }
    return merged;
  }, [history]);

  if (!rt) {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm gap-2">
        <Dot color="var(--primary)" pulse />
        <span>กำลังโหลดข้อมูล…</span>
      </div>
    );
  }

  const { kpi, status: overallStatus } = rt;
  const load_mw = kpi?.island_c_load_mw ?? 0;
  const soc_pct = kpi?.battery_soc_pct ?? 0;
  const soc_mwh = kpi?.battery_soc_mwh ?? 0;
  const solar_mw = kpi?.solar_mw ?? 0;
  const risk_score = kpi?.risk_score ?? 0;

  // Renewable share = (Solar + BESS discharge) / Total Load
  // Battery contribution inferred from mix residual
  const lineL6_mw = rt?.lines?.find((l) => l.id === 6)?.flow_mw ?? 0;
  const d8_mw =
    rt?.diesel_units
      ?.filter((u) => u.asset === "diesel_8")
      .reduce((s, u) => s + u.output_mw, 0) ?? 0;
  const d9_mw =
    rt?.diesel_units
      ?.filter((u) => u.asset === "diesel_9")
      .reduce((s, u) => s + u.output_mw, 0) ?? 0;
  const bat_supply = Math.max(
    0,
    load_mw - lineL6_mw - d8_mw - d9_mw - solar_mw,
  );
  const renewable =
    load_mw > 0 ? Math.round(((solar_mw + bat_supply) / load_mw) * 100) : 0;

  // ── Energy mix chart data ──
  const mixData =
    energyMix?.points?.map((p) => ({
      t: p.ts?.slice(11, 16) ?? "",
      Grid: +(p.grid_mw?.toFixed(2) ?? 0),
      Battery: +(p.battery_mw?.toFixed(2) ?? 0),
      "Diesel A": +(p.diesel_a_mw?.toFixed(2) ?? 0),
      "Diesel C": +(p.diesel_c_mw?.toFixed(2) ?? 0),
    })) ?? [];

  // ── Source status data ──
  const sources = rt?.sources ?? [];
  const findSource = (id) => sources.find((s) => s.id === id);
  const grid = findSource("line6");
  const battery = findSource("battery7");
  const diesel8 = findSource("diesel8");
  const diesel9 = findSource("diesel9");
  // updated time from server
  const updatedAt = rt?.server_time ?? "—";

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <section className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs uppercase eyebrow text-muted thai">
            หน้าหลัก · การปฏิบัติการเรียลไทม์
          </div>
          <h1 className="text-xl font-semibold mt-0.5 thai">
            ภาพรวมระบบพลังงานเกาะ C (เกาะเต่า)
          </h1>
        </div>
        <div className="text-xs text-muted thai">
          ซิงค์ล่าสุด · <span className="mono">{lastSync}</span>
        </div>
      </section>

      {/* ── 4 KPI cards ── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          icon={Icon.Gauge}
          label="โหลดปัจจุบันรวม"
          value={fmt2(load_mw)}
          unit="MW"
          sub="โหลดรวมทั้งเกาะ"
          delta={delta}
          accent="var(--primary)"
        />
        <KPICard
          icon={Icon.Battery}
          label="สถานะแบตเตอรี่ (BESS)"
          value={Math.round(soc_pct)}
          unit="%"
          sub={`${fmt1(soc_mwh)} MWh · Lithium-ion`}
          accent="#10b981"
        />
        <KPICard
          icon={Icon.Sun}
          label="สัดส่วนพลังงานหมุนเวียน"
          value={renewable}
          unit="%"
          sub="Solar + BESS / Total"
          accent="#f59e0b"
        />
        <div className="panel rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs uppercase eyebrow text-muted mb-3 thai">
            <Icon.Alert width="14" height="14" />
            <span>การเตือนล่วงหน้า</span>
          </div>
          <StatusBadge
            level={
              overallStatus === "critical"
                ? "high"
                : overallStatus === "warning"
                  ? "watch"
                  : "normal"
            }
            risk={risk_score}
          />
        </div>
      </section>

      {/* ── Load profile + Energy mix charts ── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Load profile */}
        <div className="panel rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-xs uppercase eyebrow text-muted thai">
                โปรไฟล์โหลด
              </div>
              <div className="text-xs text-muted mt-0.5 thai">
                24 ชม. ที่ผ่านมา + คาดการณ์ 6 ชม. ข้างหน้า
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "var(--primary)" }}
                />
                Actual
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "var(--secondary)" }}
                />
                Forecast
              </span>
            </div>
          </div>
          {loadData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={loadData}
                margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
              >
                <defs>
                  <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
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
                  <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--secondary)"
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--secondary)"
                      stopOpacity={0.02}
                    />
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
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  tickLine={false}
                  axisLine={false}
                  unit=" MW"
                />
                <Tooltip content={<LoadTip />} />
                <Area
                  type="monotone"
                  dataKey="actual"
                  name="Actual"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#loadGrad)"
                  dot={false}
                  connectNulls={false}
                  activeDot={(p) =>
                    p.payload?.actual == null ? null : (
                      <circle
                        cx={p.cx}
                        cy={p.cy}
                        r={4}
                        fill="var(--primary)"
                        stroke="var(--bg)"
                        strokeWidth={2}
                      />
                    )
                  }
                />
                <Area
                  type="monotone"
                  dataKey="forecast"
                  name="Forecast"
                  stroke="var(--secondary)"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  fill="url(#fcGrad)"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={(p) =>
                    p.payload?.forecast == null ? null : (
                      <circle cx={p.cx} cy={p.cy} r={4}
                        fill="var(--secondary)" stroke="var(--bg)" strokeWidth={2} />
                    )
                  }
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm">
              No data
            </div>
          )}
        </div>

        {/* Energy mix */}
        <div className="panel rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-[10.5px] uppercase eyebrow text-muted">
                Energy Mix · Per Hour
              </div>
              <div className="text-xs text-muted mt-0.5">Last 12 hours</div>
            </div>
            <div className="flex items-center gap-2 text-[10px] flex-wrap justify-end">
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "var(--primary)" }}
                />
                Grid
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "#10b981" }}
                />
                BESS
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "#f59e0b" }}
                />
                Diesel A
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "#ef4444" }}
                />
                Diesel C
              </span>
            </div>
          </div>
          {mixData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={mixData}
                margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-soft)"
                />
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  tickLine={false}
                  axisLine={false}
                  unit=" MW"
                />
                <Tooltip content={<LoadTip />} />
                <Bar dataKey="Grid" stackId="a" fill="var(--primary)" />
                <Bar dataKey="Battery" stackId="a" fill="#10b981" />
                <Bar dataKey="Diesel A" stackId="a" fill="#f59e0b" />
                <Bar
                  dataKey="Diesel C"
                  stackId="a"
                  fill="#ef4444"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm">
              No data
            </div>
          )}
        </div>
      </section>

      {/* ── Source status · Live telemetry ── */}
      <section className="panel rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-[10.5px] uppercase eyebrow text-muted">
              Source Status · Live Telemetry
            </div>
            <div className="text-xs text-muted mt-0.5">
              5 Sources · 6 Lines · 33kV
            </div>
          </div>
          <span className="text-xs text-muted">Auto · 15 min</span>
        </div>

        <div className="mt-2">
          <SourceRow
            icon={Icon.Cable}
            name="Grid · Line 6"
            sub="Island B → C · 33kV underwater"
            status={grid?.status === "warn" ? "warn" : "on-line"}
            value={fmt2(grid?.value ?? 0)}
            unit="MW"
            updated={grid?.updated ?? updatedAt}
            color="#6366f1"
          />
          <SourceRow
            icon={Icon.Sun}
            name="Solar PV"
            sub="0.8 MWp · diurnal · weather-driven"
            status={solar_mw > 0.05 ? "on-line" : "standby"}
            value={fmt2(solar_mw)}
            unit="MW"
            updated={updatedAt}
            color="#f59e0b"
          />
          <SourceRow
            icon={Icon.Engine}
            name="Diesel Gen #8"
            sub="Island A · 3 × 5 MW max"
            status={diesel8?.status === "idle" ? "standby" : "on-line"}
            value={fmt2(diesel8?.value ?? 0)}
            unit="MW"
            updated={diesel8?.updated ?? updatedAt}
            color="#f97316"
          />
          <SourceRow
            icon={Icon.Engine}
            name="Diesel Gen #9"
            sub="Island C · 2 × 2.5 MW max"
            status={diesel9?.status === "idle" ? "standby" : "on-line"}
            value={fmt2(diesel9?.value ?? 0)}
            unit="MW"
            updated={diesel9?.updated ?? updatedAt}
            color="#ef4444"
          />
          <SourceRow
            icon={Icon.Battery}
            name="BESS · Battery #7"
            sub="30 MWh / 12.5 MW Lithium-ion · Island A"
            status={
              battery?.status === "fault"
                ? "fault"
                : battery?.status === "warn"
                  ? "warn"
                  : "on-line"
            }
            value={Math.round(battery?.value ?? 0)}
            unit="%"
            updated={battery?.updated ?? updatedAt}
            color="#10b981"
          />
        </div>
      </section>
    </div>
  );
}
