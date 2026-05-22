'use client'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, ErrorBar,
} from 'recharts'
import { Icon }   from '@/components/shared/Icon'
import { Dot }    from '@/components/shared/Dot'

const fmt1  = v => (v == null ? '—' : Number(v).toFixed(1))
const fmt0  = v => (v == null ? '—' : Number(v).toFixed(0))

const HORIZONS = [
  { h: 6,  label: '6h' },
  { h: 12, label: '12h' },
  { h: 24, label: '24h' },
  { h: 48, label: '48h' },
]

function ForecastTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="mono text-muted mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span style={{ color: p.color }}>●</span>
          <span className="text-muted">{p.name}</span>
          <span className="mono font-semibold">{fmt1(p.value)} MW</span>
        </div>
      ))}
    </div>
  )
}

function WeekTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-muted mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <span style={{ color: p.color }}>●</span>
            <span className="text-muted">{p.name}</span>
          </div>
          <span className="mono font-semibold">{fmt1(p.value)} MW</span>
        </div>
      ))}
    </div>
  )
}

/* peak risk badge */
function RiskBadge({ val, cap = 8 }) {
  const pct = val / cap * 100
  const color = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#10b981'
  const label = pct > 90 ? 'HIGH RISK' : pct > 75 ? 'MEDIUM' : 'OK'
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  )
}

export function Tab3Forecast({ short, week, hours, setHorizon, loading }) {
  /* short-term chart */
  const shortData = short?.points?.map(p => ({
    t:    p.ts?.slice(11, 16) ?? '',
    Load: +(p.load_mw?.toFixed(2) ?? 0),
    conf: [(p.load_mw - (p.conf_low ?? p.load_mw * 0.9)).toFixed(2),
           (( p.conf_high ?? p.load_mw * 1.1) - p.load_mw).toFixed(2)],
  })) ?? []

  /* 7-day chart */
  const weekData = week?.days?.map(d => ({
    day:  d.date?.slice(5) ?? '',    // MM-DD
    Peak: +(d.peak_mw?.toFixed(2)  ?? 0),
    Avg:  +(d.avg_mw?.toFixed(2)   ?? 0),
    Min:  +(d.min_mw?.toFixed(2)   ?? 0),
  })) ?? []

  /* highest upcoming load */
  const peakPoint = short?.points?.reduce((mx, p) =>
    (p.load_mw ?? 0) > (mx?.load_mw ?? 0) ? p : mx, null)

  return (
    <div className="space-y-6">

      {/* ── horizon selector ── */}
      <section>
        <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">ช่วงพยากรณ์ · Forecast Horizon</div>
        <div className="flex gap-2 flex-wrap">
          {HORIZONS.map(({ h, label }) => (
            <button key={h} onClick={() => setHorizon(h)}
                    className="px-4 py-1.5 rounded-lg text-sm border font-medium mono transition cursor-pointer"
                    style={hours === h
                      ? { borderColor: '#d040b8', background: 'rgba(208,64,184,0.1)', color: '#d040b8' }
                      : { borderColor: 'var(--border-soft)', background: 'var(--surface-2)', color: 'var(--muted)' }}>
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ── model info card ── */}
      {short?.model && (
        <section>
          <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">โมเดล · Model Info</div>
          <div className="panel rounded-xl p-4 flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-[10px] text-muted eyebrow uppercase mb-0.5">Model</div>
              <div className="font-semibold mono">{short.model.name ?? 'Hourly-Average'}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted eyebrow uppercase mb-0.5">MAE</div>
              <div className="font-semibold mono">{fmt1(short.model.mae_mw)} MW</div>
            </div>
            <div>
              <div className="text-[10px] text-muted eyebrow uppercase mb-0.5">RMSE</div>
              <div className="font-semibold mono">{fmt1(short.model.rmse_mw)} MW</div>
            </div>
            <div>
              <div className="text-[10px] text-muted eyebrow uppercase mb-0.5">Confidence</div>
              <div className="font-semibold mono">±{fmt1(short.model.conf_band_mw)} MW</div>
            </div>
            {peakPoint && (
              <div>
                <div className="text-[10px] text-muted eyebrow uppercase mb-0.5">Peak Forecast</div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold mono">{fmt1(peakPoint.load_mw)} MW</span>
                  <RiskBadge val={peakPoint.load_mw} />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── short-term area chart ── */}
      <section>
        <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">
          พยากรณ์โหลดระยะสั้น · Short-Term Load Forecast ({hours}h)
        </div>
        <div className="panel rounded-xl p-4">
          {loading && !shortData.length ? (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm gap-2">
              <Dot color="#d040b8" pulse /> <span>กำลังคำนวณ…</span>
            </div>
          ) : shortData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={shortData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#d040b8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#d040b8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} unit=" MW" />
                <Tooltip content={<ForecastTip />} />
                <ReferenceLine y={8} stroke="#ef4444" strokeDasharray="4 2"
                               label={{ value: 'Line 6 Cap 8MW', position: 'insideTopRight', fontSize: 9, fill: '#ef4444' }} />
                <Area
                  type="monotone" dataKey="Load" name="Forecast"
                  stroke="#d040b8" strokeWidth={2} strokeDasharray="6 3"
                  fill="url(#fcGrad)" dot={false} activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted text-sm">No forecast data</div>
          )}
        </div>
      </section>

      {/* ── hourly table ── */}
      {short?.points?.length > 0 && (
        <section>
          <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">ตารางรายชั่วโมง · Hourly Forecast</div>
          <div className="panel rounded-xl overflow-auto">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="border-b hairline">
                  {['Timestamp','Load (MW)','Conf Low','Conf High','Line 6 Risk'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-muted eyebrow uppercase font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {short.points.map((p, i) => {
                  const pct = (p.load_mw / 8) * 100
                  const color = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#10b981'
                  return (
                    <tr key={i} className="border-b hairline last:border-0">
                      <td className="px-3 py-2 mono text-muted">{p.ts?.slice(11,16) ?? '—'}</td>
                      <td className="px-3 py-2 mono font-semibold" style={{ color: '#d040b8' }}>{fmt1(p.load_mw)}</td>
                      <td className="px-3 py-2 mono text-muted">{fmt1(p.conf_low)}</td>
                      <td className="px-3 py-2 mono text-muted">{fmt1(p.conf_high)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-soft)' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.min(pct,100)}%`, background: color }} />
                          </div>
                          <span className="mono text-[10px]" style={{ color }}>{fmt0(pct)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 7-day bar chart ── */}
      <section>
        <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">พยากรณ์ 7 วัน · 7-Day Forecast</div>
        <div className="panel rounded-xl p-4">
          {weekData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} unit=" MW" />
                <Tooltip content={<WeekTip />} />
                <ReferenceLine y={8} stroke="#ef4444" strokeDasharray="4 2" />
                <Bar dataKey="Min"  fill="#334155" radius={[0,0,0,0]} name="Min" />
                <Bar dataKey="Avg"  fill="#d040b8" radius={[0,0,0,0]} name="Avg" />
                <Bar dataKey="Peak" fill="#f59e0b" radius={[2,2,0,0]} name="Peak" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted text-sm">No 7-day data</div>
          )}
        </div>
      </section>

    </div>
  )
}
