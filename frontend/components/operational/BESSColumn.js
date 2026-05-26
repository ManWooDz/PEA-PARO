'use client'
export function BESSColumn({ rt }) {
  return <div className="text-xs text-muted">BESS · {rt?.kpi?.battery_soc_pct?.toFixed(0)} %</div>
}
