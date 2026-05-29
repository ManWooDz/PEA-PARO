"use client";
import { useState } from "react";
import { Icon } from "@/components/shared/Icon";
import { Dot } from "@/components/shared/Dot";

const LEVEL_ORDER = { high: 0, medium: 1, low: 2, resolved: 3 };

const LEVEL_META = {
  high: { color: "#ef4444", th: "เสี่ยงสูง", en: "HIGH RISK" },
  medium: { color: "#f59e0b", th: "เฝ้าระวัง", en: "WATCH" },
  low: { color: "#3b82f6", th: "แจ้งเตือน", en: "INFO" },
  resolved: { color: "#10b981", th: "แก้ไขแล้ว", en: "RESOLVED" },
};

function levelBadge(level) {
  const m = LEVEL_META[level] ?? LEVEL_META.low;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
      style={{ background: `${m.color}22`, color: m.color }}
    >
      <span className="thai font-semibold">{m.th}</span>
    </span>
  );
}

// ── Notification channel row ────────────────────────────────────────
function ChannelRow({ icon: I, name, sub, status, color }) {
  const sMeta = {
    CONNECTED: { color: "#10b981" },
    IDLE: { color: "#9ca3af" },
    ERROR: { color: "#ef4444" },
  }[status] ?? { color: "#9ca3af" };
  return (
    <div className="flex items-center gap-3 py-2.5 border-b hairline last:border-0">
      <div
        className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0"
        style={{ background: `${color}22`, color }}
      >
        {I && <I width="18" height="18" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{name}</div>
        <div className="text-xs text-muted truncate">{sub}</div>
      </div>
      <span
        className="text-[11px] mono px-2 py-0.5 rounded-full"
        style={{ background: `${sMeta.color}22`, color: sMeta.color }}
      >
        {status}
      </span>
    </div>
  );
}

// ── Alert log row ───────────────────────────────────────────────────
function LogRow({ alert }) {
  return (
    <tr className="border-b hairline last:border-0 row-hover">
      <td className="px-3 py-2 mono text-xs whitespace-nowrap">{alert.time}</td>
      <td className="px-3 py-2">{levelBadge(alert.level)}</td>
      <td className="px-3 py-2 text-xs">
        <div className="font-medium thai">{alert.title}</div>
        {alert.detail && (
          <div className="text-xs text-muted mt-0.5 thai">{alert.detail}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          className="text-[11px] uppercase eyebrow thai"
          style={{ color: alert.status === "resolved" ? "#10b981" : "#f59e0b" }}
        >
          {alert.status === "resolved" ? "แก้ไขแล้ว" : "เปิดอยู่"}
        </span>
      </td>
    </tr>
  );
}

// ── Spotlight (top) alert card ──────────────────────────────────────
function SpotlightAlert({ alert, onResolve, onViewDispatch }) {
  if (!alert) {
    return (
      <div className="panel rounded-xl p-6 flex flex-col items-center text-center gap-2">
        <div
          className="w-12 h-12 rounded-full grid place-items-center"
          style={{ background: "rgba(16,185,129,0.10)", color: "#10b981" }}
        >
          <Icon.Check width="24" height="24" />
        </div>
        <div className="font-medium thai">ไม่มีการแจ้งเตือนที่ใช้งานอยู่</div>
        <div className="text-xs text-muted thai">ระบบทำงานปกติ</div>
      </div>
    );
  }

  const m = LEVEL_META[alert.level] ?? LEVEL_META.medium;

  return (
    <div
      className="panel rounded-xl p-5"
      style={{ borderLeft: `4px solid ${m.color}` }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Dot color={m.color} pulse={alert.level === "high"} />
        <span className="thai font-semibold" style={{ color: m.color }}>
          {m.th}
        </span>
        <span className="mono text-muted text-xs ml-2">{alert.time}</span>
        <span className="text-muted text-xs thai">
          · การแจ้งเตือน #{alert.id}
        </span>
      </div>

      <h3 className="text-base font-semibold mt-2 thai leading-snug">
        {alert.title}
      </h3>
      {alert.detail && (
        <p className="text-sm text-muted mt-2 thai">{alert.detail}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        {alert.forecast_peak_mw != null && (
          <div className="panel-2 rounded-lg p-3">
            <div className="text-[11px] uppercase eyebrow text-muted thai">
              พยากรณ์โหลดสูงสุด
            </div>
            <div
              className="text-base font-bold mono"
              style={{ color: m.color }}
            >
              {alert.forecast_peak_mw.toFixed(2)} MW
            </div>
            <div className="text-[11px] text-muted">19:00–21:00</div>
          </div>
        )}
        {alert.battery_soc_pct != null && (
          <div className="panel-2 rounded-lg p-3">
            <div className="text-[11px] uppercase eyebrow text-muted thai">
              SoC แบตเตอรี่ @ จุดสูงสุด
            </div>
            <div
              className="text-base font-bold mono"
              style={{ color: m.color }}
            >
              {alert.battery_soc_pct.toFixed(0)}%
            </div>
            <div className="text-[11px] text-muted thai">ต่ำกว่าเกณฑ์ 20%</div>
          </div>
        )}
        {alert.recommended_action && (
          <div className="panel-2 rounded-lg p-3">
            <div className="text-[11px] uppercase eyebrow text-muted thai">
              ข้อเสนอแนะ
            </div>
            <div className="text-sm font-medium mt-0.5 thai">
              {alert.recommended_action}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          onClick={() => onResolve?.(alert.id, "diesel_confirmed")}
          className="px-3 py-2 rounded text-sm font-semibold cursor-pointer hover:opacity-90 inline-flex items-center gap-2"
          style={{ background: m.color, color: "#fff" }}
        >
          <Icon.Check width="14" height="14" />
          <span className="thai">ยืนยันเดินเครื่องดีเซล</span>
        </button>
        <button
          className="px-3 py-2 rounded text-sm border hairline cursor-pointer hover:opacity-80 inline-flex items-center gap-2 panel-2"
          onClick={() => onViewDispatch?.()}
        >
          <Icon.Calendar width="14" height="14" />
          <span className="thai">ดู Dispatch Plan</span>
        </button>
        <button
          className="px-3 py-2 rounded text-sm border hairline cursor-pointer hover:opacity-80 inline-flex items-center gap-2 panel-2"
          onClick={(e) => e.preventDefault()}
        >
          <Icon.Send width="14" height="14" />
          <span className="thai">ส่งแจ้งเตือน LINE</span>
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────
export function Tab4Alerts({
  activeAlerts,
  resolvedAlerts,
  resolve,
  loading,
  onViewDispatch,
}) {
  const [filter, setFilter] = useState("all");

  const allAlerts = [...(activeAlerts ?? []), ...(resolvedAlerts ?? [])];
  const sorted = [...(activeAlerts ?? [])].sort(
    (a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9),
  );
  const top = sorted[0] ?? null;

  // Summary counts
  const highCount = activeAlerts?.filter((a) => a.level === "high").length ?? 0;
  const mediumCount =
    activeAlerts?.filter((a) => a.level === "medium").length ?? 0;
  const lowCount = activeAlerts?.filter((a) => a.level === "low").length ?? 0;
  const resolvedCount = resolvedAlerts?.length ?? 0;

  // Filtered log
  const filtered = allAlerts.filter((a) => {
    if (filter === "all") return true;
    if (filter === "open") return a.status !== "resolved";
    if (filter === "high") return a.level === "high";
    if (filter === "medium") return a.level === "medium";
    if (filter === "resolved") return a.status === "resolved";
    return true;
  });

  const FILTERS = [
    { id: "all", label: "ทั้งหมด" },
    { id: "open", label: "เปิดอยู่" },
    { id: "high", label: "เสี่ยงสูง" },
    { id: "medium", label: "เฝ้าระวัง" },
    { id: "resolved", label: "แก้ไขแล้ว" },
  ];

  return (
    <div className="space-y-6 lg:min-h-[calc(100vh-7.5rem)] flex flex-col">
      {/* ── Header ── */}
      <section className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs uppercase eyebrow text-muted thai">
            ระบบแจ้งเตือนล่วงหน้า
          </div>
          <h1 className="text-xl font-semibold mt-0.5 thai">
            การแจ้งเตือนและการจัดการ
          </h1>
        </div>
        <div className="text-xs text-muted">
          <span className="thai">รีเฟรชอัตโนมัติ</span> ·{" "}
          <span className="mono">15 min</span>
        </div>
      </section>

      {/* ── Top alert + Notification channels + Summary ── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <SpotlightAlert
          alert={top}
          onResolve={resolve}
          onViewDispatch={onViewDispatch}
        />

        <div className="space-y-4">
          {/* Notification Channels */}
          <div className="panel rounded-xl p-4">
            <div className="text-xs uppercase eyebrow text-muted mb-2 thai">
              ช่องทางการแจ้งเตือน
            </div>
            <div>
              <ChannelRow
                icon={Icon.Line}
                name="LINE Notify API"
                sub="15 ผู้รับ · ทีมปฏิบัติการเกาะเต่า"
                status="CONNECTED"
                color="#06c755"
              />
              <ChannelRow
                icon={Icon.Message}
                name="SMS Gateway"
                sub="8 หมายเลข · ผู้บริหาร PEA"
                status="CONNECTED"
                color="#10b981"
              />
              <ChannelRow
                icon={Icon.Mail}
                name="Email"
                sub="soc@pea.co.th · 24/7"
                status="IDLE"
                color="#6366f1"
              />
            </div>
          </div>

          {/* Alert summary */}
          <div className="panel rounded-xl p-4">
            <div className="text-xs uppercase eyebrow text-muted mb-3 thai">
              สรุปการแจ้งเตือน · วันนี้
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "เสี่ยงสูง", count: highCount, color: "#ef4444" },
                { label: "เฝ้าระวัง", count: mediumCount, color: "#f59e0b" },
                { label: "แจ้งเตือน", count: lowCount, color: "#3b82f6" },
                { label: "แก้ไขแล้ว", count: resolvedCount, color: "#10b981" },
              ].map(({ label, count, color }) => (
                <div key={label} className="text-center">
                  <div className="text-2xl font-bold mono" style={{ color }}>
                    {count}
                  </div>
                  <div className="text-[10px] uppercase eyebrow text-muted mt-0.5 thai">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Alert log ── */}
      <section className="flex-1 flex flex-col min-h-0">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-baseline gap-3">
            <div className="text-xs uppercase eyebrow text-muted thai">
              ประวัติการแจ้งเตือน
            </div>
            <span className="text-xs text-muted mono">
              {filtered.length} รายการ
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => {
              const isActive = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className="px-2.5 py-1 rounded text-xs cursor-pointer transition"
                  style={
                    isActive
                      ? {
                          background: "var(--primary)",
                          color: "#fff",
                          fontWeight: 600,
                        }
                      : {
                          background: "var(--surface-2)",
                          color: "var(--muted)",
                        }
                  }
                >
                  <span className="thai">{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="panel rounded-xl overflow-auto flex-1">
          {loading && !filtered.length ? (
            <div className="flex items-center justify-center h-32 text-muted text-sm gap-2">
              <Dot color="var(--primary)" pulse />{" "}
              <span className="thai">กำลังโหลด…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted text-sm thai">
              ไม่พบรายการ
            </div>
          ) : (
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="border-b hairline">
                  {["เวลา", "ระดับ", "รายละเอียด", "สถานะ"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-muted eyebrow uppercase font-medium thai"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, i) => (
                  <LogRow key={`${a.id}-${i}`} alert={a} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
