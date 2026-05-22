# backend/ml/predictor.py
"""
Backend inference wrapper.
Artifacts expected at: backend/ml/artifacts/
  lstm_island_c.keras
  prophet_model.pkl
  scaler.pkl
  ensemble_weights.json
  feature_cols.json

After training on Colab:
  1. Download pea_model_artifacts.zip (auto-triggered at end of Cell 11)
  2. Extract to backend/ml/artifacts/
  3. Restart FastAPI server
"""
import pickle, json
import numpy as np
import pandas as pd
from pathlib import Path
import tensorflow as tf

ARTIFACTS_DIR = Path(__file__).parent / 'artifacts'

# --- Lazy singleton ---
_predictor = None


def _load():
    global _predictor
    if _predictor is None:
        _predictor = _BackendPredictor(ARTIFACTS_DIR)
    return _predictor


class _BackendPredictor:
    def __init__(self, artifacts_dir: Path):
        if not artifacts_dir.exists():
            raise FileNotFoundError(
                f"Artifacts not found at {artifacts_dir}. "
                "Train on Colab and extract pea_model_artifacts.zip here."
            )
        self.lstm = tf.keras.models.load_model(artifacts_dir / 'lstm_island_c.keras')
        with open(artifacts_dir / 'prophet_model.pkl', 'rb') as f:
            self.prophet = pickle.load(f)
        with open(artifacts_dir / 'scaler.pkl', 'rb') as f:
            self.scaler = pickle.load(f)
        with open(artifacts_dir / 'ensemble_weights.json') as f:
            w = json.load(f)
        self.w1, self.w2 = w['w1'], w['w2']
        self.horizon  = 96
        self.lookback = 96

    def predict_next_24h(self, recent_df: pd.DataFrame) -> list[dict]:
        """Return list of 96 dicts: {datetime: str, load_mw: float}.

        recent_df must be a DataFrame (indexed by datetime) with the
        same columns produced by preprocess.add_temporal_features().
        """
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'ml' / 'prophet_lstm'))
        from src.preprocess import scale, make_sequences, FEATURE_COLS
        from src.prophet_model import df_to_prophet, predict_prophet
        from src.ensemble import ensemble_predict

        # LSTM
        scaled = scale(recent_df.tail(self.lookback + self.horizon), self.scaler)
        X, _ = make_sequences(scaled, self.lookback, self.horizon)
        n_feat = self.scaler.n_features_in_
        y_sc = self.lstm.predict(X[-1:])
        dummy = np.zeros((self.horizon, n_feat))
        dummy[:, 0] = y_sc.flatten()
        y_lstm = self.scaler.inverse_transform(dummy)[:, 0]

        # Prophet
        last_ts = recent_df.index[-1]
        fut_idx = pd.date_range(last_ts + pd.Timedelta('15min'),
                                periods=self.horizon, freq='15min')
        fut_df = recent_df.tail(1).reindex(fut_idx, method='ffill')
        fut_df.index.name = 'datetime'
        prophet_in = df_to_prophet(fut_df).drop('y', axis=1, errors='ignore')
        y_prophet = predict_prophet(self.prophet, prophet_in)

        y_final = ensemble_predict(y_lstm, y_prophet, self.w1, self.w2)

        return [
            {'datetime': str(ts), 'load_mw': round(float(v), 4)}
            for ts, v in zip(fut_idx, y_final)
        ]


def predict_next_24h(recent_df: pd.DataFrame) -> list[dict]:
    """Public API — call from FastAPI router."""
    return _load().predict_next_24h(recent_df)
