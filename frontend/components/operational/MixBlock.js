'use client'
export function MixBlock({ rt }) {
  return <div className="text-xs text-muted">MixBlock · load {rt?.kpi?.island_c_load_mw?.toFixed(2)} MW</div>
}
