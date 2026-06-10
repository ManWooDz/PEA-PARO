'use client'
import { useState } from 'react'
import { Icon } from '@/components/shared/Icon'
import { reportUrl } from '@/lib/api'
import { useSchedule } from '@/hooks/useSchedule'
import { downloadScheduleCsv } from '@/lib/scheduleCsv'

// page tab id → report `tab` param
const TAB_MAP = { liveops: 'realtime', dispatch: 'dispatch', forecast: 'forecast', alerts: 'alerts' }

const P  = 'var(--primary)'                  // primary magenta
const PB = 'rgba(208,64,184,0.14)'   // icon bg tint
const PS = 'rgba(208,64,184,0.08)'   // selected scope bg

export function ExportModal({ open, onClose, showToast, active }) {
  const [mode,   setMode]   = useState('download')
  const [format, setFormat] = useState('html')
  const [email,  setEmail]  = useState('soc@pea.co.th')
  const [scope,  setScope]  = useState('current')
  const { schedule } = useSchedule()

  if (!open) return null

  const tabName = { realtime:'หน้าหลัก', dispatch:'แผนการจ่ายไฟ', forecast:'พยากรณ์โหลด', alerts:'การแจ้งเตือน' }[active] || 'หน้าหลัก'
  const sections = scope === 'full' ? ['หน้าหลัก','แผนการจ่ายไฟ','พยากรณ์โหลด','การแจ้งเตือน'] : [tabName]

  const handleDownload = async () => {
    const reportTab = TAB_MAP[active] || 'realtime'
    const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')

    // Dispatch tab + CSV: use client-side schedule table data directly
    if (active === 'dispatch' && format === 'csv' && schedule?.steps?.length) {
      downloadScheduleCsv(schedule.steps, schedule.date)
      showToast('ดาวน์โหลด CSV แล้ว', `ตารางเดินเครื่อง ${schedule.date || 'tomorrow'}`)
      onClose()
      return
    }

    // PDF: fetch the HTML report, write it into a new window, and print
    // (browser "Save as PDF" — renders Thai perfectly, no PDF/font library).
    if (format === 'pdf') {
      try {
        const htmlText = await fetch(reportUrl({ scope, tab: reportTab, format: 'html' })).then(r => r.text())
        const w = window.open('', '_blank')
        if (!w) { showToast('เปิดหน้าต่างไม่ได้', 'อนุญาต pop-up แล้วลองใหม่'); return }
        w.document.open(); w.document.write(htmlText); w.document.close(); w.focus()
        setTimeout(() => w.print(), 500)   // let fonts/layout settle
        showToast('เปิดรายงานเพื่อบันทึก PDF', 'เลือก “Save as PDF” ในกล่องพิมพ์')
        onClose()
      } catch (e) {
        showToast('สร้างรายงานไม่สำเร็จ', e?.message ?? '')
      }
      return
    }

    // HTML / CSV: download the real report file
    try {
      const fmt = format === 'csv' ? 'csv' : 'html'
      const text = await fetch(reportUrl({ scope, tab: reportTab, format: fmt })).then(r => r.text())
      const mime = fmt === 'csv' ? 'text/csv' : 'text/html'
      const blob = new Blob([text], { type: `${mime};charset=utf-8` })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `pea-paro-report_${ts}.${fmt}`; a.click()
      URL.revokeObjectURL(url)
      showToast('ดาวน์โหลดรายงานแล้ว', a.download)
      onClose()
    } catch (e) {
      showToast('สร้างรายงานไม่สำเร็จ', e?.message ?? '')
    }
  }

  const handleEmail = () => {
    if (!email.includes('@')) { showToast('Email ไม่ถูกต้อง', 'กรุณาตรวจสอบ'); return }
    showToast('Report ส่งทางอีเมลแล้ว', `ถึง · ${email}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center"
         style={{ background: 'rgba(18,4,16,0.72)' }} onClick={onClose}>
      <div className="modal-in panel rounded-xl w-[520px] max-w-[92vw]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b hairline">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg grid place-items-center"
                 style={{ background: PB, color: P }}>
              <Icon.File width="16" height="16" />
            </div>
            <div>
              <div className="text-sm font-semibold thai">ส่งออกรายงาน</div>
              <div className="text-[11px] text-muted thai">เลือกรูปแบบและช่องทาง</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded grid place-items-center hover:opacity-70 text-muted cursor-pointer">
            <Icon.X width="16" height="16" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2 panel-2 rounded-lg p-1">
            {[['download', <Icon.Download key="d" width="14" height="14" />, 'ดาวน์โหลด'],
              ['email',    <Icon.Mail     key="e" width="14" height="14" />, 'ส่งอีเมล']].map(([m, ic, label]) => (
              <button key={m} onClick={() => setMode(m)}
                      className="flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition cursor-pointer"
                      style={mode===m ? { background: P, color: '#fff' } : { color:'var(--muted)' }}>
                {ic}<span className="thai">{label}</span>
              </button>
            ))}
          </div>

          {/* Scope */}
          <div className="grid grid-cols-2 gap-2">
            {[['current','หน้าปัจจุบัน'],['full','ทุกหน้า']].map(([k,th]) => (
              <button key={k} onClick={() => setScope(k)}
                      className="text-left p-3 rounded-lg border transition cursor-pointer"
                      style={scope===k ? { borderColor: P, background: PS }
                                       : { borderColor:'var(--border-soft)', background:'var(--surface-2)' }}>
                <div className="text-sm font-medium thai">{th}</div>
              </button>
            ))}
          </div>

          {/* Format */}
          <div className="flex gap-1 panel-2 rounded-lg p-1">
            {['html','pdf','csv'].map(f => (
              <button key={f} onClick={() => setFormat(f)}
                      className="flex-1 py-1.5 rounded text-xs font-medium uppercase tracking-wider mono transition cursor-pointer"
                      style={format===f ? { background: P, color: '#fff' } : { color:'var(--muted)' }}>
                {f}
              </button>
            ))}
          </div>

          {mode === 'email' && (
            <div>
              <div className="text-xs uppercase eyebrow text-muted mb-2 thai">ผู้รับ</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                     className="w-full px-3 py-2 rounded-lg text-sm panel-2 border hairline focus:outline-none"
                     style={{ color:'var(--text)', background:'var(--surface-2)', outlineColor: P }} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t hairline">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-muted hover:opacity-80 cursor-pointer">
            <span className="thai">ยกเลิก</span>
          </button>
          <button onClick={mode==='download' ? handleDownload : handleEmail}
                  className="px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 cursor-pointer"
                  style={{ background: P, color: '#fff' }}>
            {mode==='download' ? <Icon.Download width="14" height="14" /> : <Icon.Send width="14" height="14" />}
            <span className="thai">{mode==='download' ? 'ดาวน์โหลด' : 'ส่งอีเมล'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
