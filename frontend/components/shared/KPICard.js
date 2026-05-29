"use client";
import { MiniBar } from "./MiniBar";

export function KPICard({
  label,
  value,
  unit,
  sub,
  delta,
  icon: I,
  accent = "var(--primary)",
  showBar,
  children,
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="panel rounded-xl p-4 relative overflow-hidden">
      <div
        className="absolute right-0 top-0 w-24 h-24 opacity-[0.07] grid place-items-end pr-3 pt-3"
        style={{ color: accent }}
      >
        {I && <I width="64" height="64" />}
      </div>
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] uppercase eyebrow text-muted">
          {label}
        </div>
        {delta != null && (
          <div
            className="flex items-center gap-1 text-[11px] mono"
            style={{ color: positive ? "#10b981" : "#ef4444" }}
          >
            {positive ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-2">
        <span
          className="text-3xl font-semibold tracking-tight"
          style={{ color: accent }}
        >
          {value}
        </span>
        <span className="text-sm text-muted">{unit}</span>
      </div>
      {sub && <div className="text-[11px] text-muted mt-1 thai">{sub}</div>}
      {showBar && <MiniBar pct={Number(value)} color={accent} />}
      {children}
    </div>
  );
}
