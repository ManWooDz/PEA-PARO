'use client'
export function Line6Gauge({ rt }) {
  return <div className="text-xs text-muted">Line6Gauge · {rt?.kpi?.line6_util_pct?.toFixed(0)} %</div>
}
