'use client'
import { useEvents } from '@/hooks/useEvents'

const SEV_COLOR = {
  info:     '#9ca3af',
  warn:     '#f59e0b',
  critical: '#ef4444',
}

export function EventsLog() {
  const { events } = useEvents()

  return (
    <div className="panel rounded-xl p-4 h-full overflow-hidden flex flex-col">
      <div className="text-[10px] uppercase eyebrow text-muted mb-2">Recent Events (last 20)</div>
      <div className="overflow-y-auto flex-1 space-y-1.5" style={{ maxHeight: 240 }}>
        {events.length === 0 && (
          <div className="text-xs text-muted">No events yet</div>
        )}
        {events.map((e, i) => (
          <div key={`${e.ts}-${i}`} className="flex items-start gap-2 text-[11px]">
            <span className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: SEV_COLOR[e.severity] ?? SEV_COLOR.info }} />
            <span className="mono text-muted flex-shrink-0">{e.ts.slice(11, 19)}</span>
            <span className="mono text-muted flex-shrink-0">{e.asset}</span>
            <span className="flex-1 truncate" style={{ color: 'var(--text)' }}>{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
