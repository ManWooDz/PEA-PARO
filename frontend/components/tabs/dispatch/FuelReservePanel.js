"use client";
import { useState } from "react";

// Defaults from the backend seed (DIESEL_L_PER_KWH = 0.27 for both).
// In reality the two generators may differ — hence per-gen inputs.
const DEFAULT_FUEL_PRICE = 30;     // ฿/litre (procurement)
const DEFAULT_L_KWH_D8 = 0.27;    // Diesel #8 (Island A) — L/kWh
const DEFAULT_L_KWH_D9 = 0.27;    // Diesel #9 (Island C) — L/kWh

const fmtL = (v) => Math.round(v ?? 0).toLocaleString("th-TH");
const fmtBaht = (v) => `฿${Math.round(v ?? 0).toLocaleString("th-TH")}`;

// The backend pre-computes litres at a fixed 0.27 L/kWh (DIESEL_L_PER_KWH in seed.py).
// To let the user override per-gen rates WITHOUT a backend change, we reverse the
// backend's litres → energy (kWh), then re-multiply by the user's rate.
const BACKEND_L_KWH = 0.27;

function litresOf(cost, lD8, lD9) {
  const backendA = cost?.diesel_a_litres ?? 0;
  const backendC = cost?.diesel_c_litres ?? 0;
  // Recover the underlying kWh from the backend's fixed-rate litres.
  const kwhA = BACKEND_L_KWH > 0 ? backendA / BACKEND_L_KWH : 0;
  const kwhC = BACKEND_L_KWH > 0 ? backendC / BACKEND_L_KWH : 0;
  // Re-apply the user's per-gen rate.
  const a = kwhA * lD8;
  const c = kwhC * lD9;
  return { a, c, total: a + c };
}

function PlanRow({ label, sublabel, cost, price, lD8, lD9, accent }) {
  const { a, c, total } = litresOf(cost, lD8, lD9);
  return (
    <tr className="border-b hairline last:border-0">
      <td className="py-2 pr-3">
        <div className="text-sm font-medium thai" style={{ color: accent }}>{label}</div>
        <div className="text-[10px] text-muted thai">{sublabel}</div>
      </td>
      <td className="py-2 px-2 text-right mono">{fmtL(a)} <span className="text-[10px] text-muted">ลิตร</span></td>
      <td className="py-2 px-2 text-right mono">{fmtL(c)} <span className="text-[10px] text-muted">ลิตร</span></td>
      <td className="py-2 px-2 text-right mono font-semibold">{fmtL(total)} <span className="text-[10px] text-muted">ลิตร</span></td>
      <td className="py-2 pl-2 text-right mono font-semibold">{fmtBaht(total * price)}</td>
    </tr>
  );
}

function SettingsPopup({ price, setPrice, lD8, setLD8, lD9, setLD9, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="panel rounded-xl p-5 w-80 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold thai">⚙ ตั้งค่าแผนน้ำมันดีเซล</div>

        <label className="block">
          <span className="text-xs text-muted thai">ราคาน้ำมัน (฿/ลิตร)</span>
          <input type="number" min={0} step={1} value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="panel-2 border hairline rounded px-2 py-1 mono text-sm w-full mt-1 text-right" />
        </label>

        <label className="block">
          <span className="text-xs text-muted thai">Diesel #8 (เกาะ A) — อัตราสิ้นเปลือง (ลิตร/kWh)</span>
          <input type="number" min={0} step={0.01} value={lD8}
            onChange={(e) => setLD8(e.target.value)}
            className="panel-2 border hairline rounded px-2 py-1 mono text-sm w-full mt-1 text-right" />
        </label>

        <label className="block">
          <span className="text-xs text-muted thai">Diesel #9 (เกาะ C) — อัตราสิ้นเปลือง (ลิตร/kWh)</span>
          <input type="number" min={0} step={0.01} value={lD9}
            onChange={(e) => setLD9(e.target.value)}
            className="panel-2 border hairline rounded px-2 py-1 mono text-sm w-full mt-1 text-right" />
        </label>

        <button onClick={onClose}
          className="w-full px-3 py-2 rounded-lg text-sm thai transition cursor-pointer"
          style={{ background: "var(--primary)", color: "#fff" }}>
          ปิด
        </button>
      </div>
    </div>
  );
}

export function FuelReservePanel({ baseline, minCost }) {
  const [price, setPrice] = useState(DEFAULT_FUEL_PRICE);
  const [lD8, setLD8] = useState(DEFAULT_L_KWH_D8);
  const [lD9, setLD9] = useState(DEFAULT_L_KWH_D9);
  const [showSettings, setShowSettings] = useState(false);

  const p = Number(price) || 0;
  const ld8 = Number(lD8) || 0;
  const ld9 = Number(lD9) || 0;

  const baseTotal = litresOf(baseline, ld8, ld9).total;
  const mcTotal = litresOf(minCost, ld8, ld9).total;
  const litresSaved = baseTotal - mcTotal;
  const bahtSaved = litresSaved * p;

  return (
    <section className="panel rounded-xl p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-3">
        <div>
          <div className="text-base font-semibold thai">⛽ แผนสำรองน้ำมันดีเซล · 7 วันข้างหน้า</div>
          <div className="text-xs text-muted thai mt-0.5">
            ปริมาณน้ำมันที่ต้องสำรองเพื่อเดินเครื่องตามแผน (สำหรับตัดสินใจสั่งซื้อ)
          </div>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="px-3 py-1.5 rounded-lg text-xs border hairline thai transition cursor-pointer hover:opacity-80"
          style={{ background: "var(--surface-2)" }}
        >
          ⚙ ตั้งค่า
        </button>
      </div>

      {/* Compact summary of active config */}
      <div className="text-[10px] text-muted thai mb-3 flex items-center gap-3 flex-wrap">
        <span>ราคา <span className="mono">{p}</span> ฿/ลิตร</span>
        <span>D#8 <span className="mono">{ld8}</span> ลิตร/kWh</span>
        <span>D#9 <span className="mono">{ld9}</span> ลิตร/kWh</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase eyebrow text-muted thai">
            <th className="text-left font-medium py-1 pr-3">แผน</th>
            <th className="text-right font-medium py-1 px-2">Diesel #8 (เกาะ A)</th>
            <th className="text-right font-medium py-1 px-2">Diesel #9 (เกาะ C)</th>
            <th className="text-right font-medium py-1 px-2">รวม</th>
            <th className="text-right font-medium py-1 pl-2">ค่าน้ำมัน</th>
          </tr>
        </thead>
        <tbody>
          <PlanRow label="แผนปัจจุบัน" sublabel="ไม่ทำตามคำแนะนำ" cost={baseline} price={p} lD8={ld8} lD9={ld9} accent="#0ea5e9" />
          <PlanRow label="ลดต้นทุน" sublabel="ทำตามคำแนะนำ" cost={minCost} price={p} lD8={ld8} lD9={ld9} accent="#6366f1" />
        </tbody>
      </table>

      <div
        className="mt-4 rounded-lg px-3 py-2 text-sm thai"
        style={{
          background: litresSaved >= 0 ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
          color: litresSaved >= 0 ? "#10b981" : "#ef4444",
          border: `1px solid ${litresSaved >= 0 ? "#10b98140" : "#ef444440"}`,
        }}
      >
        💰 ทำตามคำแนะนำ → สั่งน้ำมัน{litresSaved >= 0 ? "น้อยลง" : "เพิ่มขึ้น"}{" "}
        <span className="mono font-semibold">{fmtL(Math.abs(litresSaved))} ลิตร</span>{" "}
        ≈ {litresSaved >= 0 ? "ประหยัด" : "เพิ่ม"}{" "}
        <span className="mono font-semibold">{fmtBaht(Math.abs(bahtSaved))}</span> ตลอด 7 วัน
      </div>

      {showSettings && (
        <SettingsPopup
          price={price} setPrice={setPrice}
          lD8={lD8} setLD8={setLD8}
          lD9={lD9} setLD9={setLD9}
          onClose={() => setShowSettings(false)}
        />
      )}
    </section>
  );
}
