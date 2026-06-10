'use client'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faWalkieTalkie, faDesktop } from '@fortawesome/free-solid-svg-icons'

const SEV = {
  critical: { color: '#ef4444', label: 'ด่วน' },
  warn:     { color: '#f59e0b', label: 'เฝ้าระวัง' },
  info:     { color: '#10b981', label: 'ตามแผน' },
}

function RecCard({ r }) {
  const sev = SEV[r.severity] ?? SEV.info
  const isRadio = r.control_type === 'radio'
  return (
    <div
      className="rounded-lg p-3"
      style={{ borderLeft: `3px solid ${sev.color}`, background: `${sev.color}10` }}
    >
      <div className="flex items-center justify-between">
        <span className="mono text-xs text-muted">
          {isRadio ? <FontAwesomeIcon icon={faWalkieTalkie} className="mr-1" /> : <FontAwesomeIcon icon={faDesktop} className="mr-1" />} ลงมือ {r.act_time} → มีผล {r.effect_time}
        </span>
        <span
          className="px-1.5 py-0.5 rounded text-[10px] uppercase eyebrow"
          style={{ background: `${sev.color}22`, color: sev.color }}
        >
          {sev.label}
        </span>
      </div>
      <div className="text-sm font-semibold mt-1 thai">
        {r.device} · {r.action}
      </div>
      <div className="text-xs text-muted mt-0.5 thai">{r.reason}</div>
      <div className="text-xs mt-0.5 thai" style={{ color: sev.color }}>{r.impact}</div>
    </div>
  )
}

export function ActionTimeline({ recommendations = [] }) {
  if (!recommendations.length) {
    return (
      <div className="panel rounded-xl p-6 text-center text-sm text-muted thai">
        <FontAwesomeIcon icon={faStar} className="mr-1" style={{color:'#10b981'}} /> ไม่มีคำสั่งในช่วงนี้ — เดินตามแผนปกติ
      </div>
    )
  }
  // group by day
  const byDay = {}
  recommendations.forEach(r => { (byDay[r.day ?? 0] ||= []).push(r) })

  return (
    <div className="space-y-4">
      {Object.keys(byDay).map(day => (
        <div key={day}>
          {Object.keys(byDay).length > 1 && (
            <div className="text-xs uppercase eyebrow text-muted mb-2 thai">
              วันที่ {Number(day) + 1}
            </div>
          )}
          <div className="space-y-2">
            {byDay[day].map((r, i) => <RecCard key={i} r={r} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
