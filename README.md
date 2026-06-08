# PEA-PARO

**Power Autonomous Resource Optimizer**
Energy Management System for a 3-Island Cascading Grid — PEA Pitching Challenge

---

## Overview

PEA-PARO is a full-stack EMS dashboard that monitors, forecasts, and optimises dispatch for a 3-island cascading grid:

```
Main Land ──L1/2/3──► Island A ──L4/5──► Island B ──L6 (33 kV, 8 MW)──► Island C
```

- **Key constraint:** Line 6 (Island B → Island C) is a 33 kV submarine cable capped at **8 MW** — the primary bottleneck for Island C supply.
- **Practical grid at Island C:** after upstream consumption by Islands A & B, only **~1.3 MW** of main-grid power reaches Island C on average (the 8 MW figure is the physical cable limit, not the available headroom). Dispatch is solved against the live available-grid series.
- **Token-based, no solar generation asset** in the canonical scenario. (Tab 3 has an optional weather/solar-irradiance *overlay* for context only.)

### Assets

| Asset | Location | Capacity | Operating rules |
|-------|----------|----------|-----------------|
| Battery #7 | Island A | 12.5 MW / 30 MWh | Charge 22:00–08:59, discharge 09:00–21:59, ~25 MWh/day |
| Diesel Gen #8 | Island A | 15 MW (3×5 MW) | Ramp 1 %/s, min-down 10 min, max-up 12 h |
| Diesel Gen #9 | Island C | 5 MW (2×2.5 MW) | Ramp 3 %/s, min-down 10 min, max-up 12 h |

### Cost Model & Merit Order (Token/kWh)

```
Grid  →  Battery  →  Diesel C  →  Diesel A      (cheapest first)
3.0 / 4.5   12.0       12.0        15.0
```

- Grid: **off-peak 3.0 / peak 4.5** (peak = 09:00–22:00 Mon–Fri).
- Diesel fuel volume is also reported in **litres** (`DIESEL_L_PER_KWH = 0.27`, ~3.7 kWh/L) so plans can be compared as "ทำตามคำแนะนำ vs ไม่ทำตาม".

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.2.6 (App Router, Turbopack) · React 19.2 · Tailwind CSS v4 |
| Charts / Icons | Recharts 3 · Font Awesome 7 |
| HTTP client | Axios (frontend) · httpx / requests (backend) |
| Backend | FastAPI · Python 3.11+ · Pydantic v2 |
| Optimisation | PuLP + bundled CBC solver (MILP dispatch) |
| ML / Forecast | TensorFlow/Keras (LSTM) · scikit-learn · pandas · numpy · scipy · holidays |

---

## Project Structure

```
PEA-PARO/
├── backend/
│   ├── data/
│   │   ├── seed.py             # Grid/asset constants, cost model, seed alerts
│   │   ├── loader.py           # Historical CSV loader + grid-availability series
│   │   ├── forecast_store.py   # Serve forecast CSVs + MAPE/accuracy (lru-cached)
│   │   ├── clock.py            # Simulated demo clock (PEA_SIM_NOW)
│   │   └── forecasts/<A|B|C>/forecast_{6h,7day}.csv   # served forecasts
│   ├── ml/
│   │   ├── predictor.py        # LSTM inference wrapper (per-island, weather-aware)
│   │   ├── forecast_pipeline.py# Rolling backtest → regenerate forecast CSVs (Island C)
│   │   └── artifacts/<A|B|C>/  # trained .keras + scaler + weights (committed)
│   ├── models/
│   │   ├── schemas.py          # Pydantic v2 request/response schemas
│   │   ├── milp_dispatch.py    # MILP solver (PuLP/CBC) — 3-island, 15-min/hourly
│   │   ├── dispatch_optimizer.py# Plan cost breakdown (฿ + diesel litres)
│   │   ├── recommendation.py   # Plan → actionable recommendations, intra-day alerts
│   │   ├── scenario.py         # 3 fixed contingency "what-if" scenarios
│   │   ├── forecasting.py      # Hourly-average baseline forecast (legacy endpoints)
│   │   ├── battery.py / diesel.py / early_warning.py  # asset state machines + rules
│   ├── routers/                # FastAPI routers (see API below)
│   ├── scripts/generate_forecasts.py  # CLI: regenerate Island C forecasts from history
│   ├── tests/                  # pytest suite
│   ├── main.py                 # FastAPI app + CORS + router registration
│   ├── requirements.txt        # full deps (incl. TensorFlow) — local/dev
│   ├── requirements-deploy.txt # slim deps (NO TensorFlow) — Vercel/AWS image
│   ├── requirements-ec2.txt    # slim + TensorFlow — image that runs regeneration
│   ├── Dockerfile              # slim image
│   └── Dockerfile.ec2          # TF image (forecast regeneration)
│
├── ml/prophet_lstm/            # Colab notebook + src/ (preprocess, lstm_model, …)
└── frontend/
    ├── app/                    # layout.js, page.js (tab router), globals.css (design tokens)
    ├── components/
    │   ├── layout/             # TopBar, TabBar, Toast, ExportModal
    │   ├── shared/             # KPICard, SourceCard, StatusBadge, Icon, MiniBar, Dot
    │   ├── operational/        # ApplyPlanDialog
    │   └── tabs/
    │       ├── Tab1LiveOps.js  Tab2Dispatch.js  Tab3Forecast.js  Tab4Alerts.js
    │       ├── dispatch/       # DispatchModeToggle, ForecastChart, ActionTimeline,
    │       │                   #   EmergencyRecommendations, ScenarioCards
    │       └── forecast/       # ForecastRegenerateControl (Phase 2b upload)
    ├── hooks/                  # useRealtime, useDispatch, useForecast(Series),
    │                           #   useRecommendations, useAlerts, useWeather,
    │                           #   useForecastAccuracy, useForecastCapabilities, useApplyPlan
    ├── lib/api.js              # Axios instance + all API helpers
    └── package.json
```

---

## API

| Router | Endpoints |
|--------|-----------|
| realtime | `GET /api/realtime` · `/realtime/events` · `/realtime/load-history` · `/realtime/energy-mix` |
| dispatch | `GET /api/dispatch/{strategy}` · `GET /api/dispatch/active` · `POST /api/dispatch/custom` · `POST /api/dispatch/apply` |
| dispatch (day-ahead) | `GET /api/dispatch/day-ahead?strategy=baseline\|min-cost&days=1..7` (MILP plan + cost + recommendations) |
| forecast (series/ML) | `GET /api/forecast/series?horizon=6h\|7day` · `GET /api/forecast/accuracy` (MAPE) · `GET /api/forecast/capabilities` · `POST /api/forecast/regenerate` (upload) |
| forecast (legacy) | `GET /api/forecast?hours=` · `GET /api/forecast/7days` · `POST /api/ml-forecast` |
| intra-day | `POST /api/intraday/alerts` (T1/T2/T3) · `POST /api/intraday/scenarios` (3 contingencies) |
| alerts | `GET /api/alerts` · `PATCH /api/alerts/{id}/resolve` |
| weather | `GET /api/weather` |
| notify | `GET /api/notify/status` · `POST /api/notify/line` (LINE Messaging API) |
| report | `GET /api/report?scope=&tab=&format=html` |
| health | `GET /` · `GET /api/health` |

Interactive docs: `http://localhost:8000/docs`.

---

## Getting Started

### 1. Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# Install dependencies (full set incl. TensorFlow for the ML/regeneration path)
pip install -r requirements.txt

# Start the API server (Windows: venv\Scripts\python.exe -m uvicorn ...)
uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

Run tests: `python -m pytest -v`

### 2. Frontend

```bash
cd frontend
npm install      # first clone only
npm run dev
```

Open http://localhost:3000

---

## Deployment

Two backend image variants share the same app code:

| Image | Deps | TensorFlow | Forecast regeneration |
|-------|------|:---------:|-----------------------|
| **Slim** (`Dockerfile`, `requirements-deploy.txt`) | runtime only | ❌ | disabled → `POST /api/forecast/regenerate` returns **503**, UI hides the control |
| **EC2** (`Dockerfile.ec2`, `requirements-ec2.txt`) | runtime + TF + holidays | ✅ | enabled → regeneration runs server-side (~30–60 s) |

Vercel and the default AWS deploy use the slim image and **degrade gracefully** (the upload control is hidden via `GET /api/forecast/capabilities`). The committed Island-C model artifacts ship inside both images. See `DEPLOY.md` for details.

---

## Features

| Tab | Description |
|-----|-------------|
| **หน้าหลัก** · Real-time | Live KPIs (load, battery SoC, Line 6 utilisation), energy-mix chart, load history, grid-topology diagram |
| **แผนการจ่ายไฟ** · Dispatch | **Day-ahead** (MILP plan, baseline vs min-cost, action timeline, cost in ฿ **and diesel litres**) and **Intra-day** (next-6h forecast, emergency recommendations T1/T2/T3, 3 contingency "what-if" scenario cards) modes; custom plan builder; stacked dispatch chart |
| **พยากรณ์โหลด** · Forecast | LSTM 15-min forecast vs Line 6 cap, **MAPE · LSTM+Margin** badge, optional weather/solar overlay, 24h dispatch + cost breakdown, 7-day outlook, and (TF deployments) **upload historical → regenerate forecast** |
| **การแจ้งเตือน** · Alerts | Early-warning alerts with inline resolve workflow; optional LINE push notifications |

### Forecasting (ML)

- **Model:** LSTM (Prophet + LSTM ensemble, LSTM-only since `w2 = 0`), 96-step / 24 h horizon at 15-min resolution, with a calibrated **safety margin** (`LSTM+Margin`) — the conservative forecast dispatch actually uses.
- **Accuracy:** MAPE backtest target **≤ 10 %** (Island A 4.15 % / B 6.65 % / C 5.51 % on LSTM+Margin), surfaced live from the served CSV via `/api/forecast/accuracy`.
- **Regeneration:** upload a `Historical_Load_All`-style CSV (or run `scripts/generate_forecasts.py`) to re-run the model and refresh the served Island-C forecasts.

### Early Warning Rules

| Condition | Level |
|-----------|-------|
| Line 6 utilisation ≥ 90 % | 🔴 High |
| Line 6 utilisation ≥ 75 % | 🟡 Medium |
| Battery SoC < 20 % (discharge window 09:00–21:59) | 🔴 High |
| Battery SoC < 30 % (discharge window) | 🟡 Medium |
| Diesel run-time ≥ 90 % of 12 h max-up (~10.8 h) | 🟡 Medium |
| Forecast peak > 95 % of Line 6 cap **and** SoC < 40 % | 🔴 High |

---

## Colour Palette

| Token | Dark Theme | Light Theme |
|-------|-----------|-------------|
| Background | `#0e0020` deep purple | `#fef4d0` golden cream |
| Primary accent | `#d040b8` bright magenta | `#740460` deep magenta |
| Secondary | `#c7911b` golden amber | `#a86e08` deep gold |

---

## License

Internal use — PEA Pitching Challenge 2026
