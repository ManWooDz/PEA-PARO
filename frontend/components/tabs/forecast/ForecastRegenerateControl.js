'use client'
import { useState, useRef } from 'react'
import { regenerateForecast } from '@/lib/api'
import { useForecastCapabilities } from '@/hooks/useForecastCapabilities'

// File input + button that uploads a historical CSV and regenerates the Island-C
// forecast. Hidden unless the backend reports regenerate_available (graceful
// degrade on Vercel). On success it shows the metrics and calls onDone().
export function ForecastRegenerateControl({ onDone }) {
  const { available, loading: probing } = useForecastCapabilities()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)   // { ok, text }
  const inputRef = useRef(null)

  if (probing || !available) return null        // graceful degrade / still probing

  async function onSubmit() {
    if (!file || busy) return
    setBusy(true)
    setResult(null)
    try {
      const data = await regenerateForecast(file)
      setResult({ ok: true, text: data.message })
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onDone?.(data)
    } catch (e) {
      const detail = e?.response?.data?.detail || e.message || 'เกิดข้อผิดพลาด'
      setResult({ ok: false, text: detail })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel rounded-xl p-4 flex flex-col gap-3">
      <div className="text-[11px] uppercase eyebrow text-muted thai">
        อัปโหลด historical → สร้างพยากรณ์ใหม่ (Island C)
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs text-muted file:mr-2 file:rounded file:border file:border-[var(--border-soft)] file:bg-[var(--surface-2)] file:px-3 file:py-1 file:text-xs file:cursor-pointer"
        />
        <button
          onClick={onSubmit}
          disabled={!file || busy}
          className="px-4 py-1.5 rounded-lg text-sm border font-medium thai transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            borderColor: 'var(--primary)',
            background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
            color: 'var(--primary)',
          }}
        >
          {busy ? 'กำลังสร้าง…' : 'สร้างพยากรณ์ใหม่'}
        </button>
      </div>
      {busy && (
        <div className="text-xs text-muted thai">
          กำลังรันโมเดล LSTM ใหม่ อาจใช้เวลา 30–60 วินาที…
        </div>
      )}
      {result && (
        <div
          className="text-xs thai rounded-lg px-3 py-2"
          style={{
            background: result.ok ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
            color: result.ok ? '#10b981' : '#ef4444',
            border: `1px solid ${result.ok ? '#10b98140' : '#ef444440'}`,
          }}
        >
          {result.text}
        </div>
      )}
    </div>
  )
}
