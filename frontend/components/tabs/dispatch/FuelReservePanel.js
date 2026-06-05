"use client";
import { useState } from "react";

// Procurement diesel price (฿/litre) — adjustable; distinct from the operational
// ฿/kWh Token cost. Default is a representative Thai retail diesel price.
const DEFAULT_FUEL_PRICE = 30;

const fmtL = (v) => Math.round(v ?? 0).toLocaleString("th-TH");
const fmtBaht = (v) => `฿${Math.round(v ?? 0).toLocaleString("th-TH")}`;

function litresOf(cost) {
  const a = cost?.diesel_a_litres ?? 0;
  const c = cost?.diesel_c_litres ?? 0;
  return { a, c, total: a + c };
}

function PlanRow({ label, sublabel, cost, price, accent }) {
  const { a, c, total } = litresOf(cost);
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

export function FuelReservePanel({ baseline, minCost }) {
  const [price, setPrice] = useState(DEFAULT_FUEL_PRICE);
  const p = Number(price) || 0;

  const baseTotal = litresOf(baseline).total;
  const mcTotal = litresOf(minCost).total;
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
        <label className="flex items-center gap-2 text-sm thai">
          <span className="text-muted">ราคาน้ำมัน</span>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="panel-2 border hairline rounded px-2 py-1 mono text-sm w-20 text-right"
          />
          <span className="text-muted">฿/ลิตร</span>
        </label>
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
          <PlanRow label="แผนปัจจุบัน" sublabel="ไม่ทำตามคำแนะนำ" cost={baseline} price={p} accent="#0ea5e9" />
          <PlanRow label="ลดต้นทุน" sublabel="ทำตามคำแนะนำ" cost={minCost} price={p} accent="#6366f1" />
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

      <div className="text-[10px] text-muted thai mt-2">
        * ฿/ลิตร = ราคาจัดซื้อ (แยกจากต้นทุนเดินเครื่อง ฿/kWh) · สมมติ 0.27 ลิตร/kWh เท่ากันทั้งสองเครื่อง
      </div>
    </section>
  );
}
