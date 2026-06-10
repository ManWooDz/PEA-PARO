# PEA-PARO — Agent Onboarding / Project Context

> Read this first. It's written for AI coding agents (Codex, Claude, Kiro) picking up
> feature work on this repo. It captures the architecture, the domain model, and the
> **non-obvious gotchas that will bite you** if you don't know them.
> Last substantive update: Jun 2026 (post-Kiro session — Grid Topology, combined dispatch
> chart, grid-cap=72, battery≈0 in MILP, EC2 deploy target).

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
  Icons are **Font Awesome** (`@fortawesome/react-fontawesome`), **not** emojis.
- **UI is 4 tabs:** `liveops` (realtime + **Grid Topology** SVG), `dispatch` (day-ahead +
  intra-day), `forecast`, `alerts`.

The whole demo runs on a **frozen simulation clock** (see §4) so it's deterministic.

---

## 2. The domain model (you need this to not write nonsense)

**Topology:** main grid → Island A → Island B → Island C (radial/cascading). Aggregated
cable limits (MW): grid import ≤ **72** (Lines 1+2+3), A→B (`f_AB`) ≤ **34**, B→C
(**"Line 6"**, `f_BC`) ≤ **8**. Constraints model **cable limits only** — NOT loss/voltage.

**Grid availability = a flat 72 MW** (`get_grid_availability()` returns `_GRID_PHYSICAL_CAP`
for every step — the old "read the historical Grid column" lookup was removed). Islands can
request as much grid as they want up to 72 MW; the **cascade limits (A→B ≤ 34, B→C ≤ 8)**
then decide how much actually reaches each island, and local battery/diesel fill the gap
when the bottleneck starves a downstream island.

**Sources / assets** (`backend/data/seed.py`):
| Asset | Where | Spec | Cost (฿/kWh, accounting) |
|---|---|---|---|
| Grid | main | flat 72 MW cap | peak 4.5 / off-peak 3.0 |
| Battery #7 (BESS) | C | 30 MWh, 12.5 MW, ~25 MWh/day, 20% SoC floor | 12 |
| Diesel #8 | Island A | 3 × 5 MW, ramp 0.01/s | 15 (`diesel_a`) |
| Diesel #9 | Island C | 2 × 2.5 MW, ramp 0.03/s | 12 (`diesel_c`) |

⚠️ **Battery has TWO cost numbers** — don't confuse them: the MILP **objective** uses
`milp_dispatch._C_BAT = 0.1` ฿/kWh (marginal cycling wear only, so the solver *prefers
battery over diesel*). The seed `COST["battery"] = 12` is the ฿/kWh **accounting** rate used
by `dispatch_optimizer.compute_plan_cost` for the displayed cost. (If you touch cost display,
sanity-check these two stay coherent.)

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
    seed.py                    # COST, asset specs, DIESEL_* constants, _GRID_PHYSICAL_CAP
    loader.py                  # CSV reads; get_grid_availability(ts)=72; get_current_state()
    forecast_store.py          # @lru_cache served forecast CSVs + compute_accuracy (MAPE)
  models/
    milp_dispatch.py           # solve_milp / solve_baseline / aggregate_to_hourly / step_token (_C_BAT=0.1)
    dispatch_optimizer.py      # compute_plan_cost(rows) -> ฿ + diesel litres ; build_dispatch_plan
    schedule_edit.py           # B2 recost: apply MW overrides, balance grid, re-cost (NO re-solve)
    plan_store.py              # B3 in-memory active uploaded plan, keyed by HH:MM
    recommendation.py          # build_recommendations / detect_intraday_alerts / detect_plan_sufficiency
    scenario.py                # intra-day what-if scenarios (ScenarioCards no longer shown in Tab2)
    schemas.py                 # ALL Pydantic v2 response models
  ml/                          # LSTM predictor + forecast_pipeline + capabilities (TF — master/EC2 only)
  routers/                     # realtime forecast dispatch recommendations alerts report weather notify ml_forecast
  tests/                       # pytest; ~105 tests; see §5
  data/Historical_Load_All.csv # PRESENT on EC2 (downloaded from S3); absent locally → falls back to docs/data/
frontend/
  app/page.js                  # shell: min-h-screen flex flex-col; TopBar, TabBar, <main flex-1>, 4 tabs
  app/globals.css              # theme tokens (--bg etc.), light/dark
  components/tabs/
    Tab1LiveOps.js             # realtime KPIs + Load Profile (15-min, A/B/C) + Energy Mix (4 sources)
    Tab2Dispatch.js            # day-ahead (combined ComposedChart) + intra-day
    liveops/GridTopology.js    # SVG 3-island grid diagram (clickable nodes/islands, live flow/util)
    dispatch/                  # DieselScheduleSection, ScheduleEditor, EditedPlanCard,
                               #   FuelReservePanel, IntradayScheduleSection, EmergencyRecommendations, ...
  hooks/                       # useRealtime, useDispatch, useForecast, useSchedule, useActivePlan, ...
  lib/api.js                   # axios instance + ALL fetchers. API_BASE here (see §6)
  lib/scheduleCsv.js           # client-side CSV of the schedule
docs/superpowers/{specs,plans} # design specs + impl plans — GITIGNORED (local only, not in repo)
```

---

## 4. CRITICAL gotchas (read every line)

1. **`backend/venv` is BROKEN — it is MISSING `pulp`.** The **default `python` on PATH**
   has everything. **Always run backend code/tests with the plain `python`** (e.g.
   `python -m pytest ...`), NEVER `backend/venv`'s python. Most "pulp not installed" is this.

2. **Frozen sim clock.** `data/clock.py:now()` returns **2025-12-28T09:15:00** (env
   `PEA_SIM_NOW`; `PEA_LIVE=1` → real wall-clock). So "tomorrow" everywhere = **2025-12-29**.
   Tests hard-code these dates. Don't "fix" them to real time.

3. **`docs/` is gitignored.** Specs/plans under `docs/superpowers/` are **local only**, never
   committed. Put durable context in tracked files (this one).

4. **THREE deploy targets / branches — they intentionally diverge.**
   - **`origin/master`** (ManWooDz/PEA-PARO) = full app **with TensorFlow** + the forecast
     **regenerate** endpoint (`/api/forecast/regenerate`, `/capabilities`) + `ForecastRegenerateControl`.
     `frontend/next.config.mjs` = `output: 'standalone'`.
   - **`origin/deploy-vercel`** = **serverless-slim, NO TensorFlow**: the regenerate endpoint +
     its TF modules (`ml/forecast_pipeline.py`, `ml/capabilities.py`, `scripts/generate_forecasts.py`)
     + the regenerate UI are **deleted**; `requirements.txt` is TF-free (keeps `pulp`); `api.js`
     `API_BASE` defaults to same-origin `/_/backend`. **A plain `git merge master` re-adds TF and
     crashes the serverless deploy** — after merging, re-apply the slimming (strip regenerate
     endpoint/imports, `git rm` TF modules + regenerate UI; keep requirements/vercel.json/api.js
     slim). Verify: `cd backend && python -c "import main"` and `cd frontend && npm run build`.
   - **`new-origin/main`** (ITOTTECH/PARO) = the **EC2** deploy. `next.config.mjs` =
     `output: 'export'` (static HTML). Has 3 **EC2-only files** that must NOT be merged into
     master: `.github/workflows/deploy-ec2.yaml`, `deploy/nginx.conf`, `frontend/next.config.mjs`.
     CI: GitHub Actions SSH → `git fetch+reset` → curl CSV from the S3 public URL
     (`s3://pea-paro/Historical_Load_All.csv`) → `uv pip install` → PM2 → nginx.
   - **Push master → EC2 (`new-origin/main`)** — never merge; do the 3-file swap:
     1. commit + push to `origin master`
     2. create a temp branch from master
     3. checkout the 3 EC2-only files from `new-origin/main`
     4. `git add -A && git commit --amend --no-edit`
     5. `git push new-origin <temp>:main --force`
     6. back to master, delete the temp branch
   - Pure frontend/UI fixes can be `git cherry-pick`ed between branches cleanly.

5. **`compute_plan_cost(rows)` expects HOURLY rows** (1 row = 1 hour). 15-min rows must go
   through `aggregate_to_hourly(rows)` FIRST or the cost is 4× wrong. The #1 trap.

6. **Cost math is shared via `step_token(...)`** in `milp_dispatch.py` (uses `_C_BAT=0.1`).
   The MILP row builder and the B2 recost path both call it — don't re-implement per-step ฿.

7. **Next.js is non-standard (16.2.6).** See `frontend/AGENTS.md`. Don't assume training-data
   Next.js behavior; don't touch the Next config (and note master=standalone vs EC2=export).

---

## 5. Running / building / testing

```bash
# Backend (from repo root, DEFAULT python — not venv)
cd backend && python -m uvicorn main:app --reload      # serves :8000
python -m pytest backend/tests/ -q                      # ~105 tests

# Frontend
cd frontend && npm run dev          # :3000, proxies API to localhost:8000 in dev
cd frontend && npm run build        # MUST pass before committing FE changes
```

- **MILP solves take ~3–15 s** per request (schedule/recost/day-ahead). Expected, not a hang.
  Tuned with `gapRel=0.01` + a time cap in `milp_dispatch.py`.
- Day-ahead 24h min-cost reuses `_solve_tomorrow_schedule()` so the day-ahead chart matches the
  15-min schedule exactly. 7-day dispatch starts at tomorrow 00:00, solves 15-min → aggregates hourly.
- Test files start with `sys.path.insert(0, ...backend)` — run pytest from the repo root with
  the default python.

---

## 6. Frontend conventions

- `lib/api.js`: single axios instance, all fetchers here. `API_BASE` = `NEXT_PUBLIC_API_URL`
  or `http://localhost:8000` (master) / same-origin `/_/backend` in production (deploy-vercel).
- Hooks own the data + a refresh; components are mostly presentational. Loading hooks use an
  `alive`/ref guard to avoid setState-after-unmount.
- **Icons = Font Awesome** (`Icon.js` / `@fortawesome/react-fontawesome`), not emojis.
- Styling: Tailwind utilities + CSS tokens (`panel`, `thai`, `mono`, `hairline`, `eyebrow`,
  `text-muted`, `var(--primary)`, `var(--surface-2)`...). Thai labels are intentional.
- **Theme caveat (fixed — keep it):** `globals.css` sets `html { background: var(--bg) }`, but
  the light theme overrides `--bg` only on `body`, so a short page would show the dark `<html>`
  as a bar at the bottom. `app/page.js` is `min-h-screen flex flex-col` with `<main class="flex-1">`
  so the white body always covers `<html>` — don't revert that.
- **Tab 2 was simplified** (post-Kiro): combined forecast-line + dispatch-bar `ComposedChart`,
  split Grid/BESS-charge bars, on/off timeline strips, a 96-row 15-min schedule table, 4 cost
  cards, simplified FuelReservePanel (min-cost only). **Removed from the dispatch UI:** Custom
  Dispatch sliders, the StrategyCard selector, the "นำแผนไปใช้" button, ScenarioCards/what-if,
  battery-window shading. (Some component files still exist but aren't wired into Tab 2.)

---

## 7. Key API surface (dispatch + early-warning)

| Endpoint | What |
|---|---|
| `GET /api/realtime`, `/realtime/load-history?island=A\|B\|C`, `/realtime/energy-mix` | Tab1 live data (15-min) |
| `GET /api/forecast/series?horizon=7day\|6h&island=A\|B\|C` | LSTM+Margin forecast vs actual |
| `GET /api/forecast/accuracy?island&horizon` | MAPE (uses `predicted_safe`, ≈5% @6h) |
| `GET /api/dispatch/day-ahead?strategy=min-cost\|baseline&days` | hourly plan + cost + recs |
| `GET /api/dispatch/schedule` / `/schedule.csv` | **B1** tomorrow 15-min schedule (96 steps) + cost |
| `GET /api/dispatch/schedule/today` / `/today-full` | intra-day TODAY 15-min schedule |
| `POST /api/dispatch/schedule/recost` | **B2** apply operator MW overrides → re-cost (no re-solve) |
| `POST /api/dispatch/schedule/apply`, `GET /active` | **B3** upload plan as Early-Warning reference |
| `POST /api/intraday/alerts` | Early-Warning T1/T2/T3 + **B3 plan-sufficiency** (only when a plan is uploaded) |
| `GET /api/intraday/plan-actions` | intra-day action timeline derived from the same MILP plan as `/schedule/today` |
| `POST /api/intraday/scenarios` | what-if cards (endpoint exists; cards removed from Tab 2) |
| `POST /api/forecast/regenerate`, `GET /capabilities` | **master / EC2 only** (TF) — absent on deploy-vercel |

Early-Warning events (see `recommendation.py`): **T1** forecast load > grid, **T2** SoC below
floor, **T3** actual deviates from plan >10% (in code but NOT wired — the UI doesn't send
`actual_now/plan_now` yet), **S** plan-sufficiency (only when a plan is uploaded via B3; compares
6h *system* load vs the uploaded plan's capacity at matching HH:MM).

---

## 8. Working conventions

- **Work on `master` directly** (no PR flow). Remotes: `origin` = ManWooDz/PEA-PARO,
  `new-origin` = ITOTTECH/PARO (EC2). Branch only if explicitly asked.
- **Commit message trailer** (every commit):
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- Prefer TDD for backend logic. Keep Pydantic schemas in `models/schemas.py`. Keep files focused.
- After a change: backend `pytest` green + frontend `npm run build` clean before committing.
- When you finish a feature, **update this file** if you added endpoints, branches diverged
  further, or you discovered a new gotcha.
