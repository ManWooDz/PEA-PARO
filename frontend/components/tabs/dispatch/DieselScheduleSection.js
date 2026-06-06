"use client";
import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { useSchedule } from "@/hooks/useSchedule";
import { recostSchedule } from "@/lib/api";
import { downloadScheduleCsv } from "@/lib/scheduleCsv";
import { ScheduleEditor } from "@/components/tabs/dispatch/ScheduleEditor";
import { EditedPlanCard } from "@/components/tabs/dispatch/EditedPlanCard";

const fmt1 = (v) => (v == null ? "—" : Number(v).toFixed(1));

// Warm-up lead times (minutes) derived from seed ramp rates: Diesel #8 ~1.7 min,
// Diesel #9 ~0.5 min. Kept in sync with the warm-up note in Tab2Dispatch.
const LEAD_MIN = { diesel_a_mw: 1.7, diesel_c_mw: 0.5 };

const hhmm = (iso) => String(iso).slice(11, 16);          // "HH:MM" from ISO

const shiftHHMM = (iso, deltaSec) => {
  const d = new Date(iso);
  d.setSeconds(d.getSeconds() + deltaSec);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Contiguous runs where the source output exceeds the threshold (MW).
// unitsKey (optional) names the step's unit-count field; the run reports the
// peak number of units committed across it (how many gensets to start).
function runsOf(steps, key, { threshold = 0.05, unitsKey = null } = {}) {
  const runs = [];
  let cur = null;
  for (const s of steps) {
    const v = key === "bess" ? Math.max(0, s.battery_mw) : s[key];
    if (v > threshold) {
      if (!cur) cur = { startIso: s.datetime, endIso: s.datetime, sum: 0, n: 0, units: 0 };
      cur.endIso = s.datetime;
      cur.sum += v;
      cur.n += 1;
      if (unitsKey) cur.units = Math.max(cur.units, s[unitsKey] ?? 0);
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  return runs.map((r) => ({
    startIso: r.startIso,
    start: hhmm(r.startIso),
    end: shiftHHMM(r.endIso, 15 * 60),   // each step covers 15 min
    avg: r.sum / r.n,
    units: r.units,
  }));
}

const SOURCES = [
  { key: "diesel_a_mw", unitsKey: "diesel8_units_on", label: "Diesel #8 (เกาะ A)", color: "#f59e0b" },
  { key: "diesel_c_mw", unitsKey: "diesel9_units_on", label: "Diesel #9 (เกาะ C)", color: "#ef4444" },
  { key: "bess",        unitsKey: null,               label: "BESS แบตเตอรี่",      color: "#6366f1" },
];

function OnPeriodRow({ src, steps }) {
  const runs = runsOf(steps, src.key, { unitsKey: src.unitsKey });
  const lead = LEAD_MIN[src.key];   // undefined for BESS
  // BESS only ever discharges in the on-period table (charging is excluded), so an
  // empty BESS row means "charge-only", distinct from a diesel that simply stays off.
  const emptyLabel = src.key === "bess" ? "ไม่จ่ายไฟ (ชาร์จเท่านั้น)" : "ไม่เดินเครื่อง";
  return (
    <tr className="border-b hairline last:border-0 align-top">
      <td className="py-2 pr-3">
        <div className="text-sm font-medium thai" style={{ color: src.color }}>{src.label}</div>
      </td>
      <td className="py-2 px-2">
        {runs.length === 0 ? (
          <span className="text-xs text-muted thai">{emptyLabel}</span>
        ) : (
          <div className="flex flex-col gap-1">
            {runs.map((r, i) => {
              // Warm-up start can fall before 00:00 (the prior night) when a run
              // begins right at midnight — flag the day rollover so the operator
              // doesn't read a late-evening time as "today".
              const warmup = lead != null ? shiftHHMM(r.startIso, -Math.round(lead * 60)) : null;
              const crossedMidnight = warmup != null && warmup > r.start;
              return (
                <div key={i} className="text-sm">
                  <span className="mono">{r.start}–{r.end}</span>{" "}
                  <span className="text-muted text-xs">· เฉลี่ย {fmt1(r.avg)} MW</span>
                  {src.unitsKey && r.units > 0 && (
                    <span className="text-muted text-xs">{" "}· {r.units} เครื่อง</span>
                  )}
                  {warmup != null && (
                    <span className="text-muted text-[11px] thai block">
                      สตาร์ท {warmup}{crossedMidnight ? " (เมื่อคืน)" : ""} — วอร์ม ~{lead} นาที ก่อนถึง {r.start}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </td>
    </tr>
  );
}

export function DieselScheduleSection() {
  const { schedule, loading } = useSchedule();

  const [overrides, setOverrides] = useState([]);
  const [edited, setEdited] = useState(null);     // { steps, cost, warnings }
  const [recosting, setRecosting] = useState(false);
  const [editError, setEditError] = useState(null);
  // dirty = overrides changed since the last confirm/reset, so the chart/cost shown
  // (the recommended plan, or a previously-confirmed edit) is out of date.
  const [dirty, setDirty] = useState(false);

  // What the chart, on-period table, and CSV reflect: the confirmed edit if any,
  // else the recommended plan.
  const effectiveSteps = edited?.steps ?? schedule?.steps ?? [];

  const addOverride = (o) => { setOverrides((prev) => [...prev, o]); setDirty(true); };
  const removeOverride = (i) => { setOverrides((prev) => prev.filter((_, k) => k !== i)); setDirty(true); };
  const resetEdits = () => { setOverrides([]); setEdited(null); setEditError(null); setDirty(false); };
  const confirmEdits = async () => {
    setRecosting(true);
    setEditError(null);
    try {
      const d = await recostSchedule(overrides);
      setEdited(d);
      setDirty(false);
    } catch (e) {
      setEditError(e?.response?.data?.detail || "คิดต้นทุนใหม่ไม่สำเร็จ");
    } finally {
      setRecosting(false);
    }
  };

  const data = effectiveSteps.map((s) => ({
    t: hhmm(s.datetime),
    "Diesel #8 (A)": s.diesel_a_mw,
    "Diesel #9 (C)": s.diesel_c_mw,
    "BESS": s.battery_mw,
  }));

  return (
    <section className="panel rounded-xl p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-base font-semibold thai">
            📋 ตารางการเดินเครื่อง 15 นาที · พรุ่งนี้ {schedule?.date ? `(${schedule.date})` : ""}
          </div>
          <div className="text-xs text-muted thai mt-0.5">
            แผนแนะนำ (ลดต้นทุน) สำหรับตั้งโปรแกรมเครื่องดีเซล — 00:00–23:45 ทุก 15 นาที
          </div>
        </div>
        <button
          onClick={() => downloadScheduleCsv(effectiveSteps, schedule?.date)}
          disabled={loading || effectiveSteps.length === 0}
          className={`px-3 py-2 rounded-lg text-sm border hairline thai transition ${
            loading || effectiveSteps.length === 0 ? "opacity-40 pointer-events-none" : "hover:opacity-90"
          }`}
          style={{ background: "var(--surface-2)" }}
        >
          ⬇ ดาวน์โหลด CSV{edited ? " (แก้ไขแล้ว)" : ""}
        </button>
      </div>

      {loading ? (
        <div className="h-[260px] flex items-center justify-center text-muted text-sm thai">
          กำลังคำนวณตารางเดินเครื่อง…
        </div>
      ) : data.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-muted text-sm thai">
          ไม่มีข้อมูลตารางเดินเครื่อง
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
              <XAxis dataKey="t" interval={11} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" MW" width={56} />
              <Tooltip
                formatter={(v, n) => [`${fmt1(v)} MW`, n]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="step" dataKey="Diesel #8 (A)" stroke="#f59e0b" dot={false} strokeWidth={2} />
              <Line type="step" dataKey="Diesel #9 (C)" stroke="#ef4444" dot={false} strokeWidth={2} />
              <Line type="step" dataKey="BESS" stroke="#6366f1" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>

          <div className="text-[11px] text-muted thai mt-1">
            * BESS: ค่าบวก = จ่ายไฟ · ค่าลบ = ชาร์จแบตเตอรี่
          </div>

          <div className="text-xs uppercase eyebrow text-muted mt-5 mb-2 thai">
            ช่วงเวลาเดินเครื่อง · สิ่งที่ต้องตั้งโปรแกรม
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase eyebrow text-muted thai">
                <th className="text-left font-medium py-1 pr-3">แหล่งจ่าย</th>
                <th className="text-left font-medium py-1 px-2">ช่วงเดินเครื่อง (พรุ่งนี้)</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((src) => (
                <OnPeriodRow key={src.key} src={src} steps={effectiveSteps} />
              ))}
            </tbody>
          </table>

          <ScheduleEditor
            overrides={overrides}
            onAdd={addOverride}
            onRemove={removeOverride}
            onConfirm={confirmEdits}
            onReset={resetEdits}
            recosting={recosting}
            edited={edited}
          />
          {editError && (
            <div className="text-[11px] text-red-500 thai mt-2">⚠️ {editError}</div>
          )}
          {dirty && !recosting && (
            <div className="text-[11px] thai mt-2 rounded px-2 py-1"
                 style={{ background: "rgba(245,158,11,0.10)", color: "#f59e0b", border: "1px solid #f59e0b40" }}>
              การแก้ไขยังไม่ถูกนำไปคำนวณ — กด “ยืนยันการแก้ไข” เพื่ออัปเดตกราฟ/ต้นทุน/CSV
            </div>
          )}
          <EditedPlanCard
            recommended={schedule?.cost}
            edited={edited?.cost}
            warnings={edited?.warnings}
          />
        </>
      )}
    </section>
  );
}
