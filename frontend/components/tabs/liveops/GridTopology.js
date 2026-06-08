"use client";
import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { fetchForecastSeries } from "@/lib/api";

// ── Live 3-island cascading-grid topology (from docs/data "EMS for Startup" Mermaid) ──
// Main Grid → Island A (SubA1/SubA2 + Battery#7 / Diesel#8) → Island B (SubB1/SubB2)
//          → Island C (SubC1 + Diesel#9).  Cables 1–6 carry live flow/limit/util.
// Pure SVG (no external dep): themed with the project's CSS tokens, SSR-safe.

const VIEW_W = 980;
const VIEW_H = 440;

// Status → colour (matches the rest of the app: green / amber / red).
const STATUS_COLOR = { normal: "#10b981", warning: "#f59e0b", critical: "#ef4444" };
const lineColor = (s) => STATUS_COLOR[s] ?? "#10b981";

// Voltage → casing/border colour (115 kV red, 33 kV blue). Drawn as a wider
// underlay so the kV class is readable at a glance, with the utilization colour
// as the core line on top.
const VKV = { "115 kV": "#ef4444", "33 kV": "#3b82f6" };
const kvColor = (kv) => VKV[kv] ?? "var(--muted)";

// Node geometry (centre coords). w/h default per kind.
const NODES = {
  main:  { cx: 70,  cy: 210, w: 108, h: 64, label: "Main Grid",       kind: "grid"  },
  bat7:  { cx: 300, cy: 66,  w: 116, h: 48, label: "Battery #7",      kind: "asset", asset: "bess"   },
  subA1: { cx: 300, cy: 145, w: 124, h: 46, label: "Substation A1",   kind: "sub"   },
  subA2: { cx: 300, cy: 290, w: 124, h: 46, label: "Substation A2",   kind: "sub"   },
  d8:    { cx: 300, cy: 392, w: 116, h: 48, label: "Diesel Gen #8",   kind: "asset", asset: "diesel" },
  subB1: { cx: 560, cy: 145, w: 124, h: 46, label: "Substation B1",   kind: "sub"   },
  subB2: { cx: 560, cy: 290, w: 124, h: 46, label: "Substation B2",   kind: "sub"   },
  subC1: { cx: 820, cy: 145, w: 124, h: 46, label: "Substation C1",   kind: "sub"   },
  d9:    { cx: 820, cy: 290, w: 116, h: 48, label: "Diesel Gen #9",   kind: "asset", asset: "diesel" },
};

// Island grouping boxes (x, y, w, h) drawn behind the nodes.
const GROUPS = [
  { id: "A", label: "Island A", x: 218, y: 14,  w: 164, h: 412, tint: "#c7911b" },
  { id: "B", label: "Island B", x: 478, y: 100, w: 164, h: 240, tint: "#c7911b" },
  { id: "C", label: "Island C", x: 738, y: 100, w: 164, h: 240, tint: "#4169e1" },
];

// Cables 1–6: which line id, endpoints, kV, and a label anchor. `bow` curves
// the two Main→A2 cables (2 & 3) apart so they don't overlap.
const CABLES = [
  { id: 1, from: "main",  to: "subA1", kv: "115 kV", lx: 175, ly: 158 },
  { id: 2, from: "main",  to: "subA2", kv: "115 kV", lx: 198, ly: 206, bow: -34 },
  { id: 3, from: "main",  to: "subA2", kv: "33 kV",  lx: 178, ly: 300, bow:  34 },
  { id: 4, from: "subA1", to: "subB1", kv: "115 kV", lx: 430, ly: 118 },
  { id: 5, from: "subA2", to: "subB2", kv: "33 kV",  lx: 430, ly: 263 },
  { id: 6, from: "subB1", to: "subC1", kv: "33 kV",  lx: 690, ly: 118, critical: true },
];

// Local (radial) connections of on-island assets to their substation — dashed grey.
const LOCALS = [
  { from: "bat7", to: "subA1" },
  { from: "d8",   to: "subA2" },
  { from: "d9",   to: "subC1" },
];

const fmt2 = (v) => (v == null ? "—" : Number(v).toFixed(2));
const fmt1 = (v) => (v == null ? "—" : Number(v).toFixed(1));

export function GridTopology({ rt }) {
  const [sel, setSel] = useState(null); // { type:'cable'|'node', id }

  const lineById = Object.fromEntries((rt?.lines ?? []).map((l) => [l.id, l]));
  const srcById = Object.fromEntries((rt?.sources ?? []).map((s) => [s.id, s]));
  const kpi = rt?.kpi ?? {};

  // Per-node live value shown under its label.
  const nodeValue = (key) => {
    switch (key) {
      case "main": return { v: fmt2(srcById.main_grid?.value), unit: "MW", status: "normal" };
      case "bat7": return { v: fmt1(srcById.battery7?.value), unit: "%", status: socStatus(srcById.battery7?.value) };
      case "d8":   return { v: fmt2(srcById.diesel8?.value), unit: "MW", status: srcById.diesel8?.value > 0.1 ? "normal" : "idle" };
      case "d9":   return { v: fmt2(srcById.diesel9?.value), unit: "MW", status: srcById.diesel9?.value > 0.1 ? "normal" : "idle" };
      case "subC1": return { v: fmt2(kpi.island_c_load_mw), unit: "MW load", status: "normal" };
      default: return null;
    }
  };

  const anchor = (key) => ({ x: NODES[key].cx, y: NODES[key].cy });

  // Per-island forecast load profile (LSTM+Margin), fetched lazily when an island
  // box is clicked. Cables/sources stay live-measured; only islands have a forecast.
  const [islandFc, setIslandFc] = useState({ island: null, points: [], loading: false });
  useEffect(() => {
    if (sel?.type !== "island") return;
    const island = sel.id;
    let alive = true;
    setIslandFc({ island, points: [], loading: true });
    fetchForecastSeries({ horizon: "6h", island })
      .then((d) => { if (alive) setIslandFc({ island, points: (d.points || []).slice(0, 24), loading: false }); })
      .catch(() => { if (alive) setIslandFc({ island, points: [], loading: false }); });
    return () => { alive = false; };
  }, [sel]);

  return (
    <div className="panel rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div>
          <div className="text-[10.5px] uppercase eyebrow text-muted">Grid Topology · Live</div>
          <div className="text-xs text-muted mt-0.5 thai">
            โครงสร้างโครงข่ายแบบลดหลั่น 3 เกาะ · คลิกสายเคเบิล/แหล่งจ่ายเพื่อดูค่าเรียลไทม์ · คลิกกล่องเกาะเพื่อดูพยากรณ์โหลด
          </div>
        </div>
        <Legend />
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full"
          style={{ minWidth: 680, height: "auto" }}
          role="img"
          aria-label="3-island cascading grid topology"
        >
          {/* arrowhead marker */}
          <defs>
            <marker id="gt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
            </marker>
          </defs>

          {/* island grouping boxes (clickable → forecast; labels drawn LAST) */}
          {GROUPS.map((g) => {
            const selected = sel?.type === "island" && sel.id === g.id;
            return (
              <rect key={g.id} className="cursor-pointer"
                onClick={() => setSel({ type: "island", id: g.id })}
                x={g.x} y={g.y} width={g.w} height={g.h} rx={14}
                fill={`color-mix(in srgb, ${g.tint} ${selected ? 14 : 7}%, transparent)`}
                stroke={selected ? g.tint : `color-mix(in srgb, ${g.tint} 45%, transparent)`}
                strokeWidth={selected ? 2.5 : 1.5} strokeDasharray="2 4"
              />
            );
          })}

          {/* local (asset → substation) dashed links */}
          {LOCALS.map((l, i) => {
            const a = anchor(l.from), b = anchor(l.to);
            return (
              <line key={`loc-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.6} />
            );
          })}

          {/* cables 1–6 (paths only; labels drawn LAST, on top of nodes) */}
          {CABLES.map((c) => {
            const a = anchor(c.from), b = anchor(c.to);
            const line = lineById[c.id];
            const active = (line?.flow_mw ?? 0) > 0.01;
            const selected = sel?.type === "cable" && sel.id === c.id;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + (c.bow ?? 0);
            const d = c.bow
              ? `M ${a.x},${a.y} Q ${mx},${my} ${b.x},${b.y}`
              : `M ${a.x},${a.y} L ${b.x},${b.y}`;
            return (
              <g key={`cab-${c.id}`} className="cursor-pointer" onClick={() => setSel({ type: "cable", id: c.id })}>
                {/* fat invisible hit area */}
                <path d={d} stroke="transparent" strokeWidth={16} fill="none" />
                {/* cable line — colour = VOLTAGE (115 kV red · 33 kV blue), animated when energized */}
                <path
                  d={d} fill="none" stroke={kvColor(c.kv)}
                  strokeWidth={selected ? 6 : c.critical ? 4.5 : 3.5}
                  strokeLinecap="round"
                  strokeDasharray={active ? "9 7" : undefined}
                  opacity={active ? 1 : 0.4}
                >
                  {active && (
                    <animate attributeName="stroke-dashoffset" from="32" to="0" dur="1.1s" repeatCount="indefinite" />
                  )}
                </path>
              </g>
            );
          })}

          {/* nodes */}
          {Object.entries(NODES).map(([key, n]) => (
            <Node
              key={key} nkey={key} n={n} val={nodeValue(key)}
              selected={sel?.type === "node" && sel.id === key}
              onClick={() => setSel({ type: "node", id: key })}
            />
          ))}

          {/* island labels — drawn last so they sit above node rects */}
          {GROUPS.map((g) => (
            <text key={`lbl-${g.id}`} x={g.x + 12} y={g.y + 18}
              className="thai cursor-pointer"
              onClick={() => setSel({ type: "island", id: g.id })}
              fontSize="12" fontWeight="700" fill={g.tint}>
              {g.label}
            </text>
          ))}

          {/* cable labels — drawn last so they sit above node rects */}
          {CABLES.map((c) => {
            const line = lineById[c.id];
            const color = line ? lineColor(line.status) : "var(--border-soft)";
            const selected = sel?.type === "cable" && sel.id === c.id;
            return (
              <g key={`lbl-cab-${c.id}`} className="cursor-pointer" onClick={() => setSel({ type: "cable", id: c.id })}>
                <CableLabel
                  x={c.lx} y={c.ly} color={color}
                  flow={line?.flow_mw} limit={line?.limit_mw} util={line?.utilization_pct}
                  kv={c.kv} id={c.id} selected={selected}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <DetailPanel sel={sel} lineById={lineById} srcById={srcById} kpi={kpi} islandFc={islandFc} />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function socStatus(soc) {
  if (soc == null) return "normal";
  if (soc < 20) return "critical";
  if (soc < 30) return "warning";
  return "normal";
}

function Node({ nkey, n, val, selected, onClick }) {
  const x = n.cx - n.w / 2, y = n.cy - n.h / 2;
  const fill =
    n.kind === "grid" ? "color-mix(in srgb, #0ea5e9 16%, var(--surface-2))"
    : n.kind === "asset" && n.asset === "bess" ? "color-mix(in srgb, #10b981 14%, var(--surface-2))"
    : n.kind === "asset" ? "color-mix(in srgb, #f59e0b 14%, var(--surface-2))"
    : "var(--surface-2)";
  const dot = val ? (STATUS_COLOR[val.status] ?? "var(--muted)") : null;
  return (
    <g className="cursor-pointer" onClick={onClick}>
      <rect
        x={x} y={y} width={n.w} height={n.h} rx={10}
        fill={fill}
        stroke={selected ? "var(--primary)" : "var(--border-soft)"}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <text x={n.cx} y={val ? n.cy - 4 : n.cy + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--foreground)" className="thai">
        {n.label}
      </text>
      {val && (
        <text x={n.cx} y={n.cy + 14} textAnchor="middle" fontSize="12" fontWeight="700" className="mono"
          fill={dot}>
          {val.v} <tspan fontSize="9" fill="var(--muted)">{val.unit}</tspan>
        </text>
      )}
    </g>
  );
}

function CableLabel({ x, y, color, flow, limit, util, kv, id, selected }) {
  const w = 86, h = 30;
  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`}>
      <rect width={w} height={h} rx={6} fill="var(--surface-2)" stroke={selected ? "var(--primary)" : color} strokeWidth={selected ? 2 : 1} opacity={0.97} />
      <text x={w / 2} y={12} textAnchor="middle" fontSize="9.5" fontWeight="700" className="mono" fill={color}>
        {flow == null ? "—" : `${Number(flow).toFixed(1)}/${limit}`} <tspan fill="var(--muted)" fontWeight="400">MW</tspan>
      </text>
      <text x={w / 2} y={24} textAnchor="middle" fontSize="8.5" className="mono" fill="var(--muted)">
        L{id} · <tspan fill={color} fontWeight="700">{util == null ? "—" : `${Number(util).toFixed(0)}%`}</tspan> · <tspan fill={kvColor(kv)} fontWeight="700">{kv}</tspan>
      </text>
    </g>
  );
}

function Legend() {
  const util = [
    { c: "#10b981", t: "<70%" },
    { c: "#f59e0b", t: "70–90%" },
    { c: "#ef4444", t: "≥90%" },
  ];
  const volt = [
    { c: VKV["115 kV"], t: "115 kV" },
    { c: VKV["33 kV"], t: "33 kV" },
  ];
  return (
    <div className="flex items-center gap-x-4 gap-y-1 text-[10px] flex-wrap justify-end">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted thai">เส้น = แรงดัน:</span>
        {volt.map((i) => (
          <span key={i.c} className="flex items-center gap-1 mono">
            <span className="inline-block w-4 h-[3px] rounded-full" style={{ background: i.c }} />
            {i.t}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted thai">ป้าย = การใช้งาน:</span>
        {util.map((i) => (
          <span key={i.c} className="flex items-center gap-1 mono">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ border: `2px solid ${i.c}` }} />
            {i.t}
          </span>
        ))}
      </div>
    </div>
  );
}

const NODE_SPEC = {
  main:  { title: "Main Grid", island: "Mainland", note: "พลังงานนำเข้ารวมผ่าน Cable 1–3 (115/33 kV)" },
  bat7:  { title: "Battery #7 (BESS)", island: "Island A", note: "12.5 MW / 30 MWh · ชาร์จ 22:00–08:59 · จ่าย 09:00–21:59" },
  d8:    { title: "Diesel Gen #8", island: "Island A", note: "3 × 5 MW · ramp 1%/s · min-down 10 นาที · max-up 12 ชม." },
  d9:    { title: "Diesel Gen #9", island: "Island C", note: "2 × 2.5 MW · ramp 3%/s · min-down 10 นาที · max-up 12 ชม." },
  subA1: { title: "Substation A1", island: "Island A", note: "รับ Cable 1 (115 kV) · จ่ายต่อ Cable 4 → เกาะ B" },
  subA2: { title: "Substation A2", island: "Island A", note: "รับ Cable 2/3 (115/33 kV) · จ่ายต่อ Cable 5 → เกาะ B" },
  subB1: { title: "Substation B1", island: "Island B", note: "รับ Cable 4 · จ่ายต่อ Cable 6 (33 kV) → เกาะ C" },
  subB2: { title: "Substation B2", island: "Island B", note: "รับ Cable 5 (33 kV)" },
  subC1: { title: "Substation C1", island: "Island C", note: "ปลายทาง · รับ Cable 6 (33 kV) + Diesel #9 ในพื้นที่" },
};

function DetailPanel({ sel, lineById, srcById, kpi, islandFc }) {
  if (!sel) {
    return (
      <div className="mt-3 text-xs text-muted thai border-t hairline pt-3">
        เลือกสายเคเบิล/แหล่งจ่าย เพื่อดูค่าเรียลไทม์ · หรือคลิกกล่องเกาะเพื่อดูพยากรณ์โหลด
      </div>
    );
  }

  if (sel.type === "island") {
    const tint = GROUPS.find((g) => g.id === sel.id)?.tint ?? "var(--primary)";
    const ready = islandFc?.island === sel.id;
    const data = (ready ? islandFc.points : []).map((p) => ({
      t: String(p.datetime).slice(11, 16),
      load: p.predicted_safe ?? p.predicted,
    }));
    const peak = data.reduce((m, d) => Math.max(m, d.load ?? 0), 0);
    return (
      <div className="mt-3 border-t hairline pt-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: tint }} />
          <span className="font-semibold text-sm">Island {sel.id} · พยากรณ์โหลด 6 ชม. ข้างหน้า</span>
          <span className="text-[11px] text-muted">· LSTM+Margin</span>
        </div>
        {islandFc?.loading || !ready ? (
          <div className="h-[150px] flex items-center justify-center text-muted text-xs thai">กำลังโหลดพยากรณ์…</div>
        ) : data.length === 0 ? (
          <div className="h-[150px] flex items-center justify-center text-muted text-xs thai">ไม่มีข้อมูลพยากรณ์</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gtIslandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={tint} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={tint} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: "var(--muted)" }} tickLine={false} axisLine={false} unit=" MW" width={42} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} MW`, "พยากรณ์"]} contentStyle={{ fontSize: 11 }} labelStyle={{ fontSize: 11 }} />
                {sel.id === "C" && <ReferenceLine y={8} stroke="#ef4444" strokeDasharray="4 2" />}
                <Area type="monotone" dataKey="load" name="พยากรณ์" stroke={tint} strokeWidth={2}
                  fill="url(#gtIslandGrad)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="text-[11px] text-muted thai mt-1">
              พยากรณ์ LSTM+Margin เกาะ {sel.id} · พีค ~<span className="mono">{peak.toFixed(2)}</span> MW
              {sel.id === "C" ? " · เส้นแดง = พิกัด Line 6 (8 MW)" : ""}
            </div>
          </>
        )}
      </div>
    );
  }

  if (sel.type === "cable") {
    const l = lineById[sel.id];
    const color = l ? lineColor(l.status) : "var(--muted)";
    return (
      <div className="mt-3 border-t hairline pt-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="font-semibold text-sm">Cable {sel.id} · {l?.name ?? "—"}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="กำลังส่งผ่าน" value={`${fmt2(l?.flow_mw)} MW`} />
          <Stat label="พิกัดสาย (limit)" value={`${l?.limit_mw ?? "—"} MW`} />
          <Stat label="การใช้งาน" value={`${fmt1(l?.utilization_pct)}%`} color={color} />
          <Stat label="สถานะ" value={statusTh(l?.status)} color={color} />
        </div>
      </div>
    );
  }

  // node
  const spec = NODE_SPEC[sel.id] ?? { title: sel.id, island: "—", note: "" };
  const liveLines = [];
  if (sel.id === "main") liveLines.push(["นำเข้ารวม", `${fmt2(srcById.main_grid?.value)} MW`]);
  if (sel.id === "bat7") {
    liveLines.push(["SoC", `${fmt1(srcById.battery7?.value)} %`]);
    if (kpi.battery_soc_mwh != null) liveLines.push(["พลังงานคงเหลือ", `${fmt1(kpi.battery_soc_mwh)} MWh`]);
  }
  if (sel.id === "d8") liveLines.push(["กำลังผลิต", `${fmt2(srcById.diesel8?.value)} MW`]);
  if (sel.id === "d9") liveLines.push(["กำลังผลิต", `${fmt2(srcById.diesel9?.value)} MW`]);
  if (sel.id === "subC1") liveLines.push(["โหลดเกาะ C", `${fmt2(kpi.island_c_load_mw)} MW`]);

  return (
    <div className="mt-3 border-t hairline pt-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-sm">{spec.title}</span>
        <span className="text-[11px] text-muted">· {spec.island}</span>
      </div>
      {spec.note && <div className="text-[11px] text-muted thai mb-2">{spec.note}</div>}
      {liveLines.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {liveLines.map(([k, v]) => <Stat key={k} label={k} value={v} />)}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div className="text-[10px] uppercase eyebrow text-muted thai">{label}</div>
      <div className="text-sm font-semibold mono" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

function statusTh(s) {
  return { normal: "ปกติ", warning: "เฝ้าระวัง", critical: "วิกฤต" }[s] ?? "—";
}
