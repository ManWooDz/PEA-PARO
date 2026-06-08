# PEA-PARO — Agent Onboarding / Project Context

> Read this first. It's written for AI coding agents (Codex, Claude, Kiro) picking up
> feature work on this repo. It captures the architecture, the domain model, and the
> **non-obvious gotchas that will bite you** if you don't know them.

---

## 1. What this is

**PEA-PARO** = a Proof-of-Concept **Energy Management System (EMS)** for a **3-island
cascading micro-grid** (Islands A → B → C), built for a hackathon for the Provincial
Electricity Authority (กฟภ.). It forecasts load, plans the cheapest safe dispatch
(grid + battery + diesel) under engineering limits, and gives operators an early-warning
+ a programmable day-ahead schedule.

- **Backend:** Python **FastAPI** (Pydantic v2). MILP economic dispatch via **PuLP + CBC**.
  Load forecasts from a pre-trained **LSTM (+safety margin)**, served from CSVs.
- **Frontend:** **Next.js 16.2.6** (App Router) + **recharts** + **axios**. Mostly Thai UI.
- **UI is 4 tabs:** `liveops` (realtime), `dispatch` (day-ahead + intra-day), `forecast`,
  `alerts`.

The whole demo runs on a **frozen simulation clock** (see §4) so it's deterministic.

---

## 2. The domain model (you need this to not write nonsense)

**Topology:** main grid → Island A → Island B → Island C (radial/cascading). Aggregated
cable limits (MW): grid import ≤ **72**, A→B (`f_AB`) ≤ **34**, B→C (**"Line 6"**, `f_BC`)
≤ **8**. Constraints model **cable limits only** — NOT loss/voltage (out of PoC scope).

**Sources / assets** (`backend/data/seed.py`):
| Asset | Where | Spec | Cost (฿/kWh) |
|---|---|---|---|
| Grid (Line 6 to C) | main | practical cap from historical "Grid" column | peak 4.5 / off-peak 3.0 |
| Battery #7 (BESS) | C | 30 MWh, 12.5 MW, ~25 MWh/day, 20% SoC floor | 12 |
| Diesel #8 | Island A | 3 × 5 MW, ramp 0.01/s | 15 (`diesel_a`) |
| Diesel #9 | Island C | 2 × 2.5 MW, ramp 0.03/s | 12 (`diesel_c`) |

Merit order (min-cost): **Grid → Battery → Diesel #9 → Diesel #8**. Diesel fuel:
`DIESEL_L_PER_KWH = 0.27` L/kWh; startup also burns warm-up fuel (`DIESEL_8/9_STARTUP_LITRES`).
"Token" in older code == ฿ (cost). Battery `battery_mw` is **signed**: + = discharge, − = charge.

---

## 3. Repo map (where things live)

```
backend/
  main.py                      # FastAPI app; registers routers (recommendations BEFORE dispatch)
  data/
    clock.py                   # sim clock: now() — FROZEN to 2025-12-28T09:15 (see §4)
    seed.py                    # COST, asset specs, DIESEL_* constants
    loader.py                  # historical CSV reads, get_grid_availability(ts)
    forecast_store.py          # @lru_cache served forecast CSVs + compute_accuracy (MAPE)
  models/
    milp_dispatch.py           # solve_milp / solve_baseline / aggregate_to_hourly / step_token
    dispatch_optimizer.py      # compute_plan_cost(rows) -> ฿ + diesel litres ; build_dispatch_plan
    schedule_edit.py           # B2 recost: apply MW overrides, balance grid, re-cost (NO re-solve)
    plan_store.py              # B3 in-memory active uploaded plan, keyed by HH:MM
    recommendation.py          # build_recommendations / detect_intraday_alerts / detect_plan_sufficiency
    scenario.py                # intra-day what-if scenarios
    schemas.py                 # ALL Pydantic v2 response models
  routers/
    realtime.py forecast.py dispatch.py recommendations.py alerts.py
    scenario(in recommendations) report.py weather.py notify.py ml_forecast.py
  tests/                       # pytest; see §5
frontend/
  app/page.js                  # shell: TopBar, TabBar, <main>, 4 tabs, data hooks
  app/globals.css              # theme tokens (--bg etc.), light/dark
  components/tabs/             # Tab1..Tab4 + dispatch/ + forecast/ subfolders
  hooks/                       # useRealtime, useDispatch, useForecast, useSchedule, useActivePlan, ...
  lib/api.js                   # axios instance + ALL fetchers. API_BASE here (see §6)
  lib/scheduleCsv.js           # client-side CSV of the schedule
docs/superpowers/{specs,plans} # design specs + impl plans — GITIGNORED (local only, not in repo)
```

---

## 4. CRITICAL gotchas (read every line)

1. **`backend/venv` is BROKEN — it is MISSING `pulp`.** The **default `python` on PATH**
   has everything (`pulp`, `tensorflow`, `fastapi`...). **Always run backend code/tests with
   the plain `python`** (e.g. `python -m pytest ...`), NEVER `backend/venv`'s python. Many
   "pulp not installed" failures are just this.

2. **Frozen sim clock.** `data/clock.py:now()` returns **2025-12-28T09:15:00** (env
   `PEA_SIM_NOW`). So "tomorrow" everywhere = **2025-12-29**. Tests hard-code these dates.
   Don't "fix" them to real time.

3. **`docs/` is gitignored.** Specs/plans you write under `docs/superpowers/` are **local
   only** and never committed. Don't rely on them being in the repo for the next agent —
   put durable context in tracked files (like this one).

4. **Two branches, very different backends:**
   - **`master`** = full app, includes **TensorFlow** + the forecast-**regenerate** endpoint
     (`/api/forecast/regenerate`, `/capabilities`) + the `ForecastRegenerateControl` UI.
   - **`deploy-vercel`** = **serverless-slim**: **no TensorFlow**, regenerate endpoint + its
     TF modules (`ml/forecast_pipeline.py`, `ml/capabilities.py`, `scripts/generate_forecasts.py`)
     and the regenerate UI are **deliberately deleted**; `requirements.txt` is TF-free (keeps
     `pulp`); `api.js` `API_BASE` defaults to same-origin `/_/backend`.
   - **A plain `git merge master` into deploy-vercel re-adds TensorFlow and CRASHES the
     serverless deploy** (`ModuleNotFoundError`). To sync: merge, then re-apply the slimming
     (strip the regenerate endpoint/imports from `routers/recommendations.py`, `git rm` the TF
     modules + regenerate UI, keep `requirements.txt`/`vercel.json`/`api.js` slim). Verify with
     `cd backend && python -c "import main"` and `cd frontend && npm run build`.
     Pure frontend/UI fixes can be `git cherry-pick`ed between branches cleanly.

5. **`compute_plan_cost(rows)` expects HOURLY rows** (1 row = 1 hour). 15-min rows must go
   through `aggregate_to_hourly(rows)` FIRST or the cost is 4× wrong. This is the #1 trap.

6. **Cost math is shared via `step_token(...)`** in `milp_dispatch.py`. The MILP row builder
   and the B2 recost path both use it — don't re-implement per-step ฿ math.

7. **Next.js is non-standard (16.2.6).** See `frontend/AGENTS.md`. Don't assume training-data
   Next.js behavior; don't touch the Next config.

---

## 5. Running / building / testing

```bash
# Backend (from repo root, DEFAULT python — not venv)
cd backend && python -m uvicorn main:app --reload      # serves :8000
python -m pytest backend/tests/ -q                      # full suite (~100+ tests)

# Frontend
cd frontend && npm run dev          # :3000, proxies API to localhost:8000 in dev
cd frontend && npm run build        # MUST pass before committing FE changes
```

- **MILP solves take ~3–15 s** per request (schedule/recost/day-ahead). That is expected,
  not a hang. Tuned with `gapRel=0.01` + a time cap in `milp_dispatch.py`.
- Test files start with `import sys, os; sys.path.insert(0, ...backend)` — run pytest from
  the repo root with the default python. (One known wart: `test_regenerate.py` only collects
  in a full-dir run, not in isolation.)

---

## 6. Frontend conventions

- `lib/api.js`: single axios instance, all fetchers here. `API_BASE` = `NEXT_PUBLIC_API_URL`
  or `http://localhost:8000` (master) / same-origin `/_/backend` in production (deploy-vercel).
- Hooks own the data + a refresh; components are mostly presentational. Loading hooks use an
  `alive`/ref guard to avoid setState-after-unmount.
- Styling: Tailwind utility classes + project CSS tokens (`panel`, `thai`, `mono`, `hairline`,
  `eyebrow`, `text-muted`, `var(--primary)`, `var(--surface-2)`...). Thai labels are intentional.
- **Theme caveat:** `globals.css` sets `html { background: var(--bg) }`, but the light theme
  overrides `--bg` only on `body`. The page shell (`app/page.js`) is `min-h-screen flex flex-col`
  with `<main class="flex-1">` so the white body always covers the dark `<html>` — keep it that
  way or the dark bar reappears at the bottom on short pages.

---

## 7. Key API surface (dispatch + early-warning)

| Endpoint | What |
|---|---|
| `GET /api/realtime`, `/realtime/load-history`, `/realtime/energy-mix` | Tab1 live data |
| `GET /api/forecast/series?horizon=7day\|6h&island=A\|B\|C` | LSTM+Margin forecast vs actual |
| `GET /api/forecast/accuracy?island&horizon` | MAPE (uses `predicted_safe`, ≈5% @6h) |
| `GET /api/dispatch/day-ahead?strategy=min-cost\|baseline&days` | hourly plan + cost + recs |
| `GET /api/dispatch/schedule` / `/schedule.csv` | **B1** tomorrow 15-min schedule (96 steps) + cost |
| `POST /api/dispatch/schedule/recost` | **B2** apply operator MW overrides → re-cost (no re-solve) |
| `POST /api/dispatch/schedule/apply`, `GET /active` | **B3** upload plan as Early-Warning reference |
| `POST /api/intraday/alerts` | Early-Warning T1/T2/T3 + **B3 plan-sufficiency** alert |
| `POST /api/intraday/scenarios` | what-if cards |
| `POST /api/forecast/regenerate`, `GET /capabilities` | **master only** (TF) — absent on deploy-vercel |

Features delivered: **B1** (15-min day-ahead schedule + CSV export), **B2** (edit windows +
re-cost + edited-plan card + client CSV), **B3** (upload edited plan → intra-day sufficiency
check, matched by time-of-day HH:MM). Also: per-island forecasts, 7-day fuel-reserve panel,
diesel ramp/startup in the MILP.

---

## 8. Working conventions

- **Work on `master` directly** (no PR flow for this repo). Branch only if explicitly asked.
- **Commit message trailer** (every commit):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- Prefer TDD for backend logic (write the failing test first). Keep Pydantic schemas in
  `models/schemas.py`. Keep files focused.
- After a change: backend `pytest` green + frontend `npm run build` clean before committing.
- When you finish a feature, **update this file** if you added endpoints, branches diverged
  further, or you discovered a new gotcha.
