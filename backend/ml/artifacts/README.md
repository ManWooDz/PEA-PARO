# Model Artifacts

Place trained model files here after downloading from Google Colab/Kaggle.

## Steps
1. Run `Prophet_LSTM_IslandC.ipynb` on Colab (Cell 1–11)
2. Download `pea_model_artifacts.zip` (auto-triggered at end of Cell 11)
3. Extract here: `backend/ml/artifacts/`

## Required files
- `lstm_island_c.keras`   — Trained Keras LSTM model
- `prophet_model.pkl`     — Fitted Prophet model (pickle)
- `scaler.pkl`            — Fitted MinMaxScaler (pickle)
- `ensemble_weights.json` — {"w1": 0.xxxx, "w2": 0.xxxx}
- `feature_cols.json`     — Ordered feature column list
