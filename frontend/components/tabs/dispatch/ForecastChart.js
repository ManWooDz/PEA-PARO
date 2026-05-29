'use client'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend,
} from 'recharts'

const LINE6_CAP_MW = 8.0

// "2025-12-28T15:15:00" → "28/12/2568 15:15" (วัน/เดือน/ปี พ.ศ. + เวลา 24 ชม.)
function fmtFullDate(iso) {
  const s = String(iso)
  const [date, time] = s.split('T')
  if (!date || !time) return s
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${Number(y) + 543} ${time.slice(0, 5)}`
}

export function ForecastChart({ points = [], height = 240 }) {
  const data = points.map(p => ({
    t: String(p.datetime).slice(5, 16).replace('T', ' '),
    dt: String(p.datetime),
    actual: p.actual,
    forecast: p.predicted_safe ?? p.predicted,
  }))
  return (
    <div className="panel rounded-xl p-4">
      {data.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-muted text-sm thai">
          ไม่มีข้อมูลพยากรณ์
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
            <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--muted)' }}
                   tickLine={false} minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }}
                   tickLine={false} axisLine={false} unit=" MW" />
            <Tooltip
              contentStyle={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
              labelFormatter={(label, payload) => fmtFullDate(payload?.[0]?.payload?.dt ?? label)}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={LINE6_CAP_MW} stroke="#ef4444" strokeDasharray="4 2"
              label={{ value: 'Line 6 Cap', position: 'right', fontSize: 9, fill: '#ef4444' }} />
            <Line type="monotone" dataKey="actual" name="จริง (actual)"
                  stroke="#0ea5e9" dot={false} strokeWidth={1.5} connectNulls />
            <Line type="monotone" dataKey="forecast" name="พยากรณ์ (LSTM+Margin)"
                  stroke="#f59e0b" dot={false} strokeWidth={1.5} strokeDasharray="5 3" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
