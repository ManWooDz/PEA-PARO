'use client'

const LEVEL_META = {
  high:     { color: '#ef4444', emoji: '🔴', pulse: true  },
  medium:   { color: '#f59e0b', emoji: '🟡', pulse: false },
  low:      { color: '#3b82f6', emoji: '🔵', pulse: false },
  resolved: { color: '#10b981', emoji: '✓',  pulse: false },
}

export function AlarmTicker({ activeAlerts = [], onClick }) {
  // Sort by severity: high first, then medium, then low
  const order = { high: 0, medium: 1, low: 2, resolved: 3 }
  const sorted = [...activeAlerts].sort((a, b) =>
    (order[a.level] ?? 9) - (order[b.level] ?? 9)
  )
  const top = sorted[0]

  if (!top) {
    return (
      <div className="w-full border-b hairline px-4 py-1.5 text-[12px] flex items-center gap-2"
           style={{ background: 'var(--surface-2)' }}>
        <span style={{ color: '#10b981' }}>✓</span>
        <span className="text-muted">All systems normal · 0 active alarms</span>
      </div>
    )
  }

  const meta = LEVEL_META[top.level] ?? LEVEL_META.medium

  return (
    <button
      onClick={() => onClick?.(top.id)}
      className="w-full border-b hairline px-4 py-1.5 text-[12px] flex items-center gap-3 cursor-pointer hover:brightness-110 text-left"
      style={{ background: `${meta.color}14` }}
    >
      <span
        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
        style={{
          background: meta.color,
          animation: meta.pulse ? 'alarm-pulse 0.5s infinite alternate' : 'none',
        }}
      />
      <span className="mono text-muted flex-shrink-0">{top.time}</span>
      <span className="font-semibold flex-shrink-0" style={{ color: meta.color }}>
        {top.level.toUpperCase()}
      </span>
      <span className="truncate" style={{ color: 'var(--text)' }}>{top.title}</span>
      <span className="ml-auto text-[10px] text-muted flex-shrink-0">
        {activeAlerts.length} active · click to view
      </span>

      <style jsx>{`
        @keyframes alarm-pulse {
          from { opacity: 1;   transform: scale(1);   }
          to   { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </button>
  )
}
