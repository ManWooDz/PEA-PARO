"use client";
// ── Proper SVG power-flow diagram for the 3-island cascading grid ─────────────
//
// Layout (left→right):
//   [Mainland] ──L1/2/3──▶ [Island A] ──L4/5──▶ [Island B] ──L6(8MW)──▶ [Island C★]
//                           Bat#7·D#8                                       D#9·CRITICAL

const C = {
  normal: "#10b981", // green   < 70 %
  warning: "#f59e0b", // amber  70-90 %
  critical: "#ef4444", // red     > 90 %
  muted: "#64748b",
};

function worst(segs) {
  if (!segs.length) return "muted";
  if (segs.some((l) => l.status === "critical")) return "critical";
  if (segs.some((l) => l.status === "warning")) return "warning";
  return "normal";
}

function sumMW(segs) {
  return segs.reduce((s, l) => s + (l.flow_mw ?? 0), 0);
}

// ── Line utilization bar (detail rows below SVG) ──────────────────────────────
function LineBar({ line }) {
  const pct = line.utilization_pct ?? 0;
  const color = C[line.status] ?? C.muted;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="mono text-muted w-10 flex-shrink-0">L{line.id}</span>
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--surface-2)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, pct)}%`, background: color }}
        />
      </div>
      <span className="mono w-20 text-right flex-shrink-0" style={{ color }}>
        {(line.flow_mw ?? 0).toFixed(1)} / {line.limit_mw} MW
      </span>
      <span
        className="mono w-8 text-right flex-shrink-0"
        style={{ color: "var(--muted)" }}
      >
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function GridTopology({ lines = [], onAssetClick, focusedAssetId = null }) {
  const seg1 = lines.filter((l) => [1, 2, 3].includes(l.id)); // Mainland → Island A
  const seg2 = lines.filter((l) => [4, 5].includes(l.id)); // Island A → Island B
  const seg3 = lines.filter((l) => l.id === 6); // Island B → Island C (CRITICAL)

  const s1 = worst(seg1);
  const s2 = worst(seg2);
  const s3 = worst(seg3);

  const f1 = sumMW(seg1);
  const f2 = sumMW(seg2);
  const f3 = seg3[0]?.flow_mw ?? 0;
  const u6 = seg3[0]?.utilization_pct ?? 0;

  // ── SVG layout constants ─────────────────────────────────────────────────
  // viewBox: 640 × 108  (extended from 96 to make room for asset circles)
  const NW = 106,
    NH = 42,
    NRX = 7;
  const NY = 16; // node top-y
  const LY = NY + NH / 2; // node center-y = 37 (line path y)

  // Node left-x positions  (total: 524 + 106 + 10 = 640)
  const NX = { mainland: 8, islandA: 180, islandB: 352, islandC: 524 };
  const NCX = (k) => NX[k] + NW / 2; // center-x of node

  // Connection x-ranges (node right→next node left, each gap = 66 px)
  const x1l = NX.mainland + NW; // 114
  const x1r = NX.islandA; // 180
  const x2l = NX.islandA + NW; // 286
  const x2r = NX.islandB; // 352
  const x3l = NX.islandB + NW; // 458
  const x3r = NX.islandC; // 524

  const mid1 = (x1l + x1r) / 2; // 147
  const mid2 = (x2l + x2r) / 2; // 319
  const mid3 = (x3l + x3r) / 2; // 491

  // ── Flow animation helper (faster when stressed) ────────────────────────
  const flowAnim = (status) => {
    const speedMs =
      status === "critical" ? 600 : status === "warning" ? 1200 : 2400;
    return {
      strokeDasharray: "6 4",
      animation: `flow ${speedMs}ms linear infinite`,
    };
  };

  // ── Node styling helper for focus highlight ─────────────────────────────
  const nodeStroke = (id, dflt) =>
    focusedAssetId === id ? "var(--primary)" : dflt;
  const nodeWidth = (id, dflt) => (focusedAssetId === id ? 2.5 : dflt);

  return (
    <div className="panel rounded-xl p-4">
      <div className="text-[10.5px] uppercase eyebrow text-muted mb-3">
        Grid Topology · Power Flow Diagram
      </div>

      {/* ── SVG diagram ── */}
      <div className="overflow-x-auto mb-4">
        <svg viewBox="0 0 640 108" className="w-full" style={{ minWidth: 380 }}>
          <style jsx>{`
            @keyframes flow {
              from { stroke-dashoffset: 10; }
              to   { stroke-dashoffset: 0;  }
            }
          `}</style>

          {/* ── Arrow-head marker definitions ── */}
          <defs>
            {Object.entries(C).map(([k, v]) => (
              <marker
                key={k}
                id={`arw-${k}`}
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 7 3.5, 0 7" fill={v} />
              </marker>
            ))}
          </defs>

          {/* ══════════════════════════════════════════════════════════════════
              Segment 1 — Mainland → Island A   (Lines 1 / 2 / 3)
          ══════════════════════════════════════════════════════════════════ */}
          <g
            onClick={() => onAssetClick?.("line_1_2_3")}
            style={{ cursor: "pointer" }}
          >
            <line
              x1={x1l + 2}
              y1={LY}
              x2={x1r - 9}
              y2={LY}
              stroke={C[s1]}
              strokeWidth={focusedAssetId === "line_1_2_3" ? 3.5 : 2.5}
              markerEnd={`url(#arw-${s1})`}
              style={flowAnim(s1)}
            />
            {/* Flow badge */}
            <rect
              x={mid1 - 26}
              y={LY - 25}
              width={52}
              height={15}
              rx={3}
              fill="var(--bg)"
              stroke={`${C[s1]}40`}
              strokeWidth={1}
            />
            <text
              x={mid1}
              y={LY - 14}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill={C[s1]}
            >
              {f1.toFixed(1)} MW
            </text>
            {/* Segment label below */}
            <text
              x={mid1}
              y={LY + 20}
              textAnchor="middle"
              fontSize="8"
              fill="var(--muted)"
            >
              L1/2/3 · 115kV
            </text>
          </g>

          {/* ══════════════════════════════════════════════════════════════════
              Segment 2 — Island A → Island B   (Lines 4 / 5)
          ══════════════════════════════════════════════════════════════════ */}
          <g
            onClick={() => onAssetClick?.("line_4_5")}
            style={{ cursor: "pointer" }}
          >
            <line
              x1={x2l + 2}
              y1={LY}
              x2={x2r - 9}
              y2={LY}
              stroke={C[s2]}
              strokeWidth={focusedAssetId === "line_4_5" ? 3.5 : 2.5}
              markerEnd={`url(#arw-${s2})`}
              style={flowAnim(s2)}
            />
            <rect
              x={mid2 - 26}
              y={LY - 25}
              width={52}
              height={15}
              rx={3}
              fill="var(--bg)"
              stroke={`${C[s2]}40`}
              strokeWidth={1}
            />
            <text
              x={mid2}
              y={LY - 14}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill={C[s2]}
            >
              {f2.toFixed(1)} MW
            </text>
            <text
              x={mid2}
              y={LY + 20}
              textAnchor="middle"
              fontSize="8"
              fill="var(--muted)"
            >
              L4/5 · 115/33kV
            </text>
          </g>

          {/* ══════════════════════════════════════════════════════════════════
              Segment 3 — Island B → Island C   (Line 6 — CRITICAL 8 MW cap)
          ══════════════════════════════════════════════════════════════════ */}
          <g
            onClick={() => onAssetClick?.("line_6")}
            style={{ cursor: "pointer" }}
          >
            {/* Main line — animated + red glow when critical */}
            <line
              x1={x3l + 2}
              y1={LY}
              x2={x3r - 9}
              y2={LY}
              stroke={C[s3]}
              strokeWidth={focusedAssetId === "line_6" ? 3.5 : 2.5}
              markerEnd={`url(#arw-${s3})`}
              style={{
                ...flowAnim(s3),
                filter:
                  s3 === "critical"
                    ? "drop-shadow(0 0 4px #ef4444)"
                    : "none",
              }}
            />
            {/* Flow badge (slightly wider for "X.X / 8 MW") */}
            <rect
              x={mid3 - 32}
              y={LY - 26}
              width={64}
              height={16}
              rx={3}
              fill="var(--bg)"
              stroke={`${C[s3]}55`}
              strokeWidth={1.5}
            />
            <text
              x={mid3}
              y={LY - 14}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill={C[s3]}
            >
              {f3.toFixed(1)} / 8 MW
            </text>
            <text
              x={mid3}
              y={LY + 20}
              textAnchor="middle"
              fontSize="8"
              fontWeight="600"
              fill={C[s3]}
            >
              L6 · {u6.toFixed(0)}% used
            </text>
          </g>

          {/* ══════════════════════════════════════════════════════════════════
              NODE BOXES
          ══════════════════════════════════════════════════════════════════ */}

          {/* Mainland */}
          <g
            onClick={() => onAssetClick?.("mainland")}
            style={{ cursor: "pointer" }}
          >
            <rect
              x={NX.mainland}
              y={NY}
              width={NW}
              height={NH}
              rx={NRX}
              fill="var(--surface-2)"
              stroke={nodeStroke("mainland", "var(--border-soft)")}
              strokeWidth={nodeWidth("mainland", 1.5)}
            />
            <text
              x={NCX("mainland")}
              y={NY + 15}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="var(--text)"
              style={{ pointerEvents: "none" }}
            >
              Mainland
            </text>
            <text
              x={NCX("mainland")}
              y={NY + 30}
              textAnchor="middle"
              fontSize="9"
              fill="var(--muted)"
              style={{ pointerEvents: "none" }}
            >
              Grid Source
            </text>
          </g>

          {/* Island A */}
          <g
            onClick={() => onAssetClick?.("island_a")}
            style={{ cursor: "pointer" }}
          >
            <rect
              x={NX.islandA}
              y={NY}
              width={NW}
              height={NH}
              rx={NRX}
              fill="var(--surface-2)"
              stroke={nodeStroke("island_a", "var(--border-soft)")}
              strokeWidth={nodeWidth("island_a", 1.5)}
            />
            <text
              x={NCX("islandA")}
              y={NY + 15}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="var(--text)"
              style={{ pointerEvents: "none" }}
            >
              Island A
            </text>
            <text
              x={NCX("islandA")}
              y={NY + 30}
              textAnchor="middle"
              fontSize="9"
              fill="var(--muted)"
              style={{ pointerEvents: "none" }}
            >
              Bat#7 · Diesel#8
            </text>
          </g>

          {/* Island B */}
          <g
            onClick={() => onAssetClick?.("island_b")}
            style={{ cursor: "pointer" }}
          >
            <rect
              x={NX.islandB}
              y={NY}
              width={NW}
              height={NH}
              rx={NRX}
              fill="var(--surface-2)"
              stroke={nodeStroke("island_b", "var(--border-soft)")}
              strokeWidth={nodeWidth("island_b", 1.5)}
            />
            <text
              x={NCX("islandB")}
              y={NY + 15}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="var(--text)"
              style={{ pointerEvents: "none" }}
            >
              Island B
            </text>
            <text
              x={NCX("islandB")}
              y={NY + 30}
              textAnchor="middle"
              fontSize="9"
              fill="var(--muted)"
              style={{ pointerEvents: "none" }}
            >
              Transit
            </text>
          </g>

          {/* Island C — highlighted with primary accent (always critical) */}
          <g
            onClick={() => onAssetClick?.("island_c")}
            style={{ cursor: "pointer" }}
          >
            <rect
              x={NX.islandC}
              y={NY}
              width={NW}
              height={NH}
              rx={NRX}
              fill="var(--primary)"
              fillOpacity={0.12}
              stroke="var(--primary)"
              strokeWidth={focusedAssetId === "island_c" ? 2.5 : 2}
            />
            <text
              x={NCX("islandC")}
              y={NY + 15}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="var(--primary)"
              style={{ pointerEvents: "none" }}
            >
              Island C
            </text>
            <text
              x={NCX("islandC")}
              y={NY + 30}
              textAnchor="middle"
              fontSize="9"
              fill="var(--muted)"
              style={{ pointerEvents: "none" }}
            >
              D#9 · 8MW cap
            </text>

            {/* Line 6 utilisation bar embedded in Island C node */}
            <rect
              x={NX.islandC + 8}
              y={NY + NH - 5}
              width={NW - 16}
              height={3}
              rx={1.5}
              fill="var(--border-soft)"
            />
            <rect
              x={NX.islandC + 8}
              y={NY + NH - 5}
              width={Math.max(
                0,
                Math.min(NW - 16, ((NW - 16) * u6) / 100),
              )}
              height={3}
              rx={1.5}
              fill={C[s3]}
            />
          </g>

          {/* ══════════════════════════════════════════════════════════════════
              ASSET CIRCLES — Battery #7 / Diesel #8 (Island A), Diesel #9 (Island C)
          ══════════════════════════════════════════════════════════════════ */}

          {/* Battery #7 — Island A */}
          <g
            onClick={() => onAssetClick?.("battery_7")}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={NX.islandA + NW / 2 - 22}
              cy={NY + NH + 12}
              r={6}
              fill="#10b981"
              stroke={
                focusedAssetId === "battery_7" ? "var(--primary)" : "none"
              }
              strokeWidth={focusedAssetId === "battery_7" ? 2 : 0}
            />
            <text
              x={NX.islandA + NW / 2 - 22}
              y={NY + NH + 15}
              textAnchor="middle"
              fontSize={7}
              fontWeight="700"
              fill="#fff"
              style={{ pointerEvents: "none" }}
            >
              B7
            </text>
          </g>

          {/* Diesel #8 — Island A */}
          <g
            onClick={() => onAssetClick?.("diesel_8")}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={NX.islandA + NW / 2 + 22}
              cy={NY + NH + 12}
              r={6}
              fill="#f59e0b"
              stroke={
                focusedAssetId === "diesel_8" ? "var(--primary)" : "none"
              }
              strokeWidth={focusedAssetId === "diesel_8" ? 2 : 0}
            />
            <text
              x={NX.islandA + NW / 2 + 22}
              y={NY + NH + 15}
              textAnchor="middle"
              fontSize={7}
              fontWeight="700"
              fill="#fff"
              style={{ pointerEvents: "none" }}
            >
              D8
            </text>
          </g>

          {/* Diesel #9 — Island C */}
          <g
            onClick={() => onAssetClick?.("diesel_9")}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={NX.islandC + NW / 2}
              cy={NY + NH + 12}
              r={6}
              fill="#ef4444"
              stroke={
                focusedAssetId === "diesel_9" ? "var(--primary)" : "none"
              }
              strokeWidth={focusedAssetId === "diesel_9" ? 2 : 0}
            />
            <text
              x={NX.islandC + NW / 2}
              y={NY + NH + 15}
              textAnchor="middle"
              fontSize={7}
              fontWeight="700"
              fill="#fff"
              style={{ pointerEvents: "none" }}
            >
              D9
            </text>
          </g>
        </svg>
      </div>

      {/* ── Per-line utilisation detail rows ── */}
      <div className="space-y-3">
        {[
          { label: "Mainland → Island A", segs: seg1 },
          { label: "Island A → Island B", segs: seg2 },
          { label: "Island B → Island C", segs: seg3 },
        ].map(
          ({ label, segs }) =>
            segs.length > 0 && (
              <div key={label}>
                <div className="text-[10px] uppercase eyebrow text-muted mb-1.5">
                  {label}
                </div>
                <div className="space-y-1">
                  {segs.map((l) => (
                    <LineBar key={l.id} line={l} />
                  ))}
                </div>
              </div>
            ),
        )}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t hairline text-[10.5px]">
        {[
          ["normal", "<70%"],
          ["warning", "70–90%"],
          ["critical", ">90%"],
        ].map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className="w-3 h-1.5 rounded-full inline-block"
              style={{ background: C[k] }}
            />
            <span className="text-muted capitalize">
              {k} ({v})
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
