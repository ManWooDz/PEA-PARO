'use client'
import { useEffect, useRef, useState } from 'react'

// Zone thresholds (Token/kWh): cheap < 5, mixed 5–9, expensive > 9
const Z_CHEAP     = 5
const Z_EXPENSIVE = 9
const TARGET      = 5.0   // operational target

function zoneOf(cost) {
  if (cost < Z_CHEAP)     return { color: '#10b981', label: 'cheap'     }
  if (cost < Z_EXPENSIVE) return { color: '#f59e0b', label: 'mixed'     }
  return                       { color: '#ef4444', label: 'expensive' }
}

export function BlendedCostKPI({ rt }) {
  const cost = rt?.kpi?.blended_cost_token_per_kwh ?? 0
  const zone = zoneOf(cost)

  // Rolling 24-sample buffer (24 polls @ 3s ≈ 72s — indicative average)
  const histRef = useRef([])
  const [avg, setAvg] = useState(cost)
  useEffect(() => {
    if (cost === 0) return
    histRef.current = [...histRef.current.slice(-23), cost]
    const m = histRef.current.reduce((s, v) => s + v, 0) / histRef.current.length
    setAvg(m)
  }, [cost])

  const deltaPct = avg > 0 ? ((cost - TARGET) / TARGET) * 100 : 0
  const trendUp  = deltaPct > 1
  const trendDn  = deltaPct < -1

  // Cap zone bar position (cost relative to 0–15 Token/kWh)
  const barPct = Math.min(100, Math.max(0, (cost / 15) * 100))

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="text-[10px] uppercase eyebrow text-muted">Blended Cost</div>
      <div className="text-3xl font-bold mono leading-none" style={{ color: zone.color }}>
        {cost.toFixed(2)}
      </div>
      <div className="text-[10px] mono text-muted -mt-0.5">Token / kWh</div>

      <div className="text-[10px] mono text-muted mt-2">
        Avg recent: <span style={{ color: 'var(--text)' }}>{avg.toFixed(2)}</span>
      </div>
      <div className="text-[10px] mono" style={{ color: trendUp ? '#ef4444' : trendDn ? '#10b981' : 'var(--muted)' }}>
        {trendUp ? '↑' : trendDn ? '↓' : '→'} {Math.abs(deltaPct).toFixed(0)} % vs target ({TARGET})
      </div>

      {/* Zone bar */}
      <div className="mt-auto pt-2">
        <div className="relative h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{
            width: `${barPct}%`,
            background: 'linear-gradient(to right, #10b981, #f59e0b, #ef4444)',
          }} />
          <div className="absolute -top-0.5 w-0.5 h-2.5" style={{
            left: `${barPct}%`,
            transform: 'translateX(-50%)',
            background: 'var(--text)',
          }} />
        </div>
        <div className="flex justify-between text-[9px] text-muted mt-0.5">
          <span>cheap</span><span>mixed</span><span>expensive</span>
        </div>
      </div>
    </div>
  )
}
