'use client'
export function OperationalPanel({ rt }) {
  return (
    <div className="panel rounded-xl p-4 mb-4 text-xs text-muted">
      OperationalPanel placeholder · status: {rt?.status ?? '—'}
    </div>
  )
}
