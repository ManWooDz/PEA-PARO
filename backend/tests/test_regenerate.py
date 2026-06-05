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
