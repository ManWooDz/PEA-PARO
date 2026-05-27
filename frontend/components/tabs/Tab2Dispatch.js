'use client'
import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  ReferenceLine, ReferenceArea,
} from 'recharts'
import { Icon } from '@/components/shared/Icon'
import { Dot }  from '@/components/shared/Dot'
import { ApplyPlanDialog } from '@/components/operational/ApplyPlanDialog'
import { useApplyPlan }    from '@/hooks/useApplyPlan'

const fmt1   = v => (v == null ? '—' : Number(v).toFixed(1))
const fmt2   = v => (v == null ? '—' : Number(v).toFixed(2))
const fmtBaht = v => (v == null ? '—' : `฿${(v / 1000).toFixed(1)}k`)
const SALE_BAHT_PER_KWH = 4

// ── Strategy metadata ───────────────────────────────────────────────
const STRATEGIES = [
  { id: 'baseline',    th: 'แผนพื้นฐาน',   en: 'BASELINE',    desc: 'แผนที่ระบบกำลังใช้งานอยู่',         color: '#0ea5e9' },
  { id: 'min-cost',    th: 'ลดต้นทุน',       en: 'MIN COST',    desc: 'ใช้ Grid + BESS เน้นดีเซลเฉพาะที่จำเป็น', color: '#6366f1' },
  { id: 'reliability', th: 'เสถียรภาพ',      en: 'RELIABILITY', desc: 'รักษา SoC ≥ 40% · ดีเซล standby',  color: '#10b981' },
]

// ── Strategy summary card ───────────────────────────────────────────
function StrategyCard({ strat, plan, baselineCost, isActive, onSelect }) {
  if (!plan) {
    return (
      <button onClick={onSelect}
              className="panel rounded-xl p-4 text-left opacity-60 cursor-pointer">
        <div className="text-[10px] uppercase eyebrow text-muted">{strat.en}</div>
        <div className="text-xs mt-2 text-muted">Loading…</div>
      </button>
    )
  }

  const totalCost = plan.cost?.total_thb ?? 0
  // Diesel total MWh / day
  const dieselMwh = (plan.rows ?? []).reduce(
    (s, r) => s + (r.diesel_a_mw ?? 0) + (r.diesel_c_mw ?? 0), 0
  )
  // SoC at last hour
  const socEnd = plan.rows?.[plan.rows.length - 1]?.soc_pct ?? 0
  // Revenue = total load × sale rate
  const totalLoadKwh = (plan.rows ?? []).reduce((s, r) => s + (r.load_mw ?? 0) * 1000, 0)
  const revenue     = totalLoadKwh * SALE_BAHT_PER_KWH
  const net         = revenue - totalCost
  const vsBaseline  = baselineCost ? totalCost - baselineCost : 0
  const vsBaselinePct = baselineCost ? (vsBaseline / baselineCost) * 100 : 0

  return (
    <button onClick={onSelect}
            className="panel rounded-xl p-4 text-left cursor-pointer transition hover:opacity-95"
            style={{
              borderColor: isActive ? strat.color : 'var(--border-soft)',
              borderWidth: isActive ? '2px' : '1px',
            }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-base thai font-semibold" style={{ color: strat.color }}>{strat.th}</div>
          <div className="text-[10px] uppercase eyebrow text-muted">{strat.en}</div>
        </div>
        {isActive && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase eyebrow"
                style={{ background: `${strat.color}22`, color: strat.color }}>Active</span>
        )}
      </div>
      <div className="text-xs text-muted thai mt-1">{strat.desc}</div>

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <div className="mono font-semibold text-base">{fmt2(dieselMwh)} <span className="text-[10px] text-muted">MWh diesel</span></div>
          <div className="text-[10px] text-muted">SoC end · <span className="mono">{fmt1(socEnd)}%</span></div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase eyebrow text-muted">Total Cost · 24h</div>
          <div className="mono font-semibold text-base">{fmtBaht(totalCost)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase eyebrow text-muted">Net (Rev − Cost)</div>
          <div className="mono font-semibold" style={{ color: net >= 0 ? '#10b981' : '#ef4444' }}>
            {net >= 0 ? '+' : ''}{fmtBaht(net)}
          </div>
        </div>
        {strat.id !== 'baseline' && baselineCost > 0 && (
          <div className="text-right">
            <div className="text-[10px] uppercase eyebrow text-muted">Vs Baseline</div>
            <div className="mono font-semibold" style={{ color: vsBaseline <= 0 ? '#10b981' : '#ef4444' }}>
              {vsBaseline >= 0 ? '+' : '−'}{(Math.abs(vsBaseline) / 1000).toFixed(1)}k · {vsBaseline >= 0 ? '+' : '−'}{Math.abs(vsBaselinePct).toFixed(1)}%
            </div>
          </div>
        )}
      </div>
    </button>
  )
}

// ── Slider row in Custom Dispatch ──────────────────────────────────
function SliderRow({ label, sub, color, value, onChange, window, onWindow }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[120px_1fr_180px] gap-3 items-center py-3 border-b hairline last:border-0">
      <div>
        <div className="text-sm font-medium" style={{ color }}>{label}</div>
        <div className="text-[10px] text-muted">{sub}</div>
      </div>
      <div className="flex items-center gap-3">
        <input type="range" min={0} max={100} value={value}
               className="tk flex-1"
               onChange={e => onChange(parseInt(e.target.value))} />
        <span className="mono text-sm font-semibold w-12 text-right" style={{ color }}>{value}%</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[10px] uppercase eyebrow text-muted">Hours</span>
        <select value={window[0]} onChange={e => onWindow([parseInt(e.target.value), window[1]])}
                className="panel-2 border hairline rounded px-1.5 py-0.5 mono text-xs">
          {Array.from({length: 25}, (_, i) => <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>)}
        </select>
        <span className="text-muted">→</span>
        <select value={window[1]} onChange={e => onWindow([window[0], parseInt(e.target.value)])}
                className="panel-2 border hairline rounded px-1.5 py-0.5 mono text-xs">
          {Array.from({length: 25}, (_, i) => <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>)}
        </select>
      </div>
    </div>
  )
}

// ── Chart tooltip ───────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="mono text-muted mb-1">{String(label).padStart(2,'0')}:00</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span style={{ color: p.color }}>●</span>
          <span className="text-muted">{p.name}</span>
          <span className="mono">{fmt2(p.value)} MW</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────
export function Tab2Dispatch({
  plans, activeId, applyPlan,
  customCfg, setCustomCfg,
  hasSolar, setHasSolar,
  loading,
  activePlanId, setActivePlanId,
  focusedHour, onHourClick,
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { apply, submitting } = useApplyPlan()

  const baselinePlan = plans?.baseline
  const baselineCost = baselinePlan?.cost?.total_thb ?? 0

  const activePlan = plans?.[activeId] ?? plans?.baseline
  const rows = activePlan?.rows ?? []

  // ── Custom slider helpers ──
  const setShare  = (k, v) => setCustomCfg(c => ({ ...c, shares:  { ...c.shares,  [k]: v } }))
  const setWindow = (k, v) => setCustomCfg(c => ({ ...c, windows: { ...c.windows, [k]: v } }))

  const customCost = plans?.custom?.cost?.total_thb ?? 0
  const customRows = plans?.custom?.rows ?? []
  const customTotalLoadKwh = customRows.reduce((s, r) => s + (r.load_mw ?? 0) * 1000, 0)
  const customNet = customTotalLoadKwh * SALE_BAHT_PER_KWH - customCost

  // ── Apply Plan ──
  const handleConfirmApply = async () => {
    try {
      const result = await apply({
        strategy: activeId, horizon_hours: 24,
        custom_cfg: activeId === 'custom' ? customCfg : null,
      })
      setActivePlanId?.(result.plan_id)
    } catch (e) { console.error(e) }
    setDialogOpen(false)
  }

  // ── Chart data ──
  const chartData = rows.map(r => ({
    h:        r.hour,
    Grid:     +(r.grid_mw?.toFixed(2)     ?? 0),
    Solar:    +(r.solar_mw?.toFixed(2)    ?? 0),
    Battery:  +(r.battery_mw?.toFixed(2)  ?? 0),
    'Diesel A': +(r.diesel_a_mw?.toFixed(2) ?? 0),
    'Diesel C': +(r.diesel_c_mw?.toFixed(2) ?? 0),
    SoC:      +(r.soc_pct?.toFixed(1)     ?? 0),
  }))

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <section className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10.5px] uppercase eyebrow text-muted">แผนการจ่ายไฟ · MILP Rolling Horizon</div>
          <h1 className="text-xl font-semibold mt-0.5">Optimal Dispatch · 24h</h1>
          <div className="text-xs text-muted mt-1 thai">
            ดีเซล <span className="mono">฿15/kWh</span> · ขาย <span className="mono">฿{SALE_BAHT_PER_KWH}/kWh</span> ·
            ดีเซลทุก kWh <span style={{ color: '#ef4444' }} className="mono">ขาดทุน ฿11</span>
          </div>
        </div>
      </section>

      {/* ── Solar Scenario toggle ── */}
      <section className="panel rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10.5px] uppercase eyebrow text-muted">Solar Scenario</div>
            <div className="text-xs text-muted mt-0.5 thai">เปรียบเทียบเกาะปัจจุบัน vs หลังติดตั้ง PV</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setHasSolar(false)}
                    className="px-4 py-2 rounded-lg text-sm border cursor-pointer transition hover:opacity-90"
                    style={!hasSolar
                      ? { borderColor: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)', fontWeight: 600 }
                      : { borderColor: 'var(--border-soft)', background: 'var(--surface-2)', color: 'var(--muted)' }}>
              <span className="thai">ไม่มี Solar</span> <span className="text-[10px] ml-1">(current)</span>
            </button>
            <button onClick={() => setHasSolar(true)}
                    className="px-4 py-2 rounded-lg text-sm border cursor-pointer transition hover:opacity-90"
                    style={hasSolar
                      ? { borderColor: '#f59e0b', background: 'rgba(245,158,11,0.10)', color: '#f59e0b', fontWeight: 600 }
                      : { borderColor: 'var(--border-soft)', background: 'var(--surface-2)', color: 'var(--muted)' }}>
              ☀️ <span className="thai">มี Solar</span> <span className="text-[10px] ml-1">(0.8 MWp)</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── 3 strategy cards ── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {STRATEGIES.map(s => (
          <StrategyCard key={s.id} strat={s} plan={plans?.[s.id]}
                        baselineCost={baselineCost}
                        isActive={activeId === s.id}
                        onSelect={() => applyPlan(s.id)} />
        ))}
      </section>

      {/* ── Custom Dispatch ── */}
      <section className="panel rounded-xl p-5">
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Icon.Sliders width="16" height="16" />
              <span className="text-base font-semibold thai">แผนกำหนดเอง · Custom Dispatch</span>
            </div>
            <div className="text-[10.5px] uppercase eyebrow text-muted mt-1">Share % per source + Active hours</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase eyebrow text-muted">Custom Plan Cost</div>
            <div className="text-lg font-bold mono">{fmtBaht(customCost)}</div>
            <div className="text-[11px] mono" style={{ color: customNet >= 0 ? '#10b981' : '#ef4444' }}>
              net {customNet >= 0 ? '+' : ''}{fmtBaht(customNet)}
            </div>
          </div>
        </div>

        <div>
          <SliderRow
            label="BESS"      sub="Battery #7 · 30 MWh / 12.5 MW"   color="#10b981"
            value={customCfg.shares.battery ?? 0}
            onChange={v => setShare('battery', v)}
            window={customCfg.windows.battery ?? [9, 22]}
            onWindow={w => setWindow('battery', w)}
          />
          <SliderRow
            label="Diesel #8"  sub="Island A · 3 × 5 MW"             color="#f97316"
            value={customCfg.shares.diesel_a ?? 0}
            onChange={v => setShare('diesel_a', v)}
            window={customCfg.windows.diesel_a ?? [19, 22]}
            onWindow={w => setWindow('diesel_a', w)}
          />
          <SliderRow
            label="Diesel #9"  sub="Island C · 2 × 2.5 MW"           color="#ef4444"
            value={customCfg.shares.diesel_c ?? 0}
            onChange={v => setShare('diesel_c', v)}
            window={customCfg.windows.diesel_c ?? [18, 22]}
            onWindow={w => setWindow('diesel_c', w)}
          />
          {hasSolar && (
            <SliderRow
              label="Solar"    sub="PV Array · 0.8 MWp"             color="#f59e0b"
              value={customCfg.shares.solar ?? 0}
              onChange={v => setShare('solar', v)}
              window={customCfg.windows.solar ?? [7, 18]}
              onWindow={w => setWindow('solar', w)}
            />
          )}
        </div>

        <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
          <button onClick={() => applyPlan('custom')}
                  className="px-3 py-1.5 rounded text-sm border hairline cursor-pointer hover:opacity-80"
                  style={{ background: activeId === 'custom' ? 'rgba(14,165,233,0.10)' : 'var(--surface-2)',
                           color: activeId === 'custom' ? 'var(--primary)' : 'var(--muted)',
                           borderColor: activeId === 'custom' ? 'var(--primary)' : 'var(--border-soft)' }}>
            ใช้แผนกำหนดเอง · Use Custom
          </button>
        </div>
      </section>

      {/* ── 24h Dispatch Chart ── */}
      <section>
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div className="text-[10.5px] uppercase eyebrow text-muted">แผนการจ่ายไฟ 24 ชม. · 24-Hour Dispatch Plan</div>
          <button onClick={() => setDialogOpen(true)}
                  className="px-4 py-2 rounded text-sm font-semibold cursor-pointer hover:opacity-90 bg-gradient" style={{ color: '#fff' }}>
            ▶ Apply Plan
          </button>
        </div>
        {activePlanId && (
          <div className="text-xs mono mb-2" style={{ color: '#10b981' }}>
            ● Active plan: {String(activePlanId).slice(0, 8)}
          </div>
        )}

        <div className="panel rounded-xl p-4">
          {loading && !chartData.length ? (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm gap-2">
              <Dot color="var(--primary)" pulse /> <span>กำลังคำนวณ…</span>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <ReferenceArea x1={0}  x2={9}    fill="#3b82f6" fillOpacity={0.06} />
                <ReferenceArea x1={22} x2={23.5} fill="#3b82f6" fillOpacity={0.06} />
                <ReferenceArea x1={9}  x2={22}   fill="#f59e0b" fillOpacity={0.06} />
                <XAxis dataKey="h" tickFormatter={h => `${h}h`}
                       tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} unit=" MW" />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                <ReferenceLine y={8} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'Line 6 Cap', position: 'right', fontSize: 9, fill: '#ef4444' }} />
                <Bar dataKey="Grid"     stackId="a" fill="var(--primary)" />
                <Bar dataKey="Solar"    stackId="a" fill="#f59e0b" />
                <Bar dataKey="Battery"  stackId="a" fill="#10b981" />
                <Bar dataKey="Diesel A" stackId="a" fill="#f97316" />
                <Bar dataKey="Diesel C" stackId="a" fill="#ef4444" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-muted text-sm">No plan data</div>
          )}

          <div className="flex items-center gap-4 mt-2 text-[10px] text-muted flex-wrap">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-2" style={{ background: 'rgba(59,130,246,0.18)' }} />
              Battery charge window (22:00–08:59)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-2" style={{ background: 'rgba(245,158,11,0.18)' }} />
              Battery discharge window (09:00–21:59)
            </span>
          </div>
        </div>
      </section>

      {/* ── Hourly table ── */}
      {rows.length > 0 && (
        <section>
          <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">ตารางรายชั่วโมง · Hourly Table</div>
          <div className="panel rounded-xl overflow-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="border-b hairline">
                  {['Hour','Load','Grid','Solar','BESS','D #8','D #9','SoC','Status'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-muted eyebrow uppercase font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}
                      onClick={() => onHourClick?.(r.hour)}
                      className="border-b hairline last:border-0 hover:opacity-80 cursor-pointer">
                    <td className="px-3 py-2 mono">{String(r.hour).padStart(2,'0')}:00</td>
                    <td className="px-3 py-2 mono">{fmt1(r.load_mw)}</td>
                    <td className="px-3 py-2 mono" style={{ color: 'var(--primary)' }}>{fmt1(r.grid_mw)}</td>
                    <td className="px-3 py-2 mono" style={{ color: '#f59e0b' }}>{fmt1(r.solar_mw)}</td>
                    <td className="px-3 py-2 mono" style={{ color: '#10b981' }}>{fmt1(r.battery_mw)}</td>
                    <td className="px-3 py-2 mono" style={{ color: '#f97316' }}>{fmt1(r.diesel_a_mw)}</td>
                    <td className="px-3 py-2 mono" style={{ color: '#ef4444' }}>{fmt1(r.diesel_c_mw)}</td>
                    <td className="px-3 py-2 mono">{fmt1(r.soc_pct)}%</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px]"
                            style={{ background: r.status === 'normal' ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)',
                                     color:      r.status === 'normal' ? '#10b981' : '#f59e0b' }}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ApplyPlanDialog
        open={dialogOpen}
        strategy={activeId}
        onConfirm={handleConfirmApply}
        onCancel={() => setDialogOpen(false)}
        submitting={submitting}
      />
    </div>
  )
}
