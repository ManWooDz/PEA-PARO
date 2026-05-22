'use client'
import { useState, useEffect } from 'react'
import { Icon } from '@/components/shared/Icon'
import { Dot }  from '@/components/shared/Dot'

function formatDateTime(d) {
  const dd = String(d.getDate()).padStart(2,'0')
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const yy = d.getFullYear() + 543
  const hh = String(d.getHours()).padStart(2,'0')
  const mi = String(d.getMinutes()).padStart(2,'0')
  const ss = String(d.getSeconds()).padStart(2,'0')
  return { date: `${dd}/${mm}/${yy}`, time: `${hh}:${mi}:${ss}` }
}

export function TopBar({ theme, setTheme, onExport }) {
  const [now, setNow] = useState(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const { date, time } = now ? formatDateTime(now) : { date: '—', time: '--:--:--' }
  return (
    <header className="border-b hairline topbar sticky top-0 z-40">
      <div className="px-6 h-16 flex items-center justify-between">
        {/* Left: logo + SCADA */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg,#740460 0%,#c7911b 100%)', color: 'white' }}>
              <Icon.Bolt width="20" height="20" />
            </div>
            <div>
              <div className="text-[15px] font-semibold leading-tight">PEA-PARO</div>
              <div className="text-[10.5px] uppercase eyebrow text-muted leading-tight">Island Energy Management · PEA</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 ml-4 pl-4 border-l hairline">
            <Dot color="#10b981" pulse />
            <span className="text-xs text-muted">SCADA · Online</span>
            <span className="text-xs text-muted mono ml-2">33kV / 50.0 Hz</span>
          </div>
        </div>

        {/* Right: clock + controls */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-[10.5px] uppercase eyebrow text-muted">Server Time</div>
            <div className="flex items-baseline gap-3">
              <span className="text-sm font-semibold mono">{time}</span>
              <span className="text-xs text-muted thai">{date} (พ.ศ.)</span>
            </div>
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
                <span className="thai">รายงาน</span>
                <span className="text-[10.5px] uppercase eyebrow text-muted hidden sm:inline">Report</span>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2 pl-3 border-l hairline">
            <div className="w-8 h-8 rounded-full grid place-items-center panel-2 border hairline">
              <Icon.User width="16" height="16" />
            </div>
            <div className="text-right hidden md:block">
              <div className="text-xs font-medium">Eng. Operator</div>
              <div className="text-[10.5px] text-muted thai">วิศวกร · PEA</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
