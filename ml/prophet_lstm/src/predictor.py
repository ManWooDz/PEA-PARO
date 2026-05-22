# ml/prophet_lstm/src/predictor.py
"""
Offline inference module — loads saved artifacts and runs hybrid prediction.

Usage (after downloading artifacts from Colab):
    from src.predictor import HybridPredictor
    p = HybridPredictor(models_dir='models/')
    forecast_mw = p.predict(recent_df)   # shape: (96,)
"""
import pickle, json
import numpy as np
import pandas as pd
from pathlib import Path
import tensorflow as tf

from .preprocess import add_temporal_features, scale, make_sequences, FEATURE_COLS
from .prophet_model import df_to_prophet, predict_prophet
from .ensemble import ensemble_predict


class HybridPredictor:
    """Load trained artifacts once, call predict() repeatedly."""

    def __init__(self, models_dir: str = 'models'):
        models_dir = Path(models_dir)

        self.lstm_model = tf.keras.models.load_model(
            models_dir / 'lstm_island_c.keras'
        )
        with open(models_dir / 'prophet_model.pkl', 'rb') as f:
            self.prophet_model = pickle.load(f)
        with open(models_dir / 'scaler.pkl', 'rb') as f:
            self.scaler = pickle.load(f)
        with open(models_dir / 'ensemble_weights.json') as f:
            weights = json.load(f)
        self.w1 = weights['w1']
        self.w2 = weights['w2']
        self.lookback = 96
        self.horizon  = 96

    def predict(self, recent_df: pd.DataFrame) -> np.ndarray:
        """Forecast next 96 steps (24 h) from a DataFrame of the last 96+ rows.

        Args:
            recent_df: DataFrame indexed by datetime, must have all FEATURE_COLS
                       including weather columns (temperature_2m etc.) and lag features.
                       Must contain at least `lookback` rows.

        Returns:
            1-D numpy array of predicted load_c values in MW, length = 96.
        """
        # LSTM path
        scaled = scale(recent_df.tail(self.lookback + self.horizon), self.scaler)
        X, _ = make_sequences(scaled, self.lookback, self.horizon)
        if len(X) == 0:
            raise ValueError(f"recent_df must have at least {self.lookback + self.horizon} rows")

        n_features = self.scaler.n_features_in_
        y_scaled = self.lstm_model.predict(X[-1:])        # (1, 96)
        dummy = np.zeros((self.horizon, n_features))
        dummy[:, 0] = y_scaled.flatten()
        y_lstm = self.scaler.inverse_transform(dummy)[:, 0]  # (96,)

        # Prophet path — build future dataframe (next 96 intervals)
        last_ts = recent_df.index[-1]
        future_idx = pd.date_range(
            start=last_ts + pd.Timedelta('15min'),
            periods=self.horizon,
            freq='15min'
        )
        # Propagate last known weather/feature values forward
        future_df = recent_df.tail(1).reindex(future_idx, method='ffill')
        future_df.index.name = 'datetime'
        prophet_input = df_to_prophet(future_df).drop('y', axis=1, errors='ignore')
        y_prophet = predict_prophet(self.prophet_model, prophet_input)  # (96,)

        return ensemble_predict(y_lstm, y_prophet, self.w1, self.w2)
