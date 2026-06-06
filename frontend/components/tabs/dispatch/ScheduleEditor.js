"use client";
import { useState } from "react";

// 15-min grid: starts 00:00..23:45, ends 00:15..24:00.
const pad = (n) => String(n).padStart(2, "0");
const TIMES = Array.from({ length: 97 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);
const START_TIMES = TIMES.slice(0, 96);                       // 00:00 .. 23:45
const END_TIMES = TIMES.slice(1).concat("24:00");             // 00:15 .. 24:00

const FIELDS = [
  { value: "diesel_a", label: "Diesel #8 (เกาะ A)", max: 15 },
  { value: "diesel_c", label: "Diesel #9 (เกาะ C)", max: 5 },
  { value: "bess",     label: "BESS (+จ่าย/−ชาร์จ)", max: 12.5, min: -12.5 },
];
const fieldLabel = (v) => FIELDS.find((f) => f.value === v)?.label ?? v;

export function ScheduleEditor({ overrides, onAdd, onRemove, onConfirm, onReset, recosting, edited }) {
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("20:00");
  const [field, setField] = useState("diesel_c");
  const [value, setValue] = useState("4");

  const fdef = FIELDS.find((f) => f.value === field);
  const num = Number(value);
  const lo = fdef?.min ?? 0;
  const hi = fdef?.max ?? 0;
  const startMin = START_TIMES.indexOf(start);
  const endMin = END_TIMES.indexOf(end);
  const validWindow = startMin >= 0 && endMin >= 0 && end > start;
  const validValue = Number.isFinite(num) && num >= lo && num <= hi;
  const canAdd = validWindow && validValue;

  const add = () => {
    if (!canAdd) return;
    onAdd({ start, end, field, value_mw: num });
  };

  return (
    <div className="panel-2 border hairline rounded-lg p-4 mt-4">
      <div className="text-xs uppercase eyebrow text-muted mb-3 thai">✏️ แก้ตารางเฉพาะช่วง</div>

      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1 thai">
          <span className="text-[11px] text-muted">เริ่ม</span>
          <select value={start} onChange={(e) => setStart(e.target.value)} className="panel border hairline rounded px-2 py-1 mono">
            {START_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 thai">
          <span className="text-[11px] text-muted">จบ</span>
          <select value={end} onChange={(e) => setEnd(e.target.value)} className="panel border hairline rounded px-2 py-1 mono">
            {END_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 thai">
          <span className="text-[11px] text-muted">แหล่ง</span>
          <select value={field} onChange={(e) => setField(e.target.value)} className="panel border hairline rounded px-2 py-1">
            {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 thai">
          <span className="text-[11px] text-muted">ค่า (MW)</span>
          <input type="number" value={value} step="0.1" min={lo} max={hi}
                 onChange={(e) => setValue(e.target.value)}
                 className="panel border hairline rounded px-2 py-1 mono w-24 text-right" />
        </label>
        <button onClick={add} disabled={!canAdd}
                className={`px-3 py-1.5 rounded-lg text-sm border hairline thai transition ${canAdd ? "hover:opacity-90" : "opacity-40 pointer-events-none"}`}
                style={{ background: "var(--surface-2)" }}>
          + เพิ่มช่วง
        </button>
      </div>
      {!validValue && (
        <div className="text-[11px] text-red-500 thai mt-1">ค่าต้องอยู่ระหว่าง {lo} ถึง {hi} MW</div>
      )}

      {overrides.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {overrides.map((o, i) => (
            <li key={i} className="flex items-center justify-between text-sm panel rounded px-2 py-1">
              <span className="thai">
                <span className="mono">{o.start}–{o.end}</span> · {fieldLabel(o.field)} = <span className="mono">{o.value_mw} MW</span>
              </span>
              <button onClick={() => onRemove(i)} className="text-muted hover:text-red-500 px-1" aria-label="ลบ">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button onClick={onConfirm} disabled={overrides.length === 0 || recosting}
                className={`px-3 py-1.5 rounded-lg text-sm thai transition ${overrides.length === 0 || recosting ? "opacity-40 pointer-events-none" : "hover:opacity-90"}`}
                style={{ background: "var(--primary)", color: "#fff" }}>
          {recosting ? "กำลังคิดต้นทุน…" : "ยืนยันการแก้ไข"}
        </button>
        {(overrides.length > 0 || edited) && (
          <button onClick={onReset} className="px-3 py-1.5 rounded-lg text-sm border hairline thai hover:opacity-90">
            รีเซ็ตเป็นแผนแนะนำ
          </button>
        )}
      </div>
    </div>
  );
}
