'use client'
// ── Proper SVG power-flow diagram for the 3-island cascading grid ─────────────
//
// Layout (left→right):
//   [Mainland] ──L1/2/3──▶ [Island A] ──L4/5──▶ [Island B] ──L6(8MW)──▶ [Island C★]
//                           Bat#7·D#8                                       D#9·CRITICAL

const C = {
  normal:   '#10b981',   // green   < 70 %
  warning:  '#f59e0b',   // amber  70-90 %
  critical: '#ef4444',   // red     > 90 %
  muted:    '#64748b',
}

function worst(segs) {
  if (!segs.length)                              return 'muted'
  if (segs.some(l => l.status === 'critical'))   return 'critical'
  if (segs.some(l => l.status === 'warning'))    return 'warning'
  return 'normal'
}

function sumMW(segs) {
  return segs.reduce((s, l) => s + (l.flow_mw ?? 0), 0)
}

// ── Line utilization bar (detail rows below SVG) ──────────────────────────────
function LineBar({ line }) {
  const pct   = line.utilization_pct ?? 0
  const color = C[line.status] ?? C.muted
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="mono text-muted w-10 flex-shrink-0">L{line.id}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <span className="mono w-20 text-right flex-shrink-0" style={{ color }}>
        {(line.flow_mw ?? 0).toFixed(1)} / {line.limit_mw} MW
      </span>
      <span className="mono w-8 text-right flex-shrink-0" style={{ color: 'var(--muted)' }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function GridTopology({ lines = [] }) {
  const seg1 = lines.filter(l => [1, 2, 3].includes(l.id))   // Mainland → Island A
  const seg2 = lines.filter(l => [4, 5].includes(l.id))      // Island A → Island B
  const seg3 = lines.filter(l => l.id === 6)                 // Island B → Island C (CRITICAL)

  const s1 = worst(seg1)
  const s2 = worst(seg2)
  const s3 = worst(seg3)

  const f1 = sumMW(seg1)
  const f2 = sumMW(seg2)
  const f3 = seg3[0]?.flow_mw ?? 0
  const u6 = seg3[0]?.utilization_pct ?? 0

  // ── SVG layout constants ─────────────────────────────────────────────────
  // viewBox: 640 × 96
  const NW = 106, NH = 42, NRX = 7
  const NY = 16         // node top-y
  const LY = NY + NH / 2  // node center-y = 37 (line path y)

  // Node left-x positions  (total: 524 + 106 + 10 = 640)
  const NX = { mainland: 8, islandA: 180, islandB: 352, islandC: 524 }
  const NCX = k => NX[k] + NW / 2   // center-x of node

  // Connection x-ranges (node right→next node left, each gap = 66 px)
  const x1l = NX.mainland + NW   // 114
  const x1r = NX.islandA         // 180
  const x2l = NX.islandA  + NW   // 286
  const x2r = NX.islandB         // 352
  const x3l = NX.islandB  + NW   // 458
  const x3r = NX.islandC         // 524

  const mid1 = (x1l + x1r) / 2   // 147
  const mid2 = (x2l + x2r) / 2   // 319
  const mid3 = (x3l + x3r) / 2   // 491

  // y-offsets for parallel lines
  const OFFSETS_3 = [-6, 0, 6]    // L1, L2, L3
  const OFFSETS_2 = [-4, 4]       // L4, L5

  return (
    <div className="panel rounded-xl p-4">
      <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">
        Grid Topology · Power Flow Diagram
      </div>

      {/* ── SVG diagram ── */}
      <div className="overflow-x-auto mb-4">
        <svg viewBox="0 0 640 96" className="w-full" style={{ minWidth: 380 }}>

          {/* ── Arrow-head marker definitions ── */}
          <defs>
            {Object.entries(C).map(([k, v]) => (
              <marker key={k}
                id={`arw-${k}`} markerWidth="7" markerHeight="7"
                refX="6" refY="3.5" orient="auto">
                <polygon points="0 0, 7 3.5, 0 7" fill={v} />
              </marker>
            ))}
          </defs>

          {/* ══════════════════════════════════════════════════════════════════
              Segment 1 — Mainland → Island A   (Lines 1 / 2 / 3)
          ══════════════════════════════════════════════════════════════════ */}
          {OFFSETS_3.map((dy, i) => {
            const isPrimary = i === 1
            return (
              <line key={i}
                x1={x1l + 2}  y1={LY + dy}
                x2={isPrimary ? x1r - 9 : x1r - 2}  y2={LY + dy}
                stroke={C[s1]}
                strokeWidth={isPrimary ? 2.5 : 1.5}
                opacity={isPrimary ? 1 : 0.45}
                markerEnd={isPrimary ? `url(#arw-${s1})` : undefined}
              />
            )
          })}
          {/* Flow badge */}
          <rect x={mid1 - 26} y={LY - 25} width={52} height={15} rx={3}
                fill="var(--bg)" stroke={`${C[s1]}40`} strokeWidth={1} />
          <text x={mid1} y={LY - 14} textAnchor="middle"
                fontSize="9" fontWeight="600" fill={C[s1]}>
            {f1.toFixed(1)} MW
          </text>
          {/* Segment label below */}
          <text x={mid1} y={LY + 20} textAnchor="middle"
                fontSize="8" fill="var(--muted)">
            L1/2/3 · 115kV
          </text>

          {/* ══════════════════════════════════════════════════════════════════
              Segment 2 — Island A → Island B   (Lines 4 / 5)
          ══════════════════════════════════════════════════════════════════ */}
          {OFFSETS_2.map((dy, i) => {
            const isPrimary = i === 0
            return (
              <line key={i}
                x1={x2l + 2}  y1={LY + dy}
                x2={isPrimary ? x2r - 9 : x2r - 2}  y2={LY + dy}
                stroke={C[s2]}
                strokeWidth={isPrimary ? 2.5 : 1.5}
                opacity={isPrimary ? 1 : 0.45}
                markerEnd={isPrimary ? `url(#arw-${s2})` : undefined}
              />
            )
          })}
          <rect x={mid2 - 26} y={LY - 25} width={52} height={15} rx={3}
                fill="var(--bg)" stroke={`${C[s2]}40`} strokeWidth={1} />
          <text x={mid2} y={LY - 14} textAnchor="middle"
                fontSize="9" fontWeight="600" fill={C[s2]}>
            {f2.toFixed(1)} MW
          </text>
          <text x={mid2} y={LY + 20} textAnchor="middle"
                fontSize="8" fill="var(--muted)">
            L4/5 · 115/33kV
          </text>

          {/* ══════════════════════════════════════════════════════════════════
              Segment 3 — Island B → Island C   (Line 6 — CRITICAL 8 MW cap)
          ══════════════════════════════════════════════════════════════════ */}
          {/* Main thick line */}
          <line
            x1={x3l + 2} y1={LY} x2={x3r - 9} y2={LY}
            stroke={C[s3]} strokeWidth={4}
            markerEnd={`url(#arw-${s3})`}
          />
          {/* Capacity envelope dashes */}
          <line x1={x3l + 2} y1={LY - 7} x2={x3r - 2} y2={LY - 7}
                stroke={C[s3]} strokeWidth={1} opacity={0.3} />
          <line x1={x3l + 2} y1={LY + 7} x2={x3r - 2} y2={LY + 7}
                stroke={C[s3]} strokeWidth={1} opacity={0.3} />
          {/* Flow badge (slightly wider for "X.X / 8 MW") */}
          <rect x={mid3 - 32} y={LY - 26} width={64} height={16} rx={3}
                fill="var(--bg)" stroke={`${C[s3]}55`} strokeWidth={1.5} />
          <text x={mid3} y={LY - 14} textAnchor="middle"
                fontSize="9" fontWeight="700" fill={C[s3]}>
            {f3.toFixed(1)} / 8 MW
          </text>
          <text x={mid3} y={LY + 20} textAnchor="middle"
                fontSize="8" fontWeight="600" fill={C[s3]}>
            L6 · {u6.toFixed(0)}% used
          </text>

          {/* ══════════════════════════════════════════════════════════════════
              NODE BOXES
          ══════════════════════════════════════════════════════════════════ */}

          {/* Mainland */}
          <rect x={NX.mainland} y={NY} width={NW} height={NH} rx={NRX}
                fill="var(--surface-2)" stroke="var(--border-soft)" strokeWidth={1.5} />
          <text x={NCX('mainland')} y={NY + 15} textAnchor="middle"
                fontSize="11" fontWeight="700" fill="var(--text)">Mainland</text>
          <text x={NCX('mainland')} y={NY + 30} textAnchor="middle"
                fontSize="9" fill="var(--muted)">Grid Source</text>

          {/* Island A */}
          <rect x={NX.islandA} y={NY} width={NW} height={NH} rx={NRX}
                fill="var(--surface-2)" stroke="var(--border-soft)" strokeWidth={1.5} />
          <text x={NCX('islandA')} y={NY + 15} textAnchor="middle"
                fontSize="11" fontWeight="700" fill="var(--text)">Island A</text>
          <text x={NCX('islandA')} y={NY + 30} textAnchor="middle"
                fontSize="9" fill="var(--muted)">Bat#7 · Diesel#8</text>

          {/* Island B */}
          <rect x={NX.islandB} y={NY} width={NW} height={NH} rx={NRX}
                fill="var(--surface-2)" stroke="var(--border-soft)" strokeWidth={1.5} />
          <text x={NCX('islandB')} y={NY + 15} textAnchor="middle"
                fontSize="11" fontWeight="700" fill="var(--text)">Island B</text>
          <text x={NCX('islandB')} y={NY + 30} textAnchor="middle"
                fontSize="9" fill="var(--muted)">Transit</text>

          {/* Island C — highlighted with primary accent */}
          <rect x={NX.islandC} y={NY} width={NW} height={NH} rx={NRX}
                fill="var(--primary)" fillOpacity={0.12}
                stroke="var(--primary)" strokeWidth={2} />
          <text x={NCX('islandC')} y={NY + 15} textAnchor="middle"
                fontSize="11" fontWeight="700" fill="var(--primary)">Island C</text>
          <text x={NCX('islandC')} y={NY + 30} textAnchor="middle"
                fontSize="9" fill="var(--muted)">D#9 · 8MW cap</text>

          {/* Line 6 utilisation bar embedded in Island C node */}
          <rect x={NX.islandC + 8} y={NY + NH - 5} width={NW - 16} height={3} rx={1.5}
                fill="var(--border-soft)" />
          <rect x={NX.islandC + 8} y={NY + NH - 5}
                width={Math.max(0, Math.min(NW - 16, (NW - 16) * u6 / 100))} height={3} rx={1.5}
                fill={C[s3]} />

        </svg>
      </div>

      {/* ── Per-line utilisation detail rows ── */}
      <div className="space-y-3">
        {[
          { label: 'Mainland → Island A', segs: seg1 },
          { label: 'Island A → Island B', segs: seg2 },
          { label: 'Island B → Island C', segs: seg3 },
        ].map(({ label, segs }) =>
          segs.length > 0 && (
            <div key={label}>
              <div className="text-[10px] uppercase eyebrow text-muted mb-1.5">{label}</div>
              <div className="space-y-1">
                {segs.map(l => <LineBar key={l.id} line={l} />)}
              </div>
            </div>
          )
        )}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t hairline text-[10.5px]">
        {[['normal', '<70%'], ['warning', '70–90%'], ['critical', '>90%']].map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-full inline-block" style={{ background: C[k] }} />
            <span className="text-muted capitalize">{k} ({v})</span>
          </span>
        ))}
      </div>
    </div>
  )
}
