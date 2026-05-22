'use client'
import { useState } from 'react'
import { Icon }        from '@/components/shared/Icon'
import { LevelBadge }  from '@/components/shared/StatusBadge'
import { Dot }         from '@/components/shared/Dot'

const LEVEL_ORDER = { high: 0, medium: 1, low: 2, resolved: 3 }

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  return `${Math.floor(diff/3600)}h ago`
}

const SOURCE_LABEL = {
  line6:    'สาย Line 6',
  battery7: 'Battery #7',
  diesel8:  'Diesel #8 (Island A)',
  diesel9:  'Diesel #9 (Island C)',
  system:   'ระบบ',
}

function AlertCard({ alert, onResolve }) {
  const [note, setNote]     = useState('')
  const [open, setOpen]     = useState(false)

  const isResolved = alert.status === 'resolved'
  const levelColor = { high: '#ef4444', medium: '#f59e0b', low: '#d040b8', resolved: '#64748b' }[alert.level] ?? '#64748b'

  return (
    <div className="panel rounded-xl overflow-hidden transition"
         style={{ borderLeft: `3px solid ${levelColor}` }}>
      <div className="p-4 flex items-start gap-3">
        {/* level dot */}
        <div className="mt-0.5 flex-shrink-0">
          <Dot color={levelColor} pulse={!isResolved && alert.level === 'high'} />
        </div>

        {/* content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <LevelBadge level={alert.level} />
              <span className="text-[10px] text-muted eyebrow uppercase">
                {SOURCE_LABEL[alert.source] ?? alert.source}
              </span>
            </div>
            <span className="text-[10px] text-muted mono flex-shrink-0">{timeAgo(alert.ts)}</span>
          </div>

          <div className="mt-1.5 text-sm font-medium leading-snug">{alert.message}</div>

          {alert.detail && (
            <div className="mt-1 text-xs text-muted thai">{alert.detail}</div>
          )}

          {alert.value != null && (
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className="text-muted">ค่าปัจจุบัน:</span>
              <span className="mono font-semibold" style={{ color: levelColor }}>
                {typeof alert.value === 'number' ? alert.value.toFixed(1) : alert.value}
                {alert.unit ? ` ${alert.unit}` : ''}
              </span>
              {alert.threshold != null && (
                <>
                  <span className="text-muted">/</span>
                  <span className="mono text-muted">threshold {alert.threshold}{alert.unit ?? ''}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* actions */}
        {!isResolved && (
          <button
            onClick={() => setOpen(v => !v)}
            className="flex-shrink-0 px-2 py-1 rounded text-xs border cursor-pointer transition"
            style={{ borderColor: 'var(--border-soft)', color: 'var(--muted)' }}>
            {open ? 'ยกเลิก' : 'แก้ไข'}
          </button>
        )}
      </div>

      {/* resolve panel */}
      {open && !isResolved && (
        <div className="px-4 pb-4 pt-0 border-t hairline flex items-center gap-2">
          <input
            type="text" placeholder="หมายเหตุการแก้ไข (optional)"
            value={note} onChange={e => setNote(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded text-xs panel-2 border hairline"
            style={{ color: 'var(--text)', background: 'var(--surface-2)' }}
          />
          <button
            onClick={() => { onResolve(alert.id, note); setOpen(false) }}
            className="px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 cursor-pointer"
            style={{ background: '#10b981', color: '#0b1428' }}>
            <Icon.Check width="12" height="12" />
            <span>Resolve</span>
          </button>
        </div>
      )}

      {isResolved && alert.resolved_note && (
        <div className="px-4 pb-3 text-xs text-muted thai border-t hairline pt-2">
          หมายเหตุ: {alert.resolved_note}
        </div>
      )}
    </div>
  )
}

export function Tab4Alerts({ activeAlerts, resolvedAlerts, resolve, loading }) {
  const [showResolved, setShowResolved] = useState(false)

  const sorted = [...activeAlerts].sort((a, b) =>
    (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9))

  const highCount   = activeAlerts.filter(a => a.level === 'high').length
  const mediumCount = activeAlerts.filter(a => a.level === 'medium').length

  return (
    <div className="space-y-6">

      {/* ── summary row ── */}
      <section>
        <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">สรุป · Summary</div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'High',     count: highCount,          color: '#ef4444' },
            { label: 'Medium',   count: mediumCount,         color: '#f59e0b' },
            { label: 'Resolved', count: resolvedAlerts.length, color: '#10b981' },
          ].map(({ label, count, color }) => (
            <div key={label} className="panel rounded-xl p-4 text-center">
              <div className="text-2xl font-bold mono" style={{ color }}>{count}</div>
              <div className="text-xs text-muted mt-0.5 eyebrow uppercase">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── active alerts ── */}
      <section>
        <div className="text-[10.5px] uppercase eyebrow text-muted mb-3 flex items-center gap-2">
          <span>การแจ้งเตือนที่ใช้งานอยู่ · Active Alerts</span>
          {sorted.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold"
                  style={{ background: '#ef4444', color: '#fff' }}>{sorted.length}</span>
          )}
        </div>

        {loading && !sorted.length ? (
          <div className="flex items-center justify-center h-32 text-muted text-sm gap-2">
            <Dot color="#d040b8" pulse /> <span>กำลังโหลด…</span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="panel rounded-xl p-8 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full grid place-items-center"
                 style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
              <Icon.Check width="24" height="24" />
            </div>
            <div className="text-sm font-medium thai">ไม่มีการแจ้งเตือนที่ใช้งานอยู่</div>
            <div className="text-xs text-muted">ระบบทำงานปกติ · All systems nominal</div>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map(a => (
              <AlertCard key={a.id} alert={a} onResolve={resolve} />
            ))}
          </div>
        )}
      </section>

      {/* ── resolved alerts ── */}
      {resolvedAlerts.length > 0 && (
        <section>
          <button
            onClick={() => setShowResolved(v => !v)}
            className="w-full flex items-center justify-between text-[10.5px] uppercase eyebrow text-muted mb-3 cursor-pointer hover:opacity-80">
            <span>ที่แก้ไขแล้ว · Resolved ({resolvedAlerts.length})</span>
            <Icon.ChartBar width="12" height="12"
                           style={{ transform: showResolved ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {showResolved && (
            <div className="space-y-3">
              {resolvedAlerts.map(a => (
                <AlertCard key={a.id} alert={a} onResolve={resolve} />
              ))}
            </div>
          )}
        </section>
      )}

    </div>
  )
}
