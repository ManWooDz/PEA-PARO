'use client'
import { Icon } from './Icon'
import { Dot } from './Dot'

const SOURCE_ICON = {
  line6:     Icon.Cable,
  battery7:  Icon.Battery,
  diesel8:   Icon.Engine,
  diesel9:   Icon.Engine,
  main_grid: Icon.Bolt,
}

const STATUS_COLOR = {
  ok:    '#10b981',
  warn:  '#f59e0b',
  idle:  '#64748b',
  fault: '#ef4444',
}
const STATUS_LABEL = {
  ok:    'ON-LINE',
  warn:  'WARN',
  idle:  'STANDBY',
  fault: 'FAULT',
}

export function SourceCard({ source }) {
  const I = SOURCE_ICON[source.id] || Icon.Bolt
  const sc = STATUS_COLOR[source.status] || '#64748b'
  const sl = STATUS_LABEL[source.status] || 'UNKNOWN'
  return (
    <div className="panel rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg grid place-items-center flex-shrink-0"
             style={{ background: 'rgba(99,102,241,0.08)', color: source.color }}>
          <I width="20" height="20" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{source.name}</div>
          <div className="text-[11px] text-muted truncate">{source.island}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <Dot color={sc} pulse={source.status === 'ok'} size={7} />
          <span className="text-[10px] mono tracking-wider" style={{ color: sc }}>{sl}</span>
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <div>
          <div className="text-2xl font-semibold mono tabular-nums" style={{ color: source.color }}>
            {typeof source.value === 'number' ? source.value.toLocaleString() : source.value}
          </div>
          <div className="text-[11px] text-muted mono">{source.unit || ''}</div>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] uppercase eyebrow text-muted">Updated</div>
          <div className="text-xs mono" style={{ color: 'var(--text)' }}>{source.updated}</div>
        </div>
      </div>
    </div>
  )
}
