'use client'
import { MixBlock }        from './MixBlock'
import { Line6Gauge }      from './Line6Gauge'
import { BESSColumn }      from './BESSColumn'
import { BlendedCostKPI }  from './BlendedCostKPI'

export function OperationalPanel({ rt, onAssetClick }) {
  if (!rt) {
    return (
      <div className="panel rounded-xl p-4 mb-4 h-[210px] flex items-center justify-center text-muted text-sm">
        Loading operational data…
      </div>
    )
  }

  return (
    <div
      className="panel rounded-xl p-4 mb-4 grid gap-4 grid-cols-1 md:grid-cols-2 xl:[grid-template-columns:1.9fr_1.1fr_1.1fr_0.9fr]"
    >
      <MixBlock         rt={rt} onAssetClick={onAssetClick} />
      <Line6Gauge       rt={rt} onAssetClick={onAssetClick} />
      <BESSColumn       rt={rt} onAssetClick={onAssetClick} />
      <BlendedCostKPI   rt={rt} />
    </div>
  )
}
