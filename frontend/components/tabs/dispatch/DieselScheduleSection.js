"use client";
import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { useSchedule } from "@/hooks/useSchedule";
import { recostSchedule, applySchedule } from "@/lib/api";
import { downloadScheduleCsv } from "@/lib/scheduleCsv";
import { ScheduleEditor } from "@/components/tabs/dispatch/ScheduleEditor";
import { EditedPlanCard } from "@/components/tabs/dispatch/EditedPlanCard";

const fmt1 = (v) => (v == null ? "—" : Number(v).toFixed(1));

// Format a lead time given in (fractional) minutes as "M นาที S วินาที" — keeping
// whole minutes but spelling the leftover fraction out in seconds (1.7 → "1 นาที 42 วินาที",
// 0.5 → "30 วินาที"), which reads faster than "0.5 นาที".
function fmtLead(leadMin) {
  const total = Math.round(leadMin * 60);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} วินาที`;
  if (s === 0) return `${m} นาที`;
  return `${m} นาที ${s} วินาที`;
}

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


// ── Timeline strips: thin horizontal bars showing on/off per source ──────────
// Aligned to the same 96-step time axis as the step chart above.
const STRIP_SOURCES = [
  { key: "diesel_a_mw", label: "D#8", color: "#8b5cf6", threshold: 0.05, unitsKey: "diesel8_units_on" },
  { key: "diesel_c_mw", label: "D#9", color: "#ef4444", threshold: 0.05, unitsKey: "diesel9_units_on" },
  { key: "bess",        label: "BESS", color: "#6366f1", threshold: 0.05, unitsKey: null },
];

function TimelineStrips({ steps }) {
  if (!steps || steps.length === 0) return null;
  const n = steps.length;

  return (
    <div className="mt-2">
      {STRIP_SOURCES.map((src) => {
        const bars = [];
        let runStart = null;
        for (let i = 0; i <= n; i++) {
          const s = i < n ? steps[i] : null;
          const v = s ? (src.key === "bess" ? Math.max(0, s.battery_mw) : s[src.key]) : 0;
          const on = v > src.threshold;
          if (on && runStart === null) {
            runStart = i;
          } else if (!on && runStart !== null) {
            bars.push({ start: runStart, end: i });
            runStart = null;
          }
        }
        // Find peak units across all runs for this source
        const getUnits = (start, end) => {
          if (!src.unitsKey) return null;
          let mx = 0;
          for (let i = start; i < end; i++) mx = Math.max(mx, steps[i]?.[src.unitsKey] ?? 0);
          return mx;
        };
        return (
          <div key={src.key} className="flex items-center gap-2 mb-1">
            <span className="text-[10px] mono w-8 text-right" style={{ color: src.color }}>{src.label}</span>
            <div className="flex-1 relative h-4 rounded-sm" style={{ background: "var(--surface-2)" }}>
              {bars.map((b, i) => {
                const left = (b.start / n) * 100;
                const width = ((b.end - b.start) / n) * 100;
                const units = getUnits(b.start, b.end);
                const startTime = hhmm(steps[b.start].datetime);
                const endTime = shiftHHMM(steps[b.end - 1].datetime, 15 * 60);
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-full rounded-sm"
                    style={{ left: `${left}%`, width: `${width}%`, background: src.color }}
                    title={`${startTime}–${endTime}${units ? ` · ${units} เครื่อง` : ""}`}
                  />
                );
              })}
              {bars.length === 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] text-muted thai">
                  {src.key === "bess" ? "ชาร์จเท่านั้น" : "ไม่เดินเครื่อง"}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {/* Time reference from the chart x-axis above; hover bars for exact times */}
    </div>
  );
}


const SOURCES = [
  { key: "diesel_a_mw", unitsKey: "diesel8_units_on", label: "Diesel #8 (เกาะ A)", color: "#f59e0b" },
  { key: "diesel_c_mw", unitsKey: "diesel9_units_on", label: "Diesel #9 (เกาะ C)", color: "#ef4444" },
  { key: "bess",        unitsKey: null,               label: "BESS แบตเตอรี่",      color: "#6366f1" },
];


function OnPeriodRow({ src, steps }) {
  const runs = runsOf(steps, src.key, { unitsKey: src.unitsKey });
  const lead = LEAD_MIN[src.key];
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
                      สตาร์ท {warmup}{crossedMidnight ? " (เมื่อคืน)" : ""} — วอร์ม ~{fmtLead(lead)} ก่อนถึง {r.start}
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

export function DieselScheduleSection({ activePlan, onUploaded }) {
  const { schedule, loading } = useSchedule();

  const [overrides, setOverrides] = useState([]);
  const [edited, setEdited] = useState(null);     // { steps, cost, warnings }
  const [recosting, setRecosting] = useState(false);
  const [editError, setEditError] = useState(null);
  // dirty = overrides changed since the last confirm/reset, so the chart/cost shown
  // (the recommended plan, or a previously-confirmed edit) is out of date.
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // What the chart, on-period table, and CSV reflect: the confirmed edit if any,
  // else the recommended plan.
  const effectiveSteps = edited?.steps ?? schedule?.steps ?? [];

  const uploadPlan = async () => {
    setUploading(true);
    setUploadError(null);
    try {
      await applySchedule(effectiveSteps);
      onUploaded?.();
    } catch (e) {
      setUploadError(e?.response?.data?.detail || "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

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
          <div className="text-[11px] thai mt-1" style={{ color: activePlan?.uploaded ? "#10b981" : "var(--muted)" }}>
            {activePlan?.uploaded
              ? `✓ ใช้เป็นแผนอ้างอิง Early-Warning แล้ว (${String(activePlan.uploaded_at).slice(11, 16)})`
              : "ยังไม่ได้อัปโหลดเป็นแผนอ้างอิง Early-Warning"}
          </div>
          {uploadError && (
            <div className="text-[11px] text-red-500 thai mt-1">⚠️ {uploadError}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
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
          <button
            onClick={uploadPlan}
            disabled={loading || uploading || effectiveSteps.length === 0}
            className={`px-3 py-2 rounded-lg text-sm thai transition ${
              loading || uploading || effectiveSteps.length === 0 ? "opacity-40 pointer-events-none" : "hover:opacity-90"
            }`}
            style={{ background: "var(--primary)", color: "#fff" }}
          >
            {uploading ? "กำลังอัปโหลด…" : "⬆ อัปโหลดเป็นแผนอ้างอิง EW"}
          </button>
        </div>
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
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
              <XAxis dataKey="t" interval={11} tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} unit=" MW" width={48} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v, n) => [`${fmt1(v)} MW`, n]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="step" dataKey="Diesel #8 (A)" stroke="#8b5cf6" dot={false} strokeWidth={2} />
              <Line type="step" dataKey="Diesel #9 (C)" stroke="#ef4444" dot={false} strokeWidth={2} />
              <Line type="step" dataKey="BESS" stroke="#6366f1" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>

          {/* Timeline strips — aligned below the chart (same 96-step x-axis) */}
          <TimelineStrips steps={effectiveSteps} />

          <div className="text-xs uppercase eyebrow text-muted mt-4 mb-2 thai">
            ช่วงเวลาเดินเครื่อง · สิ่งที่ต้องตั้งโปรแกรม
          </div>
          <div className="max-h-[320px] overflow-y-auto border hairline rounded-lg">
            <table className="w-full text-xs table-fixed">
              <thead className="sticky top-0" style={{ background: "var(--surface-2)" }}>
                <tr className="text-[10px] uppercase eyebrow text-muted thai">
                  <th className="text-center font-medium py-2 px-2 w-1/4">เวลา</th>
                  <th className="text-center font-medium py-2 px-2 w-1/4" style={{ color: "#6366f1" }}>BESS</th>
                  <th className="text-center font-medium py-2 px-2 w-1/4" style={{ color: "#8b5cf6" }}>Diesel #8 (A)</th>
                  <th className="text-center font-medium py-2 px-2 w-1/4" style={{ color: "#ef4444" }}>Diesel #9 (C)</th>
                </tr>
              </thead>
              <tbody>
                {effectiveSteps.map((s, i) => {
                  const start = String(s.datetime).slice(11, 16);
                  const endMin = (parseInt(start.slice(0,2)) * 60 + parseInt(start.slice(3)) + 15) % 1440;
                  const end = `${String(Math.floor(endMin/60)).padStart(2,"0")}:${String(endMin%60).padStart(2,"0")}`;
                  const bess = s.battery_mw ?? 0;
                  const d8 = s.diesel_a_mw ?? 0;
                  const d9 = s.diesel_c_mw ?? 0;
                  return (
                    <tr key={i} className="border-t hairline">
                      <td className="py-1 px-2 mono text-center text-[11px]">{start} - {end}</td>
                      <td className="py-1 px-2 mono text-center" style={{
                        color: Math.abs(bess) > 0.01 ? "var(--foreground)" : "var(--muted)",
                        background: bess > 0.01 ? "#ef444488" : bess < -0.01 ? "#10b98188" : "transparent",
                      }}>
                        {Math.abs(bess) > 0.01 ? `${bess > 0 ? "+" : ""}${bess.toFixed(1)}` : "—"}
                      </td>
                      <td className="py-1 px-2 mono text-center" style={{ color: d8 > 0.01 ? "#8b5cf6" : "var(--muted)" }}>
                        {d8 > 0.01 ? d8.toFixed(1) : "—"}
                      </td>
                      <td className="py-1 px-2 mono text-center" style={{ color: d9 > 0.01 ? "#ef4444" : "var(--muted)" }}>
                        {d9 > 0.01 ? d9.toFixed(1) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-muted thai mt-2">
            * BESS: ค่าบวก = จ่ายไฟ · ค่าลบ = ชาร์จแบตเตอรี่ · แถบสี = ช่วงเดินเครื่อง
          </div>

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
