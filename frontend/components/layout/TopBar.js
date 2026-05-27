'use client'
import { useState, useEffect } from 'react'
import { Icon } from '@/components/shared/Icon'

function formatDateTime(d) {
  const dd = String(d.getDate()).padStart(2,'0')
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const yy = d.getFullYear() + 543
  const hh = String(d.getHours()).padStart(2,'0')
  const mi = String(d.getMinutes()).padStart(2,'0')
  const ss = String(d.getSeconds()).padStart(2,'0')
  return { date: `${dd}/${mm}/${yy}`, time: `${hh}:${mi}:${ss}` }
}

export function TopBar({ theme, setTheme, onExport, lastUpdated = null }) {
  const [now, setNow] = useState(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const { date, time } = now ? formatDateTime(now) : { date: '—', time: '--:--:--' }
  const isStale = lastUpdated && now && ((now.getTime() - new Date(lastUpdated).getTime()) > 10000)
  return (
    <header className="border-b hairline topbar sticky top-0 z-40">
      <div className="px-6 h-16 flex items-center justify-between">
        {/* Left: logo only */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 bg-gradient"
               style={{ color: 'white' }}>
            <Icon.Bolt width="20" height="20" />
          </div>
          <div>
            <div className="text-[15px] font-semibold leading-tight">PEA-PARO</div>
            <div className="text-xs uppercase eyebrow text-muted leading-tight thai">ระบบบริหารจัดการพลังงาน · กฟภ.</div>
          </div>
        </div>

        {/* Right: clock + controls + user */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="text-xs uppercase eyebrow text-muted thai">เวลาเซิร์ฟเวอร์</div>
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-semibold mono">{time}</span>
                <span className="text-xs text-muted thai">{date}</span>
              </div>
            </div>
            {isStale && (
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b' }} title="Data stale (>10s)" />
            )}
          </div>

          <div className="flex items-center gap-2 ml-2 pl-3 border-l hairline">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              className="w-9 h-9 rounded-lg grid place-items-center panel-2 hover:opacity-80 transition border hairline cursor-pointer">
              {theme === 'dark' ? <Icon.Sun width="16" height="16" /> : <Icon.Moon width="16" height="16" />}
            </button>
            <button
              onClick={onExport}
              className="h-9 px-3 rounded-lg inline-flex items-center gap-2 text-sm font-medium border hairline hover:opacity-80 transition panel-2 cursor-pointer">
              <Icon.File width="15" height="15" />
              <div className="flex items-baseline gap-1.5">
                <span className="thai text-sm">รายงาน</span>
              </div>
            </button>
          </div>

          {/* User identity — back on the right, but text now sits tight next
              to the icon (left-aligned) instead of floating away with text-right. */}
          <div className="flex items-center gap-2 pl-3 border-l hairline">
            <div className="w-8 h-8 rounded-full grid place-items-center panel-2 border hairline">
              <Icon.User width="16" height="16" />
            </div>
            <div className="leading-tight hidden md:block">
              <div className="text-xs font-medium">User123</div>
              <div className="text-xs text-muted thai">วิศวกร · กฟภ. สุราษฎร์ธานี</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
