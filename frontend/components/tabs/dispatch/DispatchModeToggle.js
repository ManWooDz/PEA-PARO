'use client'

const MODES = [
  { id: 'day-ahead', label: '📅 Day-ahead · วางแผนล่วงหน้า', color: 'var(--primary)' },
  { id: 'intra-day', label: '⚡ Intra-day · ระหว่างวัน (ฉุกเฉิน)', color: '#ef4444' },
]

export function DispatchModeToggle({ mode, setMode }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {MODES.map(m => {
        const active = mode === m.id
        return (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className="px-4 py-2 rounded-lg text-sm border cursor-pointer transition hover:opacity-90 thai"
            style={active
              ? { borderColor: m.color, background: `color-mix(in srgb, ${m.color} 12%, transparent)`, color: m.color, fontWeight: 600 }
              : { borderColor: 'var(--border-soft)', background: 'var(--surface-2)', color: 'var(--muted)' }}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
