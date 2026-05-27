'use client'
// Font Awesome–backed icon set. All icons keep the original API
// (width/height/className/style props) so existing call-sites work unchanged.
//
// Width/height map to fontSize on the underlying <i> element since
// Font Awesome icons are CSS-driven, not SVG-sized.
//
// Make sure the FA kit script is loaded in app/layout.js head.

const makeIcon = (faClass) =>
  function FaIcon({ width = 16, height, className = '', style = {}, ...rest }) {
    // Prefer width; if height is given and differs, take whichever is larger
    const size = Number(width) || Number(height) || 16
    return (
      <i
        className={`${faClass} ${className}`.trim()}
        style={{ fontSize: `${size}px`, lineHeight: 1, ...style }}
        {...rest}
      />
    )
  }

export const Icon = {
  // ── Core / brand ──────────────────────────────────────────────────
  Bolt:        makeIcon('fa-solid fa-bolt'),

  // ── KPI / status ──────────────────────────────────────────────────
  Gauge:       makeIcon('fa-solid fa-gauge-high'),
  Battery:     makeIcon('fa-solid fa-battery-three-quarters'),
  Sun:         makeIcon('fa-solid fa-sun'),
  Moon:        makeIcon('fa-solid fa-moon'),
  Alert:       makeIcon('fa-solid fa-triangle-exclamation'),
  Bell:        makeIcon('fa-solid fa-bell'),

  // ── Grid topology / assets ────────────────────────────────────────
  Cable:       makeIcon('fa-solid fa-plug'),
  Engine:      makeIcon('fa-solid fa-gas-pump'),
  Radio:       makeIcon('fa-solid fa-radio'),

  // ── Charts / data ─────────────────────────────────────────────────
  ChartBar:    makeIcon('fa-solid fa-chart-column'),
  TrendUp:     makeIcon('fa-solid fa-arrow-trend-up'),
  TrendDown:   makeIcon('fa-solid fa-arrow-trend-down'),

  // ── Time / scheduling ─────────────────────────────────────────────
  Calendar:    makeIcon('fa-solid fa-calendar-days'),

  // ── Actions ───────────────────────────────────────────────────────
  Check:       makeIcon('fa-solid fa-check'),
  Send:        makeIcon('fa-solid fa-paper-plane'),
  Refresh:     makeIcon('fa-solid fa-arrows-rotate'),
  Download:    makeIcon('fa-solid fa-download'),
  Sliders:     makeIcon('fa-solid fa-sliders'),
  X:           makeIcon('fa-solid fa-xmark'),
  Wand:        makeIcon('fa-solid fa-wand-magic-sparkles'),

  // ── Communication / files ─────────────────────────────────────────
  Mail:        makeIcon('fa-solid fa-envelope'),
  File:        makeIcon('fa-solid fa-file-lines'),

  // ── Identity / map ────────────────────────────────────────────────
  User:        makeIcon('fa-solid fa-user'),
  Map:         makeIcon('fa-solid fa-map'),
  Wifi:        makeIcon('fa-solid fa-wifi'),

  // ── Misc ──────────────────────────────────────────────────────────
  Coin:        makeIcon('fa-solid fa-coins'),
  ChevronDown: makeIcon('fa-solid fa-chevron-down'),
}
