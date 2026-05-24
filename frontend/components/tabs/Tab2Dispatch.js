'use client'
import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import { Icon }        from '@/components/shared/Icon'
import { Dot }         from '@/components/shared/Dot'
import { MiniBar }     from '@/components/shared/MiniBar'
import { StatusBadge } from '@/components/shared/StatusBadge'

/* ── strategy meta ── */
const STRATEGIES = [
  { id: 'baseline',    th: 'Baseline',      en: 'Merit-order',    color: '#64748b', desc: 'ลำดับความถูก กริด→แบต→ดีเซล' },
  { id: 'min-cost',    th: 'ต้นทุนต่ำสุด', en: 'Min-Cost',      color: 'var(--primary)', desc: 'เพิ่มการใช้กริดออฟ-พีก' },
  { id: 'reliability', th: 'ความน่าเชื่อถือ', en: 'Reliability',  color: '#10b981', desc: 'SoC สำรองสูง + Line 6 margin' },
  { id: 'eco',         th: 'ประหยัดพลังงาน', en: 'Eco',          color: '#a78bfa', desc: 'ลดดีเซลสูงสุด' },
  { id: 'custom',      th: 'กำหนดเอง',     en: 'Custom',         color: '#f59e0b', desc: 'ปรับสัดส่วน + ช่วงเวลา' },
]

const fmt1 = v => (v == null ? '—' : Number(v).toFixed(1))
const fmtCost = v => (v == null ? '—' : Number(v).toLocaleString('th-TH', { maximumFractionDigits: 0 }))

/* custom tooltip */
function DispatchTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl min-w-[160px]">
      <div className="mono text-muted mb-1">{label}:00</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <span style={{ color: p.color }}>●</span>
            <span className="text-muted">{p.name}</span>
          </div>
          <span className="mono">{fmt1(p.value)} MW</span>
        </div>
      ))}
    </div>
  )
}

/* slider row */
function SliderRow({ label, value, min, max, step, onChange, color }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className="mono font-semibold" style={{ color }}>{value}%</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-sky-500"
        style={{ accentColor: color }}
      />
    </div>
  )
}

/* window row */
function WindowRow({ label, value, onChange, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted w-20 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1">
        <input type="number" min={0} max={23} value={value[0]}
               onChange={e => onChange([+e.target.value, value[1]])}
               className="w-14 px-2 py-1 rounded text-xs mono panel-2 border hairline text-center"
               style={{ color }} />
        <span className="text-muted text-xs">–</span>
        <input type="number" min={0} max={24} value={value[1]}
               onChange={e => onChange([value[0], +e.target.value])}
               className="w-14 px-2 py-1 rounded text-xs mono panel-2 border hairline text-center"
               style={{ color }} />
        <span className="text-xs text-muted">h</span>
      </div>
    </div>
  )
}

export function Tab2Dispatch({ plans, activeId, applyPlan, customCfg, setCustomCfg, loading }) {
  const [showCustom, setShowCustom] = useState(false)

  const plan = plans[activeId]

  /* build chart rows */
  const chartData = plan?.rows?.map(r => ({
    h:         r.hour,
    Grid:      +(r.grid_mw?.toFixed(2)     ?? 0),
    Battery:   +(r.battery_mw?.toFixed(2)  ?? 0),
    'Diesel A': +(r.diesel_a_mw?.toFixed(2) ?? 0),
    'Diesel C': +(r.diesel_c_mw?.toFixed(2) ?? 0),
    SoC:       +(r.soc_pct?.toFixed(1)     ?? 0),
  })) ?? []

  const cost = plan?.cost
  const activeMeta = STRATEGIES.find(s => s.id === activeId) ?? STRATEGIES[0]

  /* custom cfg helpers */
  const setShare  = (k, v) => setCustomCfg(c => ({ ...c, shares:  { ...c.shares,  [k]: v } }))
  const setWindow = (k, v) => setCustomCfg(c => ({ ...c, windows: { ...c.windows, [k]: v } }))

  return (
    <div className="space-y-6">

      {/* ── strategy selector ── */}
      <section>
        <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">กลยุทธ์ · Strategy</div>
        <div className="flex flex-wrap gap-2">
          {STRATEGIES.map(s => {
            const isActive = activeId === s.id
            return (
              <button key={s.id}
                      onClick={() => { applyPlan(s.id); if (s.id === 'custom') setShowCustom(true) }}
                      className="px-3 py-2 rounded-lg text-sm border transition cursor-pointer"
                      style={isActive
                        ? { borderColor: s.color, background: `${s.color}18`, color: s.color }
                        : { borderColor: 'var(--border-soft)', background: 'var(--surface-2)', color: 'var(--muted)' }}>
                <span className="font-medium thai">{s.th}</span>
                <span className="ml-1 text-[10px] opacity-70 eyebrow">{s.en}</span>
              </button>
            )
          })}
        </div>
        {activeMeta && (
          <div className="mt-2 text-xs text-muted thai">{activeMeta.desc}</div>
        )}
      </section>

      {/* ── custom panel ── */}
      {activeId === 'custom' && (
        <section className="panel rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icon.Sliders width="16" height="16" style={{ color: '#f59e0b' }} />
              <span className="text-sm font-semibold thai">ตั้งค่าแผนกำหนดเอง</span>
            </div>
            <button onClick={() => setShowCustom(v => !v)}
                    className="text-xs text-muted hover:opacity-70 cursor-pointer">
              {showCustom ? 'ซ่อน' : 'แสดง'}
            </button>
          </div>

          {showCustom && (
            <div className="space-y-5">
              <div>
                <div className="text-[10px] uppercase eyebrow text-muted mb-3">สัดส่วนพลังงาน · Energy Shares (%)</div>
                <div className="space-y-3">
                  <SliderRow label="Grid"     value={customCfg.shares.grid}     min={0} max={100} step={1} onChange={v => setShare('grid', v)}     color="var(--primary)" />
                  <SliderRow label="Battery"  value={customCfg.shares.battery}  min={0} max={100} step={1} onChange={v => setShare('battery', v)}  color="#10b981" />
                  <SliderRow label="Diesel A" value={customCfg.shares.diesel_a} min={0} max={100} step={1} onChange={v => setShare('diesel_a', v)} color="#f59e0b" />
                  <SliderRow label="Diesel C" value={customCfg.shares.diesel_c} min={0} max={100} step={1} onChange={v => setShare('diesel_c', v)} color="#ef4444" />
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase eyebrow text-muted mb-3">ช่วงเวลาจ่ายไฟ · Dispatch Windows</div>
                <div className="space-y-2">
                  <WindowRow label="Grid"     value={customCfg.windows.grid}     onChange={v => setWindow('grid', v)}     color="var(--primary)" />
                  <WindowRow label="Battery"  value={customCfg.windows.battery}  onChange={v => setWindow('battery', v)}  color="#10b981" />
                  <WindowRow label="Diesel A" value={customCfg.windows.diesel_a} onChange={v => setWindow('diesel_a', v)} color="#f59e0b" />
                  <WindowRow label="Diesel C" value={customCfg.windows.diesel_c} onChange={v => setWindow('diesel_c', v)} color="#ef4444" />
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── cost breakdown ── */}
      {cost && (
        <section>
          <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">ต้นทุน · Cost Breakdown</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'ต้นทุนรวม', value: fmtCost(cost.total_thb), unit: '฿', color: activeMeta.color },
              { label: 'Grid',     value: fmtCost(cost.grid_thb),    unit: '฿', color: 'var(--primary)' },
              { label: 'Battery',  value: fmtCost(cost.battery_thb), unit: '฿', color: '#10b981' },
              { label: 'Diesel',   value: fmtCost(cost.diesel_thb),  unit: '฿', color: '#f59e0b' },
            ].map(c => (
              <div key={c.label} className="panel rounded-xl p-4">
                <div className="text-[10px] uppercase eyebrow text-muted mb-1">{c.label}</div>
                <div className="text-xl font-bold mono" style={{ color: c.color }}>{c.value}</div>
                <div className="text-xs text-muted">{c.unit}/day</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── dispatch chart ── */}
      <section>
        <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">แผนการจ่ายไฟ 24 ชม. · 24-Hour Dispatch Plan</div>
        <div className="panel rounded-xl p-4">
          {loading && !chartData.length ? (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm gap-2">
              <Dot color="var(--primary)" pulse /> <span>กำลังคำนวณ…</span>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <XAxis dataKey="h" tickFormatter={h => `${h}h`}
                       tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} unit=" MW" />
                <Tooltip content={<DispatchTip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                <ReferenceLine y={8} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'Line 6 Cap', position: 'right', fontSize: 9, fill: '#ef4444' }} />
                <Bar dataKey="Grid"       stackId="a" fill="var(--primary)" />
                <Bar dataKey="Battery"    stackId="a" fill="#10b981" />
                <Bar dataKey="Diesel A"   stackId="a" fill="#f59e0b" />
                <Bar dataKey="Diesel C"   stackId="a" fill="#ef4444" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm">No plan data</div>
          )}
        </div>
      </section>

      {/* ── SoC curve ── */}
      {chartData.length > 0 && (
        <section>
          <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">Battery SoC Curve</div>
          <div className="panel rounded-xl p-4">
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="socGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <XAxis dataKey="h" tickFormatter={h => `${h}h`}
                       tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} unit="%" domain={[0,100]} />
                <Tooltip formatter={v => [`${v}%`, 'SoC']} />
                <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 2" />
                <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="3 2" />
                <Area
                  type="monotone" dataKey="SoC" name="Battery SoC"
                  stroke="#10b981" strokeWidth={2} fill="url(#socGrad)" dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── hourly table ── */}
      {plan?.rows?.length > 0 && (
        <section>
          <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">ตารางรายชั่วโมง · Hourly Table</div>
          <div className="panel rounded-xl overflow-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b hairline">
                  {['Hour','Load','Grid','Battery','Diesel A','Diesel C','SoC','Token/h','Status'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-muted eyebrow uppercase font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r, i) => (
                  <tr key={i} className="border-b hairline last:border-0 hover:opacity-80">
                    <td className="px-3 py-2 mono">{String(r.hour).padStart(2,'0')}:00</td>
                    <td className="px-3 py-2 mono">{fmt1(r.load_mw)}</td>
                    <td className="px-3 py-2 mono" style={{ color: 'var(--primary)' }}>{fmt1(r.grid_mw)}</td>
                    <td className="px-3 py-2 mono" style={{ color: '#10b981' }}>{fmt1(r.battery_mw)}</td>
                    <td className="px-3 py-2 mono" style={{ color: '#f59e0b' }}>{fmt1(r.diesel_a_mw)}</td>
                    <td className="px-3 py-2 mono" style={{ color: '#ef4444' }}>{fmt1(r.diesel_c_mw)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="mono">{fmtPct(r.soc_pct)}</span>
                        <MiniBar pct={r.soc_pct ?? 0} color="#10b981" />
                      </div>
                    </td>
                    <td className="px-3 py-2 mono">{fmt1(r.token_per_hour)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </div>
  )
}

function fmtPct(v) { return v == null ? '—' : `${Number(v).toFixed(0)}%` }
