'use client'
import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { GridTopology }     from '@/components/shared/GridTopology'
import { AssetDetailCard }  from '@/components/operational/AssetDetailCard'
import { EventsLog }        from '@/components/operational/EventsLog'

const fmt1 = v => (v == null ? '—' : Number(v).toFixed(1))

function LoadTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="panel rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="mono text-muted mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span style={{ color: p.color }}>●</span>
          <span className="text-muted">{p.name}</span>
          <span className="mono">{fmt1(p.value)} MW</span>
        </div>
      ))}
    </div>
  )
}

export function Tab1LiveOps({ rt, history, focusedAssetId, onAssetClick }) {
  const [selected, setSelected] = useState(focusedAssetId ?? null)

  // Sync local selection with focusedAssetId prop (cross-tab navigation)
  useEffect(() => {
    if (focusedAssetId !== null && focusedAssetId !== undefined) {
      setSelected(focusedAssetId)
    }
  }, [focusedAssetId])

  const handleClick = (assetId) => {
    setSelected(assetId)
    onAssetClick?.(assetId)
  }

  const loadData = history?.points?.map(p => ({
    t:    p.hour != null ? `${String(p.hour).padStart(2,'0')}:00` : p.ts?.slice(11,16) ?? '',
    load: +(p.load_mw?.toFixed(2) ?? 0),
  })) ?? []

  return (
    <div className="space-y-4">
      {/* ── Grid topology centerpiece ── */}
      <section>
        <div className="text-[10.5px] uppercase eyebrow text-muted mb-2">Grid Topology · Live Power Flow</div>
        <GridTopology lines={rt?.lines ?? []} onAssetClick={handleClick} focusedAssetId={selected} />
      </section>

      {/* ── 3-column bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Events log */}
        <EventsLog />

        {/* Island C load history */}
        <div className="panel rounded-xl p-4">
          <div className="text-[10px] uppercase eyebrow text-muted mb-2">Island C Load · last 24 h</div>
          {loadData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={loadData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--primary)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} unit=" MW" />
                <Tooltip content={<LoadTip />} />
                <Area type="monotone" dataKey="load" name="Island C Load" stroke="var(--primary)" strokeWidth={2} fill="url(#loadGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-muted text-sm">No data</div>
          )}
        </div>

        {/* Asset detail */}
        <AssetDetailCard
          assetId={selected}
          rt={rt}
          onClose={() => { setSelected(null); onAssetClick?.(null) }}
        />
      </div>
    </div>
  )
}
