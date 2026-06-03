'use client'

// Status → badge text + color (reuses the green/amber/red severity palette).
const STATUS_META = {
  safe:   { label: 'รับมือได้',  color: '#10b981' },
  manage: { label: 'ต้องเตรียม', color: '#f59e0b' },
  fail:   { label: 'เกินกำลัง',  color: '#ef4444' },
}

const fmtK = (v) => (v == null ? '—' : `฿${(v / 1000).toFixed(1)}k`)

function ScenarioCard({ s }) {
  const meta = STATUS_META[s.status] ?? STATUS_META.safe
  return (
    <div
      className="panel rounded-xl p-4 flex flex-col gap-3"
      style={{ borderColor: meta.color, borderWidth: '1px' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">{s.icon}</span>
          <span className="text-sm font-semibold thai truncate">{s.label}</span>
        </div>
        <span
          className="px-1.5 py-0.5 rounded text-[11px] font-bold uppercase eyebrow thai flex-shrink-0"
          style={{ background: `${meta.color}22`, color: meta.color }}
        >
          {meta.label}
        </span>
      </div>

      <div className="text-[11px] text-muted mono">{s.trigger}</div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase eyebrow text-muted thai">กำลังเสริม</div>
          <div className="mono font-semibold">
            {s.status === 'fail' ? '—' : `${s.peak_support_mw.toFixed(1)} MW`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase eyebrow text-muted thai">ต้นทุนเพิ่ม</div>
          <div className="mono font-semibold">
            {s.status === 'fail' ? '—' : `+${fmtK(s.extra_cost_thb)}`}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-2 border-t hairline flex items-center justify-between gap-2">
        <span className="text-xs thai" style={{ color: meta.color }}>{s.action}</span>
        {s.lead_min > 0 && (
          <span className="text-[10px] mono text-muted flex-shrink-0 whitespace-nowrap">
            lead {s.lead_min}น.
          </span>
        )}
      </div>
    </div>
  )
}

export function ScenarioCards({ scenarios = [], loading }) {
  return (
    <section>
      <div className="text-xs uppercase eyebrow text-muted mb-3 thai">
        🔬 สถานการณ์จำลอง · What-if (ถ้าจริงแย่กว่าพยากรณ์)
      </div>
      {loading ? (
        <div className="panel rounded-xl p-6 text-center text-sm text-muted thai">
          กำลังจำลองสถานการณ์…
        </div>
      ) : scenarios.length === 0 ? (
        <div className="panel rounded-xl p-6 text-center text-sm text-muted thai">
          ไม่มีข้อมูลสถานการณ์
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {scenarios.map((s) => <ScenarioCard key={s.id} s={s} />)}
        </div>
      )}
    </section>
  )
}
