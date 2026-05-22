'use client'
import { useState } from 'react'
import { Icon } from '@/components/shared/Icon'

const P  = 'var(--primary)'                  // primary magenta
const PB = 'rgba(208,64,184,0.14)'   // icon bg tint
const PS = 'rgba(208,64,184,0.08)'   // selected scope bg

export function ExportModal({ open, onClose, showToast, active }) {
  const [mode,   setMode]   = useState('download')
  const [format, setFormat] = useState('html')
  const [email,  setEmail]  = useState('soc@pea.co.th')
  const [scope,  setScope]  = useState('current')

  if (!open) return null

  const tabName = { realtime:'หน้าหลัก', dispatch:'แผนการจ่ายไฟ', forecast:'พยากรณ์โหลด', alerts:'การแจ้งเตือน' }[active] || 'หน้าหลัก'
  const sections = scope === 'full' ? ['หน้าหลัก','แผนการจ่ายไฟ','พยากรณ์โหลด','การแจ้งเตือน'] : [tabName]

  const handleDownload = () => {
    const ts = new Date().toISOString().slice(0,16).replace(/[T:]/g,'-')
    const filename = `pea-paro-report_${ts}.${format}`
    const body = `PEA-PARO · Operational Report\nGenerated: ${new Date().toLocaleString('th-TH')}\nSections: ${sections.join(', ')}\n`
    const blob = new Blob([body], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
    showToast('Report downloaded', filename)
    onClose()
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
              <div className="text-sm font-semibold">Export Report · ส่งออกรายงาน</div>
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
            {[['current','หน้าปัจจุบัน','Current view'],['full','ทุกหน้า','Full report']].map(([k,th,en]) => (
              <button key={k} onClick={() => setScope(k)}
                      className="text-left p-3 rounded-lg border transition cursor-pointer"
                      style={scope===k ? { borderColor: P, background: PS }
                                       : { borderColor:'var(--border-soft)', background:'var(--surface-2)' }}>
                <div className="text-sm font-medium thai">{th}</div>
                <div className="text-[11px] text-muted">{en}</div>
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
              <div className="text-[10.5px] uppercase eyebrow text-muted mb-2">Recipient · ผู้รับ</div>
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
