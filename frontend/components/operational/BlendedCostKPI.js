'use client'
export function BlendedCostKPI({ rt }) {
  return <div className="text-xs text-muted">Cost · {rt?.kpi?.blended_cost_token_per_kwh?.toFixed(2)} Token/kWh</div>
}
