'use client'
import { Icon } from '@/components/shared/Icon'

const TABS = [
  { id: 'liveops',  th: 'ภาพรวมระบบ',    en: 'Live Operations',   icon: Icon.Gauge },
  { id: 'dispatch', th: 'แผนการจ่ายไฟ',  en: 'Dispatch Schedule', icon: Icon.Calendar },
  { id: 'forecast', th: 'พยากรณ์',       en: 'Forecast',          icon: Icon.ChartBar },
  { id: 'alerts',   th: 'เตือนภัย',       en: 'Early Warning',     icon: Icon.Bell },
]

export function TabBar({ active, setActive, alertCount }) {
  return (
    <nav className="border-b hairline px-6 flex items-center gap-1 tabbar sticky top-16 z-30">
      {TABS.map(t => {
        const isActive = active === t.id
        const I = t.icon
        return (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`relative px-4 h-12 flex items-center gap-2 text-sm transition-colors border-b-2 -mb-px cursor-pointer ${
              isActive ? 'text-default' : 'text-muted hover:opacity-80 border-transparent'
            }`}
            style={isActive ? { borderColor: 'var(--primary)' } : {}}>
            <I width="16" height="16" />
            <div className="flex items-baseline gap-1.5">
              <span className="thai font-medium">{t.th}</span>
              <span className="text-[10.5px] uppercase eyebrow text-muted hidden md:inline">{t.en}</span>
            </div>
            {t.id === 'alerts' && alertCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold"
                    style={{ background: '#ef4444', color: '#fff' }}>{alertCount}</span>
            )}
          </button>
        )
      })}
      <div className="ml-auto flex items-center gap-2 text-xs text-muted">
        <Icon.Refresh width="14" height="14" />
        <span className="mono hidden sm:inline">Auto-refresh 3s</span>
      </div>
    </nav>
  )
}
