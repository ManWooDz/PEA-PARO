# ml/prophet_lstm/src/prophet_model.py
import pandas as pd
import numpy as np
from prophet import Prophet

PROPHET_REGRESSORS = [
    # Weather — Prophet ไม่รู้เอง ต้องใส่
    'temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation',
    # Calendar — weekend flag ที่ Prophet ไม่ได้ model ตรงๆ
    'is_weekend',
    # ตัดออก: lag_96, lag_672 — มีค่าเป็น MW ทำให้ coefficient บวม → ทำนายสูงเกิน
    # ตัดออก: hour/dow/month sin/cos — ซ้ำซ้อนกับ Prophet's built-in seasonality
]


def df_to_prophet(df: pd.DataFrame) -> pd.DataFrame:
    """Convert indexed DataFrame to Prophet format.

    Input:  DataFrame indexed by datetime, columns include load_c + PROPHET_REGRESSORS
    Output: DataFrame with columns [ds, y, <regressors...>]
    """
    cols_needed = ['load_c'] + PROPHET_REGRESSORS
    out = df[cols_needed].reset_index()
    out = out.rename(columns={'datetime': 'ds', 'load_c': 'y'})
    return out


def train_prophet(prophet_df: pd.DataFrame) -> Prophet:
    """Fit Prophet model on training DataFrame (prophet format).

    Args:
        prophet_df: DataFrame with columns [ds, y] + PROPHET_REGRESSORS

    Returns:
        Fitted Prophet model.
    """
    model = Prophet(
        yearly_seasonality=False,       # ปิด — train data 11 เดือน ไม่พอ fit 365-day Fourier
                                        # yearly_seasonality=True ทำให้ trend+seasonality collinear
                                        # → extrapolate ไป Jan ค่าพุ่ง ~12 MW แทนที่จะเป็น ~3 MW
        weekly_seasonality=True,
        daily_seasonality=False,        # ปิด — ใช้ custom แทนเพื่อควบคุม Fourier order
        interval_width=0.8,
        changepoint_prior_scale=0.05,
    )
    # Custom daily seasonality: fourier_order=6 แทน default ที่สูงเกินไปสำหรับ 15-min data
    model.add_seasonality(name='daily', period=1, fourier_order=6)
    model.add_country_holidays(country_name='TH')
    for col in PROPHET_REGRESSORS:
        model.add_regressor(col)

    model.fit(prophet_df)
    return model


def predict_prophet(model: Prophet, future_df: pd.DataFrame) -> np.ndarray:
    """Generate predictions from a fitted Prophet model.

    Args:
        model:     Fitted Prophet model.
        future_df: DataFrame with columns [ds] + PROPHET_REGRESSORS

    Returns:
        1-D numpy array of predicted values (yhat).
    """
    forecast = model.predict(future_df)
    return forecast['yhat'].values


def get_components(model: Prophet, future_df: pd.DataFrame) -> pd.DataFrame:
    """Return full Prophet forecast with trend + seasonality components for analysis."""
    return model.predict(future_df)
