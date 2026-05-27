'use client'
// Font Awesome via the official React package — tree-shaken SVG icons,
// no DOM mutation, no CDN dependency, no React reconciler conflicts.
//
// Each icon is imported explicitly (only what we use is bundled).
// API kept identical to the old Icon component so call-sites work unchanged:
//   <Icon.Bolt width="20" height="20" style={{ color: '...' }} />

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBolt,
  faGaugeHigh,
  faBatteryThreeQuarters,
  faSun,
  faMoon,
  faTriangleExclamation,
  faBell,
  faPlug,
  faGasPump,
  faRadio,
  faChartColumn,
  faArrowTrendUp,
  faArrowTrendDown,
  faCalendarDays,
  faCheck,
  faPaperPlane,
  faArrowsRotate,
  faDownload,
  faSliders,
  faXmark,
  faWandMagicSparkles,
  faEnvelope,
  faFileLines,
  faUser,
  faMap,
  faWifi,
  faCoins,
  faChevronDown,
} from '@fortawesome/free-solid-svg-icons'

// Disable FA's global CSS injection — Next.js handles CSS itself.
import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
config.autoAddCss = false

const makeIcon = (faIcon) =>
  function FaIcon({ width = 16, height, className = '', style = {}, title, ...rest }) {
    const size = Number(width) || Number(height) || 16
    return (
      <FontAwesomeIcon
        icon={faIcon}
        className={className}
        style={{ fontSize: `${size}px`, width: '1em', height: '1em', ...style }}
        title={title}
        {...rest}
      />
    )
  }

export const Icon = {
  // ── Core / brand ──────────────────────────────────────────────────
  Bolt:        makeIcon(faBolt),

  // ── KPI / status ──────────────────────────────────────────────────
  Gauge:       makeIcon(faGaugeHigh),
  Battery:     makeIcon(faBatteryThreeQuarters),
  Sun:         makeIcon(faSun),
  Moon:        makeIcon(faMoon),
  Alert:       makeIcon(faTriangleExclamation),
  Bell:        makeIcon(faBell),

  // ── Grid topology / assets ────────────────────────────────────────
  Cable:       makeIcon(faPlug),
  Engine:      makeIcon(faGasPump),
  Radio:       makeIcon(faRadio),

  // ── Charts / data ─────────────────────────────────────────────────
  ChartBar:    makeIcon(faChartColumn),
  TrendUp:     makeIcon(faArrowTrendUp),
  TrendDown:   makeIcon(faArrowTrendDown),

  // ── Time / scheduling ─────────────────────────────────────────────
  Calendar:    makeIcon(faCalendarDays),

  // ── Actions ───────────────────────────────────────────────────────
  Check:       makeIcon(faCheck),
  Send:        makeIcon(faPaperPlane),
  Refresh:     makeIcon(faArrowsRotate),
  Download:    makeIcon(faDownload),
  Sliders:     makeIcon(faSliders),
  X:           makeIcon(faXmark),
  Wand:        makeIcon(faWandMagicSparkles),

  // ── Communication / files ─────────────────────────────────────────
  Mail:        makeIcon(faEnvelope),
  File:        makeIcon(faFileLines),

  // ── Identity / map ────────────────────────────────────────────────
  User:        makeIcon(faUser),
  Map:         makeIcon(faMap),
  Wifi:        makeIcon(faWifi),

  // ── Misc ──────────────────────────────────────────────────────────
  Coin:        makeIcon(faCoins),
  ChevronDown: makeIcon(faChevronDown),
}
