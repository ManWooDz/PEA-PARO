# ml/prophet_lstm/src/prophet_model.py
import pandas as pd
import numpy as np
from prophet import Prophet

PROPHET_REGRESSORS = [
    'temperature_2m', 'relativehumidity_2m', 'windspeed_10m', 'precipitation',
    'is_weekend', 'lag_96', 'lag_672',
    'hour_sin', 'hour_cos', 'dow_sin', 'dow_cos', 'month_sin', 'month_cos'
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
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=True,
        interval_width=0.8,
        changepoint_prior_scale=0.05,
    )
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
