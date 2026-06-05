"""Phase 2b — forecast capability + regenerate endpoint tests."""
from fastapi.testclient import TestClient

import main
import routers.recommendations as rec
import ml.capabilities as cap

client = TestClient(main.app)


def test_capabilities_returns_bool_flag():
    r = client.get("/api/forecast/capabilities")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"regenerate_available", "island"}
    assert isinstance(body["regenerate_available"], bool)
    assert body["island"] == "C"


def test_regenerate_available_false_without_tensorflow(monkeypatch):
    # No tensorflow spec → unavailable regardless of artifacts.
    monkeypatch.setattr(cap.importlib.util, "find_spec",
                        lambda name: None if name == "tensorflow" else object())
    assert cap.regenerate_available() is False



import io

_CSV = (
    "Date,Load A,Load B,Load C\n"
    "1/1/2025 00:00,40,11,3\n"
    "1/1/2025 00:15,41,11.2,3.1\n"
)


def _post_csv(text: str = _CSV):
    return client.post(
        "/api/forecast/regenerate",
        files={"file": ("hist.csv", io.BytesIO(text.encode()), "text/csv")},
    )


def test_regenerate_returns_503_when_unavailable(monkeypatch):
    monkeypatch.setattr(rec, "regenerate_available", lambda: False)
    r = _post_csv()
    assert r.status_code == 503
    assert "deployment" in r.json()["detail"] or "ไม่รองรับ" in r.json()["detail"]


def test_regenerate_happy_path_is_tf_free_via_monkeypatch(monkeypatch):
    # Pretend the deployment is capable, and stub the heavy pipeline so no TF runs.
    monkeypatch.setattr(rec, "regenerate_available", lambda: True)

    import pandas as pd
    fake_df = pd.DataFrame({"load_c_mw": [3.0, 3.1]})
    monkeypatch.setattr(rec, "load_input_history", lambda path: fake_df)

    calls = {"gen": 0, "cache_clear": 0}

    def fake_generate(df, out_dir=None):
        # Stub the heavy TF pipeline (no CSV write). The endpoint reports MAPE via
        # compute_accuracy, which reads the EXISTING committed Island-C CSVs.
        calls["gen"] += 1
        return {"C": {"6h": 0.0, "7day": 0.0}}

    monkeypatch.setattr(rec, "generate_forecasts", fake_generate)
    monkeypatch.setattr(rec.get_forecast_series, "cache_clear",
                        lambda: calls.__setitem__("cache_clear", calls["cache_clear"] + 1))

    r = _post_csv()
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["island"] == "C"
    # MAPE comes from compute_accuracy (LSTM+Margin) on the committed CSVs.
    assert body["mape_6h_pct"] == 5.03
    assert body["mape_7day_pct"] == 7.14
    assert body["within_target"] is True          # 5.03 <= 10
    assert body["n_rows_in"] == 2
    assert calls["gen"] == 1
    assert calls["cache_clear"] == 1               # served forecast was refreshed


def test_regenerate_bad_csv_returns_422(monkeypatch):
    monkeypatch.setattr(rec, "regenerate_available", lambda: True)

    def boom(path):
        raise ValueError("Input CSV has no 'Load C' column after parsing.")

    monkeypatch.setattr(rec, "load_input_history", boom)
    r = _post_csv("Date,Load A\n1/1/2025 00:00,40\n")
    assert r.status_code == 422
    assert "Load C" in r.json()["detail"]
