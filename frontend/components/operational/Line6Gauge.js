'use client'
import { useState, useEffect, useRef } from 'react'

const LIMIT = 8           // MW redline
const RADIUS = 60
const CENTER_X = 75
const CENTER_Y = 80       // arc bottom-center

// Convert MW value (0..LIMIT) into a needle angle in degrees
// -180 = left (0 MW), 0 = right (LIMIT)
function mwToAngle(mw) {
  const clamped = Math.min(LIMIT, Math.max(0, mw))
  return -180 + (clamped / LIMIT) * 180
}

// SVG arc path generator for start/end angles (degrees) — sweep clockwise
function arcPath(startDeg, endDeg) {
  const s = (Math.PI / 180) * startDeg
  const e = (Math.PI / 180) * endDeg
  const x1 = CENTER_X + RADIUS * Math.cos(s)
  const y1 = CENTER_Y + RADIUS * Math.sin(s)
  const x2 = CENTER_X + RADIUS * Math.cos(e)
  const y2 = CENTER_Y + RADIUS * Math.sin(e)
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2}`
}

export function Line6Gauge({ rt, onAssetClick }) {
  const flow_mw = rt?.lines?.find(l => l.id === 6)?.flow_mw ?? 0
  const util_pct = rt?.kpi?.line6_util_pct ?? 0
  const needleAngle = mwToAngle(flow_mw)

  // 30-min sparkline buffer (12 samples)
  const histRef = useRef([])
  useEffect(() => {
    histRef.current = [...histRef.current.slice(-11), flow_mw]
  }, [flow_mw])
  const hist = histRef.current

  const isCritical = flow_mw >= LIMIT * 0.94
  const glow = isCritical ? 'drop-shadow(0 0 6px #ef4444)' : 'none'

  // For redline tick — at the rightmost edge of the arc (angle = 0)
  const tickInnerX = CENTER_X + (RADIUS - 6)
  const tickOuterX = CENTER_X + (RADIUS + 6)

  return (
    <button
      onClick={() => onAssetClick?.('line_6')}
      className="flex flex-col items-center justify-between min-w-0 hover:opacity-90 cursor-pointer"
    >
      <div className="text-[10px] uppercase eyebrow text-muted">Line 6 Capacity</div>

      <svg viewBox="0 0 150 100" className="w-full max-w-[160px]" style={{ filter: glow }}>
        {/* Color-zoned arc background (3 segments split at 6 MW and 7.5 MW) */}
        <path d={arcPath(-180, mwToAngle(6))}            stroke="#10b981" strokeWidth={9} fill="none" strokeLinecap="butt" />
        <path d={arcPath(mwToAngle(6),  mwToAngle(7.5))} stroke="#f59e0b" strokeWidth={9} fill="none" strokeLinecap="butt" />
        <path d={arcPath(mwToAngle(7.5), 0)}             stroke="#ef4444" strokeWidth={9} fill="none" strokeLinecap="butt" />

        {/* Redline tick at exactly 8 MW (rightmost edge) */}
        <line x1={tickInnerX} y1={CENTER_Y} x2={tickOuterX} y2={CENTER_Y}
              stroke="#ef4444" strokeWidth={2} />

        {/* Needle — rotate around center */}
        <g style={{
          transform: `rotate(${needleAngle + 90}deg)`,
          transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
          transition: 'transform 800ms ease-out'
        }}>
          <line x1={CENTER_X} y1={CENTER_Y} x2={CENTER_X} y2={CENTER_Y - RADIUS + 8}
                stroke="var(--text)" strokeWidth={2} strokeLinecap="round" />
          <circle cx={CENTER_X} cy={CENTER_Y} r={3.5} fill="var(--text)" />
        </g>

        {/* Center label */}
        <text x={CENTER_X} y={CENTER_Y + 18} textAnchor="middle" fontSize={14} fontWeight="700" fill="var(--text)">
          {flow_mw.toFixed(1)} MW
        </text>
      </svg>

      <div className="text-[10px] text-muted mono">
        of {LIMIT} MW · {util_pct.toFixed(0)} %
      </div>

      {/* 30-min sparkline */}
      <svg viewBox="0 0 100 14" className="w-full max-w-[160px] mt-1" preserveAspectRatio="none">
        {hist.length >= 2 && (
          <polyline
            points={hist.map((v, i) => `${(i / (hist.length - 1)) * 100},${14 - (v / LIMIT) * 14}`).join(' ')}
            fill="none"
            stroke={isCritical ? '#ef4444' : 'var(--primary)'}
            strokeWidth={1}
          />
        )}
      </svg>
    </button>
  )
}
