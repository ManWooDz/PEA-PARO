# PEA-PARO

**Power Autonomous Resource Optimizer**  
Energy Management System for a 3-Island Cascading Grid — PEA Pitching Challenge

---

## Overview

PEA-PARO is a full-stack EMS dashboard that monitors, forecasts, and optimises dispatch for a 3-island cascading grid topology:

```
Main Land ──L1/2/3──► Island A ──L4/5──► Island B ──L6 (8 MW)──► Island C
```

**Key constraint:** Line 6 is a 33 kV submarine cable capped at **8 MW** — the primary bottleneck for Island C supply.

### Assets

| Asset | Location | Capacity | Notes |
|-------|----------|----------|-------|
| Battery #7 | Island A | 12.5 MW / 30 MWh | Charge 22:00–08:59, discharge 09:00–21:59 |
| Diesel #8 | Island A | 15 MW (3×5 MW) | Ramp 1 %/s, min-down 10 min |
| Diesel #9 | Island C | 5 MW (2×2.5 MW) | Ramp 3 %/s, min-down 10 min |

### Merit-Order Dispatch (cheapest first)

```
Grid  →  Battery  →  Diesel C  →  Diesel A
3–4.5 ฿    12 ฿        12 ฿         15 ฿   (Token/kWh)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS v4 |
| Charts | Recharts |
| Backend | FastAPI · Python 3.11+ · Pydantic v2 |
| ML | scikit-learn · pandas · numpy (load forecasting + K-Means clustering) |
| HTTP client | Axios (frontend) · httpx (backend) |

---

## Project Structure

```
PEA-PARO/
├── backend/
│   ├── data/
│   │   ├── seed.py          # Grid constants, cost model, initial alert data
│   │   └── loader.py        # CSV loader / synthetic data generator
│   ├── models/
│   │   ├── schemas.py        # Pydantic v2 request/response schemas
│   │   ├── forecasting.py    # Hourly-average load forecasting model
│   │   ├── battery.py        # Battery SoC state machine
│   │   ├── diesel.py         # Diesel unit commitment (ramp + min-down)
│   │   ├── dispatch_optimizer.py  # 4 strategies: baseline / min-cost / reliability / eco
│   │   └── early_warning.py  # Line 6, SoC, diesel, forecast breach checks
│   ├── routers/
│   │   ├── realtime.py       # GET /api/realtime, /load-history, /energy-mix
│   │   ├── dispatch.py       # GET /api/dispatch/{strategy}, POST /api/dispatch/custom
│   │   ├── forecast.py       # GET /api/forecast, /api/forecast/7days
│   │   └── alerts.py         # GET /api/alerts, PATCH /api/alerts/{id}/resolve
│   ├── main.py               # FastAPI app + CORS + router registration
│   └── requirements.txt
│
└── frontend/
    ├── app/
    │   ├── layout.js         # Root layout, Google Fonts
    │   ├── page.js           # Main EMS app (tab router, hooks, modals)
    │   └── globals.css       # PEA-PARO design tokens (dark purple / golden themes)
    ├── components/
    │   ├── layout/           # TopBar, TabBar, Toast, ExportModal
    │   ├── shared/           # KPICard, SourceCard, GridTopology, StatusBadge, Icon…
    │   └── tabs/             # Tab1Dashboard, Tab2Dispatch, Tab3Forecast, Tab4Alerts
    ├── hooks/                # useRealtime, useDispatch, useForecast, useAlerts
    ├── lib/api.js             # Axios instance + all API helper functions
    └── package.json
```

---

## Getting Started

### 1. Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend

# Install dependencies (only needed on first clone)
npm install

# Start dev server
npm run dev
```

Open http://localhost:3000

---

## Features

| Tab | Description |
|-----|-------------|
| **หน้าหลัก** (Real-time) | Live KPIs (load, battery SoC, Line 6 utilisation), energy-mix chart, load history, grid topology diagram |
| **แผนการจ่ายไฟ** (Dispatch) | 4 dispatch strategies + custom plan builder (share sliders + time windows), 24h stacked bar chart, cost breakdown, hourly table |
| **พยากรณ์โหลด** (Forecast) | Short-term (6/12/24/48h) + 7-day forecasts, model metrics (MAE/RMSE), Line 6 risk table |
| **การแจ้งเตือน** (Alerts) | Early-warning alerts (Line 6 > 90 %, low SoC, diesel hours, demand breach) with inline resolve workflow |

### Early Warning Rules

| Condition | Level |
|-----------|-------|
| Line 6 utilisation > 90 % | 🔴 High |
| Line 6 utilisation > 75 % | 🟡 Medium |
| Battery SoC < 20 % | 🔴 High |
| Battery SoC < 30 % | 🟡 Medium |
| Diesel running > 10 h | 🟡 Medium |
| Forecast breach of Line 6 cap | 🔴 High |

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
