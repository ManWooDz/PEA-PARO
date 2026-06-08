"use client";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { useTodaySchedule } from "@/hooks/useTodaySchedule";

// Read-only intra-day counterpart of DieselScheduleSection: shows what to do for
// the REMAINING part of today (from the current time → 23:45) under the current
// recommended (min-cost) plan. No editing/upload — that lives on the day-ahead tab.

const fmt1 = (v) => (v == null ? "—" : Number(v).toFixed(1));
const hhmm = (iso) => String(iso).slice(11, 16);

const shiftHHMM = (iso, deltaSec) => {
  const d = new Date(iso);
  d.setSeconds(d.getSeconds() + deltaSec);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

function fmtLead(leadMin) {
  const total = Math.round(leadMin * 60);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} วินาที`;
  if (s === 0) return `${m} นาที`;
  return `${m} นาที ${s} วินาที`;
}

const LEAD_MIN = { diesel_a_mw: 1.7, diesel_c_mw: 0.5 };

// Contiguous on-periods where a source exceeds threshold MW (peak units across the run).
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
    end: shiftHHMM(r.endIso, 15 * 60),
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
              return (
                <div key={i} className="text-sm">
                  <span className="mono">{r.start}–{r.end}</span>{" "}
                  <span className="text-muted text-xs">· เฉลี่ย {fmt1(r.avg)} MW</span>
                  {src.unitsKey && r.units > 0 && (
                    <span className="text-muted text-xs">{" "}· {r.units} เครื่อง</span>
                  )}
                  {warmup != null && (
                    <span className="text-muted text-[11px] thai block">
                      สตาร์ท {warmup} — วอร์ม ~{fmtLead(lead)} ก่อนถึง {r.start}
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

export function IntradayScheduleSection() {
  const { schedule, loading } = useTodaySchedule();
  const steps = schedule?.steps ?? [];
  const data = steps.map((s) => ({
    t: hhmm(s.datetime),
    "Diesel #8 (A)": s.diesel_a_mw,
    "Diesel #9 (C)": s.diesel_c_mw,
    "BESS": s.battery_mw,
  }));

  return (
    <section className="panel rounded-xl p-5">
      <div className="mb-4">
        <div className="text-base font-semibold thai">
          📋 ตารางการเดินเครื่องวันนี้ · ช่วงที่เหลือ
          {schedule?.from_time ? ` (${schedule.from_time}–23:45)` : ""}
        </div>
        <div className="text-xs text-muted thai mt-0.5">
          แผนแนะนำปัจจุบัน (ลดต้นทุน) สำหรับสิ่งที่ต้องทำในช่วงที่เหลือของวันนี้ — ทุก 15 นาที
        </div>
      </div>

      {loading ? (
        <div className="h-[260px] flex items-center justify-center text-muted text-sm thai">
          กำลังคำนวณตารางเดินเครื่องวันนี้…
        </div>
      ) : data.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-muted text-sm thai">
          ไม่มีข้อมูลตารางเดินเครื่องสำหรับช่วงที่เหลือของวันนี้
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
              <XAxis dataKey="t" interval={Math.max(0, Math.floor(data.length / 8))} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" MW" width={56} />
              <Tooltip formatter={(v, n) => [`${fmt1(v)} MW`, n]} contentStyle={{ fontSize: 12 }} />
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
            ช่วงเวลาเดินเครื่องที่เหลือวันนี้ · สิ่งที่ต้องทำ
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase eyebrow text-muted thai">
                <th className="text-left font-medium py-1 pr-3">แหล่งจ่าย</th>
                <th className="text-left font-medium py-1 px-2">ช่วงเดินเครื่อง (วันนี้)</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((src) => (
                <OnPeriodRow key={src.key} src={src} steps={steps} />
              ))}
            </tbody>
          </table>

          {schedule?.cost?.diesel_litres != null && (
            <div className="text-[11px] text-muted thai mt-3">
              น้ำมันดีเซลที่เหลือวันนี้ตามแผนแนะนำ ~
              <span className="mono">{fmt1(schedule.cost.diesel_litres)}</span> ลิตร ·
              ต้นทุนรวม <span className="mono">฿{Number(schedule.cost.total_thb ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 0 })}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
