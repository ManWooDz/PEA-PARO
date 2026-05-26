'use client'
import { useState } from 'react'

const LEVEL_COLOR = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
}

export function RecommendedActionPanel({ alert }) {
  const [issuing, setIssuing] = useState(false)
  const [issued,  setIssued]  = useState(false)

  if (!alert) {
    return (
      <div className="panel rounded-xl p-4 text-sm text-muted">
        Select an active alert from the list to see the recommended action.
      </div>
    )
  }

  const color = LEVEL_COLOR[alert.level] ?? 'var(--text)'
  const action = alert.recommended_action ?? 'No recommended action available.'

  const handleIssue = async () => {
    setIssuing(true)
    // Mock: no real endpoint — simulate a brief network call
    await new Promise(r => setTimeout(r, 800))
    setIssuing(false)
    setIssued(true)
    setTimeout(() => setIssued(false), 4000)
  }

  return (
    <div className="panel rounded-xl p-4 space-y-3">
      <div className="text-[10px] uppercase eyebrow text-muted">Recommended Action</div>

      <div className="text-xs mono text-muted">{alert.time}</div>
      <div className="text-sm font-semibold" style={{ color }}>
        {alert.level.toUpperCase()} · {alert.title}
      </div>

      <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--surface-2)' }}>
        {action}
      </div>

      {alert.forecast_peak_mw != null && (
        <div className="text-[11px] text-muted">
          Forecast peak: <span className="mono font-medium" style={{ color: 'var(--text)' }}>{alert.forecast_peak_mw.toFixed(1)} MW</span>
          {alert.battery_soc_pct != null && (
            <> · BESS at peak: <span className="mono font-medium" style={{ color: 'var(--text)' }}>{alert.battery_soc_pct.toFixed(0)} %</span></>
          )}
        </div>
      )}

      <button
        onClick={handleIssue}
        disabled={issuing || issued}
        className="w-full px-4 py-2 rounded text-sm font-semibold cursor-pointer transition hover:opacity-90 disabled:opacity-60"
        style={{ background: issued ? '#10b981' : color, color: '#fff' }}
      >
        {issued ? '✓ Command Issued' : issuing ? 'Issuing…' : '⚡ Issue Command'}
      </button>
    </div>
  )
}
