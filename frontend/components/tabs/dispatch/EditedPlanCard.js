"use client";

const fmtBaht = (v) => `฿${Math.round(v ?? 0).toLocaleString("th-TH")}`;
const fmtL = (v) => `${Math.round(v ?? 0).toLocaleString("th-TH")} ลิตร`;

function Delta({ value, unit }) {
  if (value == null || Math.abs(value) < 0.5) return <span className="text-muted">—</span>;
  const up = value > 0;
  const text = unit === "baht" ? fmtBaht(Math.abs(value)) : fmtL(Math.abs(value));
  return (
    <span style={{ color: up ? "#ef4444" : "#10b981" }} className="mono font-semibold">
      {up ? "▲ +" : "▼ −"}{text}
    </span>
  );
}

export function EditedPlanCard({ recommended, edited, warnings }) {
  if (!edited) return null;
  const dCost = (edited.total_thb ?? 0) - (recommended?.total_thb ?? 0);
  const dLitres = (edited.diesel_litres ?? 0) - (recommended?.diesel_litres ?? 0);

  return (
    <section className="panel rounded-xl p-5 mt-4">
      <div className="text-base font-semibold thai mb-3">📝 แผนที่แก้ไข · เทียบแผนแนะนำ</div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase eyebrow text-muted thai">
            <th className="text-left font-medium py-1 pr-3">รายการ</th>
            <th className="text-right font-medium py-1 px-2">แผนแนะนำ</th>
            <th className="text-right font-medium py-1 px-2">แผนที่แก้ไข</th>
            <th className="text-right font-medium py-1 pl-2">ส่วนต่าง</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b hairline">
            <td className="py-2 pr-3 thai">ต้นทุนรวม</td>
            <td className="py-2 px-2 text-right mono">{fmtBaht(recommended?.total_thb)}</td>
            <td className="py-2 px-2 text-right mono font-semibold">{fmtBaht(edited.total_thb)}</td>
            <td className="py-2 pl-2 text-right"><Delta value={dCost} unit="baht" /></td>
          </tr>
          <tr>
            <td className="py-2 pr-3 thai">น้ำมันดีเซลรวม</td>
            <td className="py-2 px-2 text-right mono">{fmtL(recommended?.diesel_litres)}</td>
            <td className="py-2 px-2 text-right mono font-semibold">{fmtL(edited.diesel_litres)}</td>
            <td className="py-2 pl-2 text-right"><Delta value={dLitres} unit="litres" /></td>
          </tr>
        </tbody>
      </table>

      {warnings && warnings.length > 0 && (
        <div className="mt-3 rounded-lg px-3 py-2 text-sm thai"
             style={{ background: "rgba(239,68,68,0.10)", color: "#ef4444", border: "1px solid #ef444440" }}>
          ⚠️ เกินขีดจำกัดสายส่ง (grid เกิน cap):
          <ul className="mt-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs"><span className="mono">{w.start}–{w.end}</span> · {w.detail}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
