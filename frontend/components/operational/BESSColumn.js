'use client'

function deriveState(rt) {
  // Infer charge/discharge from the mix residual
  const total  = rt?.kpi?.island_c_load_mw ?? 0
  const grid   = rt?.lines?.find(l => l.id === 6)?.flow_mw ?? 0
  const d8     = rt?.diesel_units?.filter(u => u.asset === 'diesel_8').reduce((s, u) => s + u.output_mw, 0) ?? 0
  const d9     = rt?.diesel_units?.filter(u => u.asset === 'diesel_9').reduce((s, u) => s + u.output_mw, 0) ?? 0
  const inferred = total - grid - d8 - d9
  if (inferred > 0.05)  return 'discharging'
  if (inferred < -0.05) return 'charging'
  return 'standby'
}

const STATE_META = {
  discharging: { fill: '#10b981', label: '▶ Discharging' },
  charging:    { fill: '#3b82f6', label: '◀ Charging'    },
  standby:     { fill: '#9ca3af', label: '■ Standby'     },
  locked:      { fill: '#ef4444', label: '⚠ Locked'      },
}

export function BESSColumn({ rt, onAssetClick }) {
  const soc_pct = rt?.kpi?.battery_soc_pct ?? 0
  const soc_mwh = rt?.kpi?.battery_soc_mwh ?? 0
  const state   = soc_pct <= 20 ? 'locked' : deriveState(rt)
  const { fill, label } = STATE_META[state]

  return (
    <button
      onClick={() => onAssetClick?.('battery_7')}
      className="flex flex-col items-center justify-between min-w-0 hover:opacity-90 cursor-pointer"
    >
      <div className="text-[10px] uppercase eyebrow text-muted">BESS Status</div>

      <div className="flex items-center gap-3">
        {/* Vertical battery icon */}
        <svg viewBox="0 0 30 70" width="34" height="80">
          {/* Cap */}
          <rect x={10} y={2} width={10} height={4} rx={1} fill="var(--text)" opacity={0.7} />
          {/* Body outline */}
          <rect x={4} y={8} width={22} height={56} rx={2} fill="none" stroke="var(--text)" strokeWidth={1.5} />
          {/* Bounds markers (20% and 80%) */}
          <line x1={4} x2={26} y1={8 + 56 * 0.20} y2={8 + 56 * 0.20} stroke="var(--text)" opacity={0.25} strokeDasharray="1 1" />
          <line x1={4} x2={26} y1={8 + 56 * 0.80} y2={8 + 56 * 0.80} stroke="var(--text)" opacity={0.25} strokeDasharray="1 1" />
          {/* Fill */}
          <rect
            x={6}
            y={8 + 56 * (1 - soc_pct / 100) + 2}
            width={18}
            height={Math.max(0, 56 * (soc_pct / 100) - 4)}
            rx={1}
            fill={fill}
            style={{ transition: 'y 600ms ease, height 600ms ease, fill 300ms ease' }}
          />
        </svg>

        <div className="flex flex-col items-start text-left">
          <div className="text-2xl font-bold mono leading-none" style={{ color: fill }}>{soc_pct.toFixed(0)} %</div>
          <div className="text-[11px] mono text-muted">{soc_mwh.toFixed(1)} MWh</div>
          <div className="text-[10px] mt-1 px-1.5 py-0.5 rounded font-medium" style={{ background: `${fill}22`, color: fill }}>
            {label}
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted">20–80 % operating bounds</div>
    </button>
  )
}
