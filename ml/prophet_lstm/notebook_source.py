# ml/prophet_lstm/notebook_source.py
# Run on Colab: File > Upload notebook, then Runtime > Run all

# %% [markdown]
# # Prophet + LSTM Hybrid — Island C (Koh Tao) Load Forecast
# **Reference:** Albahli (2025), Energies 18(2), 278
# **Target:** Forecast next 24 hours (96 × 15-min steps) of Island C electrical load

# %% [markdown]
# ## Cell 1 — Install Dependencies (Colab/Kaggle)

# %%
import subprocess, sys
pkgs = [
    "prophet", "holidays", "requests",
    "scikit-learn", "tensorflow", "scipy",
    "matplotlib", "pandas", "numpy"
]
subprocess.check_call([sys.executable, "-m", "pip", "install", "-q"] + pkgs)
print("Dependencies ready")

# %% [markdown]
# ## Cell 2 — Google Drive Mount (Colab only — skip on Kaggle)

# %%
import os
IN_COLAB = 'google.colab' in sys.modules
if IN_COLAB:
    from google.colab import drive
    drive.mount('/content/drive')
    PROJECT_ROOT = '/content/drive/MyDrive/PEA-PARO'
else:
    # Kaggle or local: adjust path as needed
    PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

DATA_CSV     = os.path.join(PROJECT_ROOT, 'docs/data/Load profile _1.csv')
WEATHER_CSV  = os.path.join(PROJECT_ROOT, 'ml/prophet_lstm/data/weather_koh_tao.csv')
MODELS_DIR   = os.path.join(PROJECT_ROOT, 'ml/prophet_lstm/models')
RESULTS_DIR  = os.path.join(PROJECT_ROOT, 'ml/prophet_lstm/results')
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

# Add src to path
SRC_DIR = os.path.join(PROJECT_ROOT, 'ml/prophet_lstm')
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

print(f"Project root : {PROJECT_ROOT}")
print(f"Data CSV     : {DATA_CSV}")

# %% [markdown]
# ## Cell 3 — Configuration

# %%
CFG = {
    # Split
    'TRAIN_END':   '2025-11-30 23:45:00',
    'VAL_END':     '2025-12-31 23:45:00',
    # LSTM
    'LOOKBACK':    96,   # 24 h at 15-min
    'HORIZON':     96,   # forecast 24 h ahead
    'N_FEATURES':  15,
    'LSTM_UNITS':  100,
    'DROPOUT':     0.3,   # เพิ่มจาก 0.2 เพื่อลด overfitting
    'LR':          0.001,
    'EPOCHS':      80,    # เพิ่มจาก 50 ให้ EarlyStopping มีพื้นที่มากขึ้น
    'BATCH_SIZE':  32,
    # Koh Tao coordinates for weather
    'LAT':         10.10,
    'LON':         99.84,
    'WEATHER_START': '2025-01-01',
    'WEATHER_END':   '2026-02-28',
}
print("Config loaded:", CFG)

# %% [markdown]
# ## Cell 4 — Load & Fetch Weather Data

# %%
import pandas as pd
import numpy as np
from src.weather_fetch import fetch_weather
from src.preprocess import load_raw_data, add_temporal_features, split_data

# Load Island C data
df_load = load_raw_data(DATA_CSV)
print(f"Load data: {len(df_load)} rows, {df_load.index[0]} → {df_load.index[-1]}")

# Fetch (or load cached) weather
df_weather = fetch_weather(
    lat=CFG['LAT'], lon=CFG['LON'],
    start=CFG['WEATHER_START'], end=CFG['WEATHER_END'],
    cache_path=WEATHER_CSV
)
print(f"Weather data: {len(df_weather)} rows")

# Merge on datetime index
df = df_load.join(df_weather, how='left')
df[['temperature_2m','relativehumidity_2m','windspeed_10m','precipitation']] = \
    df[['temperature_2m','relativehumidity_2m','windspeed_10m','precipitation']].ffill()

print(f"Merged: {df.shape}, nulls: {df.isnull().sum().sum()}")

# %% [markdown]
# ## Cell 5 — Feature Engineering & Split

# %%
from src.preprocess import add_temporal_features, split_data, fit_scaler, scale, make_sequences, FEATURE_COLS

df = add_temporal_features(df)
df = df.dropna(subset=FEATURE_COLS)  # drop rows with NaN lag features (first 672 rows)

train, val, test = split_data(df, CFG['TRAIN_END'], CFG['VAL_END'])
print(f"Train: {len(train)}  Val: {len(val)}  Test: {len(test)}")

# Fit scaler on TRAIN only
scaler = fit_scaler(train)

# Scale each set
train_scaled = scale(train, scaler)
val_scaled   = scale(val,   scaler)
test_scaled  = scale(test,  scaler)

# Sequences
X_train, y_train = make_sequences(train_scaled, CFG['LOOKBACK'], CFG['HORIZON'])
X_val,   y_val   = make_sequences(val_scaled,   CFG['LOOKBACK'], CFG['HORIZON'])
X_test,  y_test  = make_sequences(test_scaled,  CFG['LOOKBACK'], CFG['HORIZON'])

print(f"X_train: {X_train.shape}  y_train: {y_train.shape}")
print(f"X_val:   {X_val.shape}    y_val:   {y_val.shape}")
print(f"X_test:  {X_test.shape}   y_test:  {y_test.shape}")

# %% [markdown]
# ## Cell 6 — Train Prophet

# %%
from src.prophet_model import df_to_prophet, train_prophet, predict_prophet, get_components

train_prophet_df = df_to_prophet(train)
val_prophet_df   = df_to_prophet(val)
test_prophet_df  = df_to_prophet(test)

prophet_model = train_prophet(train_prophet_df)

# Predict on val and test
y_val_prophet_flat  = predict_prophet(prophet_model, val_prophet_df.drop('y', axis=1))
y_test_prophet_flat = predict_prophet(prophet_model, test_prophet_df.drop('y', axis=1))

# Reshape to match LSTM output: (n_windows, horizon)
# Trim to match sequence count
n_val_seq  = len(X_val)
n_test_seq = len(X_test)
lookback   = CFG['LOOKBACK']
horizon    = CFG['HORIZON']

y_val_prophet  = np.array([y_val_prophet_flat[i:i+horizon]  for i in range(n_val_seq)])
y_test_prophet = np.array([y_test_prophet_flat[i:i+horizon] for i in range(n_test_seq)])

print(f"Prophet val predictions:  {y_val_prophet.shape}")
print(f"Prophet test predictions: {y_test_prophet.shape}")

# Plot components
components = get_components(prophet_model, train_prophet_df)
prophet_model.plot_components(components)

# %% [markdown]
# ## Cell 7 — Train LSTM

# %%
import tensorflow as tf
print("GPU available:", tf.config.list_physical_devices('GPU'))

from src.lstm_model import build_lstm, train_lstm, predict_lstm, save_lstm

lstm_model = build_lstm(
    n_features=CFG['N_FEATURES'],
    lookback=CFG['LOOKBACK'],
    horizon=CFG['HORIZON'],
    dropout=CFG['DROPOUT'],
)
lstm_model.summary()

history = train_lstm(
    lstm_model, X_train, y_train, X_val, y_val,
    epochs=CFG['EPOCHS'], batch_size=CFG['BATCH_SIZE']
)

# Save model
lstm_save_path = os.path.join(MODELS_DIR, 'lstm_island_c.keras')
save_lstm(lstm_model, lstm_save_path)
print(f"LSTM saved to {lstm_save_path}")

# Predict (inverse-transformed to MW)
y_val_lstm  = predict_lstm(lstm_model, X_val,  scaler)
y_test_lstm = predict_lstm(lstm_model, X_test, scaler)

print(f"LSTM val predictions:  {y_val_lstm.shape}")
print(f"LSTM test predictions: {y_test_lstm.shape}")

# %% [markdown]
# ## Cell 8 — Optimize Ensemble Weights

# %%
from src.ensemble import optimize_weights, ensemble_predict

# Ground truth: inverse-scale y_val (col 0 = load_c)
n_features = scaler.n_features_in_
dummy = np.zeros((y_val.size, n_features))
dummy[:, 0] = y_val.flatten()
y_val_true = scaler.inverse_transform(dummy)[:, 0].reshape(y_val.shape)

# Optimize on validation set
w1, w2 = optimize_weights(y_val_true, y_val_lstm, y_val_prophet)
print(f"Optimal weights — w1 (LSTM): {w1:.4f}  w2 (Prophet): {w2:.4f}")

# Apply to validation set
y_val_hybrid = ensemble_predict(y_val_lstm, y_val_prophet, w1, w2)

# %% [markdown]
# ## Cell 9 — Evaluate on Val Set

# %%
from src.evaluate import evaluation_report, plot_forecast, plot_learning_curves

# Ground truth for test
dummy_test = np.zeros((y_test.size, n_features))
dummy_test[:, 0] = y_test.flatten()
y_test_true = scaler.inverse_transform(dummy_test)[:, 0].reshape(y_test.shape)

y_test_hybrid = ensemble_predict(y_test_lstm, y_test_prophet, w1, w2)

# Val metrics
val_report = evaluation_report(
    y_val_true.flatten(), y_val_lstm.flatten(),
    y_val_prophet.flatten(), y_val_hybrid.flatten(), label='Val'
)
print("\n=== Validation Metrics ===")
print(val_report.to_string(index=False))

# Test metrics
test_report = evaluation_report(
    y_test_true.flatten(), y_test_lstm.flatten(),
    y_test_prophet.flatten(), y_test_hybrid.flatten(), label='Test'
)
print("\n=== Test Metrics ===")
print(test_report.to_string(index=False))

# Save metrics
test_report.to_csv(os.path.join(RESULTS_DIR, 'test_metrics.csv'), index=False)

# Plot learning curves
plot_learning_curves(history, save_path=os.path.join(RESULTS_DIR, 'learning_curves.png'))

# %% [markdown]
# ## Cell 10 — Forecast Plots

# %%
# Use test set first window for visualization (first 7 days)
plot_steps = 96 * 7  # 7 days

test_index = test.index[lookback: lookback + plot_steps]

plot_forecast(
    index      = test_index,
    y_true     = y_test_true.flatten()[:plot_steps],
    y_hybrid   = y_test_hybrid.flatten()[:plot_steps],
    y_lstm     = y_test_lstm.flatten()[:plot_steps],
    y_prophet  = y_test_prophet.flatten()[:plot_steps],
    title      = 'Island C (Koh Tao) — 7-Day Forecast (Test Set)',
    save_path  = os.path.join(RESULTS_DIR, 'forecast_7day.png'),
)

# Save forecast data as CSV for interactive visualization later
forecast_df = pd.DataFrame({
    'datetime': test_index,
    'actual':   y_test_true.flatten()[:plot_steps],
    'hybrid':   y_test_hybrid.flatten()[:plot_steps],
    'lstm':     y_test_lstm.flatten()[:plot_steps],
    'prophet':  y_test_prophet.flatten()[:plot_steps],
})
forecast_csv_path = os.path.join(RESULTS_DIR, 'forecast_7day.csv')
forecast_df.to_csv(forecast_csv_path, index=False)
print(f"Forecast data saved: {forecast_csv_path}  ({len(forecast_df)} rows)")

# Save full test set (not just 7 days) for deeper analysis
full_forecast_df = pd.DataFrame({
    'datetime': test.index[lookback: lookback + len(y_test_true.flatten())],
    'actual':   y_test_true.flatten(),
    'hybrid':   y_test_hybrid.flatten(),
    'lstm':     y_test_lstm.flatten(),
    'prophet':  y_test_prophet.flatten(),
})
full_forecast_df.to_csv(os.path.join(RESULTS_DIR, 'forecast_full_test.csv'), index=False)
print(f"Full test forecast saved: {len(full_forecast_df)} rows")

print("All results saved to:", RESULTS_DIR)

# %% [markdown]
# ## Cell 11 — Save All Artifacts for Backend

# %%
import pickle, json, os

# 1. Save LSTM (already saved in Cell 7 as lstm_island_c.keras)

# 2. Save Prophet model
with open(os.path.join(MODELS_DIR, 'prophet_model.pkl'), 'wb') as f:
    pickle.dump(prophet_model, f)
print("Prophet model saved")

# 3. Save MinMaxScaler
with open(os.path.join(MODELS_DIR, 'scaler.pkl'), 'wb') as f:
    pickle.dump(scaler, f)
print("Scaler saved")

# 4. Save ensemble weights
with open(os.path.join(MODELS_DIR, 'ensemble_weights.json'), 'w') as f:
    json.dump({'w1': w1, 'w2': w2}, f, indent=2)
print(f"Ensemble weights saved: w1={w1:.4f}, w2={w2:.4f}")

# 5. Save feature column list (needed for scaler ordering)
with open(os.path.join(MODELS_DIR, 'feature_cols.json'), 'w') as f:
    from src.preprocess import FEATURE_COLS
    json.dump(FEATURE_COLS, f, indent=2)
print("Feature columns saved")

print("\n=== Artifacts ready for download ===")
print(f"  {MODELS_DIR}/lstm_island_c.keras")
print(f"  {MODELS_DIR}/prophet_model.pkl")
print(f"  {MODELS_DIR}/scaler.pkl")
print(f"  {MODELS_DIR}/ensemble_weights.json")
print(f"  {MODELS_DIR}/feature_cols.json")

# On Colab: zip and download
if IN_COLAB:
    import shutil
    shutil.make_archive('/content/pea_model_artifacts', 'zip', MODELS_DIR)
    from google.colab import files
    files.download('/content/pea_model_artifacts.zip')

# %% [markdown]
# ## Cell 12 — Interactive Forecast Chart (toggle แต่ละเส้นได้)

# %%
import pandas as pd
import plotly.graph_objects as go

# โหลด CSV ที่เซฟไว้ใน Cell 10
forecast_df = pd.read_csv(os.path.join(RESULTS_DIR, 'forecast_7day.csv'), parse_dates=['datetime'])

fig = go.Figure()

fig.add_trace(go.Scatter(
    x=forecast_df['datetime'], y=forecast_df['actual'],
    name='Actual', line=dict(color='black', width=2),
))
fig.add_trace(go.Scatter(
    x=forecast_df['datetime'], y=forecast_df['hybrid'],
    name='Hybrid', line=dict(color='royalblue', width=1.5),
))
fig.add_trace(go.Scatter(
    x=forecast_df['datetime'], y=forecast_df['lstm'],
    name='LSTM', line=dict(color='orange', width=1.2, dash='dash'),
))
fig.add_trace(go.Scatter(
    x=forecast_df['datetime'], y=forecast_df['prophet'],
    name='Prophet', line=dict(color='green', width=1.2, dash='dot'),
))

fig.update_layout(
    title='Island C (Koh Tao) — 7-Day Load Forecast vs Actual',
    xaxis_title='Datetime',
    yaxis_title='Load (MW)',
    hovermode='x unified',        # hover แสดงทุกเส้นพร้อมกัน
    legend=dict(
        orientation='h',          # legend แนวนอน
        yanchor='bottom', y=1.02,
        xanchor='right',  x=1,
    ),
    template='plotly_white',
)

# Range selector — เลือกดูช่วงเวลาได้
fig.update_xaxes(
    rangeslider_visible=True,
    rangeselector=dict(buttons=[
        dict(count=1,  label='1d', step='day',  stepmode='backward'),
        dict(count=3,  label='3d', step='day',  stepmode='backward'),
        dict(count=7,  label='7d', step='day',  stepmode='backward'),
        dict(step='all', label='All'),
    ])
)

fig.show()
print("💡 คลิกชื่อใน Legend เพื่อ toggle แต่ละเส้น | ลาก Slider ด้านล่างเพื่อ zoom")

# Save เป็น HTML ไฟล์เดียว — เปิดใน browser ได้เลย ไม่ต้องมี server
html_path = os.path.join(RESULTS_DIR, 'forecast_interactive.html')
fig.write_html(html_path, include_plotlyjs='cdn')
print(f"✅ Saved: {html_path}")

# Download ลงเครื่องทันที (Colab only)
if IN_COLAB:
    from google.colab import files
    files.download(html_path)
