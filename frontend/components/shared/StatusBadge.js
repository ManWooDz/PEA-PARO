'use client'
const STATUS_MAP = {
  normal:     { c: '#10b981', t: 'OK',           th: 'ปกติ' },
  diesel:     { c: '#f59e0b', t: 'DIESEL ON',    th: 'เดินดีเซล' },
  'low-soc':  { c: '#ef4444', t: 'LOW SoC',      th: 'SoC ต่ำ' },
  'grid-high':{ c: '#a855f7', t: 'GRID HIGH',    th: 'Grid สูง' },
  'line6-near':{ c: '#f97316',t: 'LINE6 NEAR',   th: 'Line 6 เต็ม' },
}

export function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.normal
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
          style={{ background: s.c + '20', color: s.c, border: `1px solid ${s.c}44` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.c }} />
      <span className="thai">{s.th}</span>
      <span className="mono">· {s.t}</span>
    </span>
  )
}

export function LevelBadge({ level }) {
  const map = {
    high:     { c: '#ef4444', label: 'เสี่ยงสูง',     en: 'HIGH' },
    medium:   { c: '#f59e0b', label: 'เฝ้าระวัง',    en: 'WATCH' },
    low:      { c: 'var(--primary)', label: 'ข้อมูล',        en: 'INFO' },
    resolved: { c: '#10b981', label: 'แก้ไขแล้ว',    en: 'RESOLVED' },
  }
  const s = map[level] || map.low
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: s.c + '20', color: s.c, border: `1px solid ${s.c}44` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.c }} />
      <span className="thai">{s.label}</span>
      <span className="mono opacity-70">· {s.en}</span>
    </span>
  )
}
