# ── PEA-PARO backend (FastAPI + PuLP/CBC MILP) ──────────────────────────────
# Build context = ./backend  (see docker-compose.yml).
# Historical_Load_All.csv is NOT copied here — it is bind-mounted at runtime to
# /app/docs/data (it is gitignored, lives only on the host). The forecast CSVs
# under backend/data/forecasts/ ARE in git, so they get copied with the code.
FROM python:3.11-slim

WORKDIR /app/backend

# Install deps first for layer caching. pandas/numpy/scipy/scikit-learn ship
# manylinux wheels and pulp bundles the CBC binary, so no system build tools needed.
COPY requirements-deploy.txt .
RUN pip install --no-cache-dir -r requirements-deploy.txt

# App code (includes data/forecasts/*.csv which are tracked in git)
COPY . /app/backend/

# Freeze the demo clock to the start of the backtest window (same default the
# app already uses). Override with `-e PEA_SIM_NOW=...` if needed.
ENV PEA_SIM_NOW=2025-12-28T09:15:00
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
