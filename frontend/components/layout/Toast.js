'use client'
import { Icon } from '@/components/shared/Icon'

export function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className="fixed top-20 right-6 z-50 toast-in">
      <div className="panel rounded-lg px-4 py-3 shadow-2xl flex items-center gap-3 min-w-[280px]"
           style={{ borderColor: '#10b981' }}>
        <div className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0"
             style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
          <Icon.Check width="18" height="18" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{toast.title}</div>
          {toast.subtitle && <div className="text-xs text-muted mt-0.5 thai">{toast.subtitle}</div>}
        </div>
      </div>
    </div>
  )
}
