'use client'

const ASSET_META = {
  mainland:   { name: 'Mainland Grid Source',           icon: '🏭', color: 'var(--primary)' },
  island_a:   { name: 'Island A · Transit',             icon: '🏝',  color: 'var(--text)' },
  island_b:   { name: 'Island B · Transit',             icon: '🏝',  color: 'var(--text)' },
  island_c:   { name: 'Island C · Koh Tao (CRITICAL)',  icon: '⚡', color: 'var(--primary)' },
  line_1_2_3: { name: 'Lines 1/2/3 · Mainland→A (115kV)', icon: '⚡', color: 'var(--primary)' },
  line_4_5:   { name: 'Lines 4/5 · A→B (115/33kV)',     icon: '⚡', color: '#f59e0b' },
  line_6:     { name: 'Line 6 · B→C (33kV, 8 MW cap)',  icon: '⚡', color: '#ef4444' },
  battery_7:  { name: 'Battery #7 (BESS, Island A)',    icon: '🔋', color: '#10b981' },
  diesel_8:   { name: 'Diesel Gen #8 (Island A · 3×5MW)', icon: '⛽', color: '#f59e0b' },
  diesel_9:   { name: 'Diesel Gen #9 (Island C · 2×2.5MW)', icon: '⛽', color: '#ef4444' },
}

function statsFor(assetId, rt) {
  if (!rt) return []
  const k = rt.kpi
  const findLine = (id) => rt.lines?.find(l => l.id === id)
  switch (assetId) {
    case 'line_6': {
      const l = findLine(6)
      return [
        ['Current flow',    `${l?.flow_mw?.toFixed(2) ?? '—'} MW`],
        ['Cable limit',     '8.0 MW (physical)'],
        ['Practical limit', '~1.3 MW (cascading)'],
        ['Utilisation',     `${k?.line6_util_pct?.toFixed(1) ?? '—'} %`],
        ['Status',          l?.status ?? '—'],
      ]
    }
    case 'battery_7':
      return [
        ['SoC',             `${k?.battery_soc_pct?.toFixed(1) ?? '—'} %`],
        ['Energy stored',   `${k?.battery_soc_mwh?.toFixed(2) ?? '—'} MWh / 30 MWh`],
        ['Operating range', '20 % – 80 % SoC'],
        ['Discharge window','09:00 – 21:59'],
        ['Charge window',   '22:00 – 08:59'],
        ['Max power',       '12.5 MW'],
      ]
    case 'diesel_8':
    case 'diesel_9': {
      const units = rt.diesel_units?.filter(u => u.asset === assetId) ?? []
      const total = units.reduce((s, u) => s + u.output_mw, 0)
      const stats = [
        ['Units',           `${units.filter(u => u.on).length} of ${units.length} running`],
        ['Total output',    `${total.toFixed(2)} MW`],
        ['Per-unit cap',    assetId === 'diesel_8' ? '5.0 MW' : '2.5 MW'],
        ['Min down-time',   '10 min'],
        ['Cost',            `${assetId === 'diesel_8' ? '15' : '12'} Token/kWh`],
      ]
      units.forEach((u) => {
        stats.push([
          `Unit ${u.unit_id}`,
          u.on
            ? `🟢 Running · ${u.output_mw.toFixed(2)} MW`
            : u.cooldown_remaining_min > 0
              ? `🟡 Cooldown · ${u.cooldown_remaining_min} m left`
              : '⚪ Standby',
        ])
      })
      return stats
    }
    case 'line_1_2_3':
    case 'line_4_5': {
      const ids = assetId === 'line_1_2_3' ? [1, 2, 3] : [4, 5]
      const segs = ids.map(findLine).filter(Boolean)
      const totalFlow = segs.reduce((s, l) => s + (l.flow_mw ?? 0), 0)
      const totalLim  = segs.reduce((s, l) => s + (l.limit_mw ?? 0), 0)
      return [
        ['Total flow', `${totalFlow.toFixed(2)} MW`],
        ['Aggregate limit', `${totalLim.toFixed(0)} MW`],
        ...segs.map(l => [`L${l.id}`, `${l.flow_mw?.toFixed(2) ?? '—'} / ${l.limit_mw} MW (${l.utilization_pct?.toFixed(0) ?? '—'} %)`]),
      ]
    }
    default:
      return [
        ['Type',  ASSET_META[assetId]?.name ?? assetId],
        ['Status','See topology for live indicators'],
      ]
  }
}

export function AssetDetailCard({ assetId, rt, onClose }) {
  if (!assetId) {
    return (
      <div className="panel rounded-xl p-4 text-xs text-muted">
        Click any node, line, or asset on the topology to see details.
      </div>
    )
  }
  const meta  = ASSET_META[assetId] ?? { name: assetId, icon: 'ℹ', color: 'var(--text)' }
  const stats = statsFor(assetId, rt)

  return (
    <div className="panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta.icon}</span>
          <span className="text-sm font-semibold" style={{ color: meta.color }}>{meta.name}</span>
        </div>
        <button onClick={onClose} className="text-muted hover:opacity-70 text-xs cursor-pointer">✕</button>
      </div>

      <div className="space-y-1.5">
        {stats.map(([label, value]) => (
          <div key={label} className="flex justify-between text-[11px]">
            <span className="text-muted">{label}</span>
            <span className="mono font-medium">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
