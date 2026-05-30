"""
Koh Tao / 3-Island EMS — FastAPI Backend
Run: uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from data.loader import load_historical
from routers import realtime, dispatch, forecast, alerts, ml_forecast, weather, recommendations, notify, report

app = FastAPI(
    title="PEA Island EMS API",
    description="Energy Management System for 3-island cascading grid (PEA Hackathon PoC)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
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
app.include_router(ml_forecast.router)
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
