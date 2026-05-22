'use client'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { KPICard }      from '@/components/shared/KPICard'
import { SourceCard }   from '@/components/shared/SourceCard'
import { GridTopology } from '@/components/shared/GridTopology'
import { StatusBadge }  from '@/components/shared/StatusBadge'
import { Dot }          from '@/components/shared/Dot'
import { Icon }         from '@/components/shared/Icon'

/* ── tiny helpers ── */
const fmt1 = v => (v == null ? '—' : Number(v).toFixed(1))
const fmtPct = v => (v == null ? '—' : `${Number(v).toFixed(0)}%`)

/* ── custom recharts tooltip ── */
function ChartTip({ active, payload, label }) {
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

function MixTip({ active, payload, label }) {
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

/* ── section wrapper ── */
function Section({ title, children }) {
  return (
    <section>
      <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">{title}</div>
      {children}
    </section>
  )
}

export function Tab1Dashboard({ rt, history, energyMix, delta }) {
  if (!rt) {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm gap-2">
        <Dot color="#d040b8" pulse />
        <span>กำลังโหลดข้อมูล…</span>
      </div>
    )
  }

  const { kpi, sources, lines, status } = rt

  /* history chart data */
  const loadData = history?.points?.map(p => ({
    t:    p.hour != null ? `${String(p.hour).padStart(2,'0')}:00` : p.ts?.slice(11,16) ?? '',
    load: +(p.load_mw?.toFixed(2) ?? 0),
  })) ?? []

  /* energy mix chart data */
  const mixData = energyMix?.points?.map(p => ({
    t:        p.ts?.slice(11,16) ?? '',
    Grid:     +(p.grid_mw?.toFixed(2)    ?? 0),
    Battery:  +(p.battery_mw?.toFixed(2) ?? 0),
    'Diesel A': +(p.diesel_a_mw?.toFixed(2) ?? 0),
    'Diesel C': +(p.diesel_c_mw?.toFixed(2) ?? 0),
  })) ?? []

  return (
    <div className="space-y-6">

      {/* ── KPI row ── */}
      <Section title="ภาพรวมระบบ · System Overview">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard
            label="Island C Load"
            value={fmt1(kpi?.island_c_load_mw)}
            unit="MW"
            sub={`Line 6 cap: 8 MW`}
            delta={delta}
            icon={Icon.Gauge}
            accent="#d040b8"
            showBar
          />
          <KPICard
            label="Battery SoC"
            value={fmtPct(kpi?.battery_soc_pct)}
            unit=""
            sub={`${fmt1(kpi?.battery_soc_mwh)} MWh`}
            icon={Icon.Battery}
            accent="#10b981"
            showBar
          />
          <KPICard
            label="Line 6 Utilisation"
            value={fmtPct(kpi?.line6_util_pct)}
            unit=""
            sub="8 MW limit"
            icon={Icon.Cable}
            accent={kpi?.line6_util_pct > 90 ? '#ef4444' : kpi?.line6_util_pct > 75 ? '#f59e0b' : '#d040b8'}
            showBar
          />
          <KPICard
            label="System Status"
            value=""
            unit=""
            sub=""
            icon={Icon.Bolt}
            accent="#d040b8"
          >
            <StatusBadge status={status} />
          </KPICard>
        </div>
      </Section>

      {/* ── Sources row ── */}
      <Section title="แหล่งพลังงาน · Energy Sources">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {sources?.map(s => <SourceCard key={s.id} source={s} />)}
        </div>
      </Section>

      {/* ── Load history chart ── */}
      <Section title="โหลดย้อนหลัง · Load History (24 h)">
        <div className="panel rounded-xl p-4">
          {loadData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={loadData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#d040b8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#d040b8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} unit=" MW" />
                <Tooltip content={<ChartTip />} />
                <Area
                  type="monotone" dataKey="load" name="Island C Load"
                  stroke="#d040b8" strokeWidth={2}
                  fill="url(#loadGrad)" dot={false} activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-muted text-sm">No data</div>
          )}
        </div>
      </Section>

      {/* ── Energy mix chart ── */}
      <Section title="สัดส่วนพลังงาน · Energy Mix (recent)">
        <div className="panel rounded-xl p-4">
          {mixData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={mixData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }} stackOffset="none">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} unit=" MW" />
                <Tooltip content={<MixTip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />
                <Bar dataKey="Grid"      stackId="a" fill="#d040b8" radius={[0,0,0,0]} />
                <Bar dataKey="Battery"   stackId="a" fill="#10b981" radius={[0,0,0,0]} />
                <Bar dataKey="Diesel A"  stackId="a" fill="#f59e0b" radius={[0,0,0,0]} />
                <Bar dataKey="Diesel C"  stackId="a" fill="#ef4444" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-muted text-sm">No data</div>
          )}
        </div>
      </Section>

      {/* ── Grid topology ── */}
      <Section title="โทโพโลยีระบบ · Grid Topology">
        <GridTopology lines={lines} />
      </Section>

    </div>
  )
}
