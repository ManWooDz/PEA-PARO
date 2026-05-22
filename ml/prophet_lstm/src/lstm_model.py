import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import ReduceLROnPlateau, EarlyStopping


def build_lstm(n_features: int, lookback: int = 96, horizon: int = 96) -> tf.keras.Model:
    """Build a 2-layer LSTM for multi-step forecasting.

    Args:
        n_features: Number of input features per timestep (15 in this project).
        lookback:   Input sequence length (96 = 24 hours at 15-min resolution).
        horizon:    Output sequence length (96 = next 24 hours).

    Returns:
        Compiled Keras Sequential model.
    """
    model = Sequential([
        LSTM(100, return_sequences=True, input_shape=(lookback, n_features)),
        Dropout(0.2),
        LSTM(100, return_sequences=False),
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
        ReduceLROnPlateau(monitor='val_loss', factor=0.1, patience=10, verbose=1),
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
