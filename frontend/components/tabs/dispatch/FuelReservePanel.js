"use client";
import { useState } from "react";

const DEFAULT_FUEL_PRICE = 30;
const DEFAULT_L_KWH_D8 = 0.27;
const DEFAULT_L_KWH_D9 = 0.27;

const BACKEND_L_KWH = 0.27;

const fmtL = (v) => Math.round(v ?? 0).toLocaleString("th-TH");
const fmtBaht = (v) => `฿${Math.round(v ?? 0).toLocaleString("th-TH")}`;

function litresOf(cost, lD8, lD9) {
  const backendA = cost?.diesel_a_litres ?? 0;
  const backendC = cost?.diesel_c_litres ?? 0;
  const kwhA = BACKEND_L_KWH > 0 ? backendA / BACKEND_L_KWH : 0;
  const kwhC = BACKEND_L_KWH > 0 ? backendC / BACKEND_L_KWH : 0;
  const a = kwhA * lD8;
  const c = kwhC * lD9;
  return { a, c, total: a + c };
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

export function FuelReservePanel({ minCost }) {
  const [price, setPrice] = useState(DEFAULT_FUEL_PRICE);
  const [lD8, setLD8] = useState(DEFAULT_L_KWH_D8);
  const [lD9, setLD9] = useState(DEFAULT_L_KWH_D9);
  const [showSettings, setShowSettings] = useState(false);

  const p = Number(price) || 0;
  const ld8 = Number(lD8) || 0;
  const ld9 = Number(lD9) || 0;

  const { a, c, total } = litresOf(minCost, ld8, ld9);
  const totalBaht = total * p;

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

      <div className="text-[10px] text-muted thai mb-3 flex items-center gap-3 flex-wrap">
        <span>ราคา <span className="mono">{p}</span> ฿/ลิตร</span>
        <span>D#8 <span className="mono">{ld8}</span> ลิตร/kWh</span>
        <span>D#9 <span className="mono">{ld9}</span> ลิตร/kWh</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="panel rounded-lg p-3">
          <div className="text-[10px] uppercase eyebrow text-muted thai">Diesel #8 (เกาะ A)</div>
          <div className="text-lg mono font-bold mt-1" style={{ color: "#8b5cf6" }}>{fmtL(a)} <span className="text-xs text-muted">ลิตร</span></div>
        </div>
        <div className="panel rounded-lg p-3">
          <div className="text-[10px] uppercase eyebrow text-muted thai">Diesel #9 (เกาะ C)</div>
          <div className="text-lg mono font-bold mt-1" style={{ color: "#ef4444" }}>{fmtL(c)} <span className="text-xs text-muted">ลิตร</span></div>
        </div>
        <div className="panel rounded-lg p-3">
          <div className="text-[10px] uppercase eyebrow text-muted thai">รวมทั้งหมด</div>
          <div className="text-lg mono font-bold mt-1">{fmtL(total)} <span className="text-xs text-muted">ลิตร</span></div>
        </div>
        <div className="panel rounded-lg p-3">
          <div className="text-[10px] uppercase eyebrow text-muted thai">ค่าน้ำมันรวม</div>
          <div className="text-lg mono font-bold mt-1" style={{ color: "var(--primary)" }}>{fmtBaht(totalBaht)}</div>
        </div>
      </div>

      {total < 1 && (
        <div className="mt-3 rounded-lg px-3 py-2 text-sm thai"
          style={{ background: "rgba(16,185,129,0.10)", color: "#10b981", border: "1px solid #10b98140" }}>
          🟢 ไม่ต้องสั่งซื้อน้ำมันดีเซลตลอด 7 วัน — แผนแนะนำใช้ Grid + BESS เต็มที่
        </div>
      )}

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
