'use client'
export function MiniBar({ pct, color }) {
  return (
    <div className="mt-3 h-1.5 w-full rounded-full" style={{ background: 'var(--tip-bg)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}
