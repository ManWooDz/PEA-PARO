# backend/routers/ml_forecast.py
"""
ML-based hybrid forecast router.
POST /api/ml-forecast  — run Prophet+LSTM hybrid, returns 96-step load forecast
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd

router = APIRouter(prefix="/api", tags=["ml-forecast"])


class MLForecastRequest(BaseModel):
    """
    recent_data: list of the last 192+ rows (≥ 48h) of 15-min load/feature data.
    Each row must contain:
      datetime, load_c, temperature_2m, relativehumidity_2m,
      windspeed_10m, precipitation
    """
    recent_data: list[dict]


class ForecastPoint(BaseModel):
    datetime: str
    load_mw: float


class MLForecastResponse(BaseModel):
    island: str = "C (Koh Tao)"
    horizon_steps: int = 96
    resolution_minutes: int = 15
    forecast: list[ForecastPoint]


@router.post("/ml-forecast", response_model=MLForecastResponse)
def get_ml_forecast(req: MLForecastRequest):
    """
    Forecast Island C load for the next 24 hours (96 × 15-min steps)
    using the trained Prophet+LSTM hybrid model.

    Provide at least 192 rows of recent 15-min data (48 hours).
    Returns 96 forecast points.

    Requires model artifacts in backend/ml/artifacts/ — train on Colab first.
    """
    if len(req.recent_data) < 192:
        raise HTTPException(
            status_code=422,
            detail=f"Need at least 192 rows (48 h). Got {len(req.recent_data)}."
        )

    try:
        from ml.predictor import predict_next_24h
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))

    import sys
    from pathlib import Path
    ml_src = str(Path(__file__).parent.parent.parent / 'ml' / 'prophet_lstm')
    if ml_src not in sys.path:
        sys.path.insert(0, ml_src)

    from src.preprocess import add_temporal_features

    df = pd.DataFrame(req.recent_data)
    df['datetime'] = pd.to_datetime(df['datetime'])
    df = df.set_index('datetime').sort_index()
    df = add_temporal_features(df)

    results = predict_next_24h(df)
    return MLForecastResponse(forecast=[ForecastPoint(**r) for r in results])
