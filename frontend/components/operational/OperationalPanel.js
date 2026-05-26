'use client'
import { MixBlock }        from './MixBlock'
import { Line6Gauge }      from './Line6Gauge'
import { BESSColumn }      from './BESSColumn'
import { BlendedCostKPI }  from './BlendedCostKPI'

export function OperationalPanel({ rt, onAssetClick, offline = false }) {
  // ── Skeleton loading state ──
  if (!rt) {
    return (
      <div className="panel rounded-xl p-4 mb-4 grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4" style={{ minHeight: 210 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-lg animate-pulse" style={{ background: 'var(--surface-2)', minHeight: 180 }} />
        ))}
      </div>
    )
  }

  return (
    <div
      className="panel rounded-xl p-4 mb-4 grid gap-4 grid-cols-1 md:grid-cols-2 xl:[grid-template-columns:1.9fr_1.1fr_1.1fr_0.9fr]"
      style={{
        filter: offline ? 'grayscale(0.7) opacity(0.7)' : 'none',
        transition: 'filter 400ms',
      }}
    >
      <MixBlock         rt={rt} onAssetClick={onAssetClick} />
      <Line6Gauge       rt={rt} onAssetClick={onAssetClick} />
      <BESSColumn       rt={rt} onAssetClick={onAssetClick} />
      <BlendedCostKPI   rt={rt} />
    </div>
  )
}
