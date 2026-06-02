"""
Koh Tao / 3-Island EMS — FastAPI Backend
Run: uvicorn main:app --reload --port 8000
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from data.loader import load_historical
# NOTE: ml_forecast (live LSTM) is intentionally NOT registered — runtime serves
# precomputed forecasts from CSV, so TensorFlow isn't needed (keeps the serverless
# bundle small). Install requirements-ml.txt + re-add the router for live inference.
from routers import realtime, dispatch, forecast, alerts, weather, recommendations, notify, report

app = FastAPI(
    title="PEA Island EMS API",
    description="Energy Management System for 3-island cascading grid (PEA Hackathon PoC)",
    version="1.0.0",
)

# CORS origins from env (comma-separated), or "*" to allow all.
# Default keeps local dev working; on Vercel set CORS_ALLOW_ORIGINS to the
# frontend domain (or "*" for the demo).
_origins_env = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").strip()
_allow_origins = ["*"] if _origins_env == "*" else [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=False if _allow_origins == ["*"] else True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
# recommendations must come before dispatch so /api/dispatch/day-ahead
# is matched before the wildcard /api/dispatch/{strategy} route.
app.include_router(recommendations.router)
app.include_router(realtime.router)
app.include_router(dispatch.router)
app.include_router(forecast.router)
app.include_router(alerts.router)
app.include_router(weather.router)
app.include_router(notify.router)
app.include_router(report.router)


@app.on_event("startup")
async def startup_event():
    """Pre-load historical data at startup so first request is fast."""
    df = load_historical()
    print(f"[startup] Historical data ready — {len(df)} rows")


@app.get("/")
def root():
    return {"status": "ok", "message": "PEA Island EMS API is running"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
