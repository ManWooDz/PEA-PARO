'use client'
// Visual 3-island cascading grid topology with line utilization bars

const LINE_COLORS = { normal: '#10b981', warning: '#f59e0b', critical: '#ef4444' }

function LineBar({ line }) {
  const pct = line.utilization_pct || 0
  const color = LINE_COLORS[line.status] || '#10b981'
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="mono text-muted w-12 flex-shrink-0">L{line.id}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }}>
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <span className="mono w-14 text-right flex-shrink-0" style={{ color }}>
        {line.flow_mw?.toFixed(1)} / {line.limit_mw} MW
      </span>
      <span className="mono w-10 text-right flex-shrink-0" style={{ color }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

export function GridTopology({ lines = [] }) {
  const bySegment = {
    'Mainland→A': lines.filter(l => [1,2,3].includes(l.id)),
    'A→B':        lines.filter(l => [4,5].includes(l.id)),
    'B→C':        lines.filter(l => l.id === 6),
  }

  return (
    <div className="panel rounded-xl p-4">
      <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">
        Grid Topology · Cascading Line Utilization
      </div>

      {/* Visual topology diagram */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {['Main Land', 'Island A', 'Island B', 'Island C'].map((node, i) => {
          const connectors = ['──L1/2/3──', '──L4/5──', '──L6(8MW)──']
          const connColor = i === 2 ? '#ef4444' : '#6366f1'
          return (
            <div key={node} className="flex items-center gap-1 flex-shrink-0">
              <div className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-center"
                   style={{
                     background: i === 3 ? 'rgba(208,64,184,0.14)' : 'var(--surface-2)',
                     border: `1px solid ${i === 3 ? 'var(--primary)' : 'var(--border-soft)'}`,
                     color: i === 3 ? 'var(--primary)' : 'var(--text)',
                     minWidth: '72px',
                   }}>
                {node}
              </div>
              {i < 3 && (
                <span className="text-[10px] mono flex-shrink-0" style={{ color: connColor }}>
                  {connectors[i]}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Line utilization bars grouped by segment */}
      <div className="space-y-3">
        {Object.entries(bySegment).map(([seg, segLines]) => (
          segLines.length > 0 && (
            <div key={seg}>
              <div className="text-[10px] uppercase eyebrow text-muted mb-1.5">{seg}</div>
              <div className="space-y-1">
                {segLines.map(l => <LineBar key={l.id} line={l} />)}
              </div>
            </div>
          )
        ))}
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t hairline text-[10.5px]">
        {Object.entries(LINE_COLORS).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full" style={{ background: c }} />
            <span className="text-muted capitalize">{k} {k==='normal'?'(<70%)':k==='warning'?'(70-90%)':'(>90%)'}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
