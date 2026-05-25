import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Input, LSTM, Dense, Dropout
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import ReduceLROnPlateau, EarlyStopping
from tensorflow.keras.regularizers import l2


def build_lstm(n_features: int, lookback: int = 96, horizon: int = 96,
               dropout: float = 0.3, l2_reg: float = 1e-4) -> tf.keras.Model:
    """Build a 2-layer LSTM for multi-step forecasting.

    Args:
        n_features: Number of input features per timestep (16 as of Round 16).
        lookback:   Input sequence length (96 = 24 h at 15-min).
                    Round 15 tried 192 but hurt performance on limited island data.
        horizon:    Output sequence length (96 = next 24 hours).
        dropout:    Dropout rate after first LSTM layer (0.3).
                    Layer-2 dropout = dropout * 0.3 (~0.09) — kept from Round 15.
        l2_reg:     L2 regularization strength on LSTM kernel weights.

    Returns:
        Compiled Keras Sequential model.

    Changes vs Round 15:
        - lookback default 192 → 96 (48 h window hurt; too few training samples)
        - n_features 17 → 16 (lag_288 removed — noise on Koh Tao load pattern)
        - Layer-2 Dropout dropout*0.3 (0.09) — unchanged from Round 15
        - ReduceLROnPlateau patience 15 — unchanged from Round 15
    """
    model = Sequential([
        Input(shape=(lookback, n_features)),
        LSTM(100, return_sequences=True, kernel_regularizer=l2(l2_reg)),
        Dropout(dropout),                  # 0.30 — same as Round 14
        LSTM(100, return_sequences=False, kernel_regularizer=l2(l2_reg)),
        Dropout(dropout * 0.3),            # 0.09 — was dropout/2=0.15 in Round 14
        Dense(horizon),
    ])
    model.compile(optimizer=Adam(learning_rate=0.001), loss='mse')
    return model


def train_lstm(
    model: tf.keras.Model,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    epochs: int     = 50,
    batch_size: int = 32,
) -> tf.keras.callbacks.History:
    """Train the LSTM model with early stopping and LR reduction.

    Returns:
        Keras History object (use history.history to plot loss curves).
    """
    callbacks = [
        ReduceLROnPlateau(monitor='val_loss', factor=0.1, patience=15, verbose=1),
        EarlyStopping(monitor='val_loss', patience=15, restore_best_weights=True, verbose=1),
    ]
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=batch_size,
        callbacks=callbacks,
        verbose=1,
    )
    return history


def predict_lstm(
    model: tf.keras.Model,
    X: np.ndarray,
    scaler,
    load_c_col_idx: int = 0,
) -> np.ndarray:
    """Predict and inverse-transform back to MW.

    Args:
        model:          Trained Keras model.
        X:              Input sequences, shape (n_samples, lookback, n_features).
        scaler:         The fitted MinMaxScaler from preprocess.fit_scaler().
        load_c_col_idx: Column index of load_c in scaler (default 0).

    Returns:
        Predictions in MW, shape (n_samples, horizon).
    """
    y_scaled = model.predict(X)  # (n_samples, horizon)
    n_features = scaler.n_features_in_
    horizon = y_scaled.shape[1]

    # Reconstruct full-width dummy array for inverse_transform
    dummy = np.zeros((y_scaled.shape[0] * horizon, n_features))
    dummy[:, load_c_col_idx] = y_scaled.flatten()
    inv = scaler.inverse_transform(dummy)[:, load_c_col_idx]
    return inv.reshape(y_scaled.shape)


def save_lstm(model: tf.keras.Model, path: str) -> None:
    """Save model to .keras file."""
    model.save(path)


def load_lstm(path: str) -> tf.keras.Model:
    """Load model from .keras file."""
    return tf.keras.models.load_model(path)
