'use client'
import { DieselStatusPill } from './DieselStatusPill'

const SRC_COLORS = {
  grid:     'var(--primary)',
  battery:  '#10b981',
  diesel_8: '#f59e0b',
  diesel_9: '#ef4444',
}

function pct(n, total) { return total > 0 ? (n / total) * 100 : 0 }

export function MixBlock({ rt, onAssetClick }) {
  if (!rt) return null
  const totalLoad = rt.kpi.island_c_load_mw ?? 0

  // Derive each source's contribution
  const grid_mw = Math.max(0, rt.lines?.find(l => l.id === 6)?.flow_mw ?? 0)
  const d8_mw   = rt.diesel_units?.filter(u => u.asset === 'diesel_8').reduce((s, u) => s + u.output_mw, 0) ?? 0
  const d9_mw   = rt.diesel_units?.filter(u => u.asset === 'diesel_9').reduce((s, u) => s + u.output_mw, 0) ?? 0
  // Battery MW derived as residual: total load - other sources
  const bat_mw  = Math.max(0, totalLoad - grid_mw - d8_mw - d9_mw)
  const sum     = grid_mw + bat_mw + d8_mw + d9_mw
  const unserved = Math.max(0, totalLoad - sum)

  const d8_units = rt.diesel_units?.filter(u => u.asset === 'diesel_8') ?? []
  const d9_units = rt.diesel_units?.filter(u => u.asset === 'diesel_9') ?? []
  // Aggregate worst state per asset for the inline pill (running > cooldown > standby)
  const aggregateUnit = (units) => {
    const running = units.find(u => u.on)
    if (running) return running
    const cooldown = units.find(u => u.cooldown_remaining_min > 0)
    if (cooldown) return cooldown
    return units[0] ?? { on: false, cooldown_remaining_min: 0, unit_id: 0 }
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] uppercase eyebrow text-muted">Live Generation Mix</div>
        <div className="text-xs mono">
          Total Load <span className="font-semibold text-base ml-1">{totalLoad.toFixed(2)}</span>
          <span className="text-muted text-[10px] ml-0.5">MW</span>
        </div>
      </div>

      {/* 100% stacked bar */}
      <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-2)' }}>
        <div style={{ width: `${pct(grid_mw, sum)}%`, background: SRC_COLORS.grid }} />
        <div style={{ width: `${pct(bat_mw,  sum)}%`, background: SRC_COLORS.battery }} />
        <div style={{ width: `${pct(d8_mw,   sum)}%`, background: SRC_COLORS.diesel_8 }} />
        <div style={{ width: `${pct(d9_mw,   sum)}%`, background: SRC_COLORS.diesel_9 }} />
      </div>

      {/* Source list */}
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 gap-y-1 text-[11px] mono">
        <Row label="Grid (L6)" mw={grid_mw} total={sum} color={SRC_COLORS.grid}     onClick={() => onAssetClick?.('line_6')} />
        <Row label="BESS ⑦"    mw={bat_mw}  total={sum} color={SRC_COLORS.battery}  onClick={() => onAssetClick?.('battery_7')} />
        <Row label="Diesel ⑧"  mw={d8_mw}   total={sum} color={SRC_COLORS.diesel_8} onClick={() => onAssetClick?.('diesel_8')} pill={<DieselStatusPill unit={aggregateUnit(d8_units)} />} />
        <Row label="Diesel ⑨"  mw={d9_mw}   total={sum} color={SRC_COLORS.diesel_9} onClick={() => onAssetClick?.('diesel_9')} pill={<DieselStatusPill unit={aggregateUnit(d9_units)} />} />
      </div>

      <div className="text-[10px] text-muted">
        {unserved > 0.01
          ? <span style={{ color: '#ef4444' }}>⚠ {(unserved * 1000).toFixed(0)} kW unserved</span>
          : <span style={{ color: '#10b981' }}>✓ Demand met</span>}
      </div>
    </div>
  )
}

function Row({ label, mw, total, color, pill, onClick }) {
  return (
    <>
      <button onClick={onClick} className="flex items-center gap-1.5 text-left hover:opacity-80 cursor-pointer">
        <span className="inline-block w-2 h-2 rounded-sm" style={{ background: color }} />
        <span>{label}</span>
      </button>
      <span /> {/* spacer */}
      <span className="text-right">{mw.toFixed(2)} MW</span>
      <span className="text-right text-muted">
        {pct(mw, total).toFixed(0)} %
        {pill && <span className="ml-2">{pill}</span>}
      </span>
    </>
  )
}
