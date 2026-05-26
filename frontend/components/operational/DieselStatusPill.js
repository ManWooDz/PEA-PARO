'use client'
import { useState, useEffect } from 'react'

const DOT = {
  running:  { color: '#10b981', label: 'Running'  },
  cooldown: { color: '#f59e0b', label: 'Cooldown' },
  standby:  { color: '#9ca3af', label: 'Standby'  },
  fault:    { color: '#ef4444', label: 'Fault'    },
}

function deriveState(unit) {
  if (unit.on)                          return 'running'
  if (unit.cooldown_remaining_min > 0)  return 'cooldown'
  return 'standby'   // 'fault' would require an explicit flag from the backend
}

export function DieselStatusPill({ unit }) {
  const initialState = deriveState(unit)
  const [tick, setTick] = useState(0)

  // Client-side cooldown countdown: tick once per second
  useEffect(() => {
    if (unit.cooldown_remaining_min <= 0) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [unit.cooldown_remaining_min, unit.unit_id])

  const elapsedSec = tick
  const remainingMin = Math.max(0, unit.cooldown_remaining_min - Math.floor(elapsedSec / 60))
  const state = remainingMin > 0 && !unit.on ? 'cooldown' : initialState
  const { color, label } = DOT[state]

  return (
    <span className="inline-flex items-center gap-1 text-[10px] mono">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span style={{ color }}>{label}</span>
      {state === 'cooldown' && (
        <span className="text-muted">({remainingMin}m left)</span>
      )}
    </span>
  )
}
