"""Phase 2b capability probe — is forecast regeneration possible on THIS deployment?

Regeneration needs TensorFlow (to run the LSTM) plus the trained Island-C artifacts.
The slim Vercel/AWS image ships neither TF nor (necessarily) heavy ML deps, so the
regenerate endpoint must degrade gracefully there. This probe is intentionally cheap:
it checks whether the `tensorflow` module is INSTALLED via importlib.util.find_spec
(no actual import — importing TF is slow), and whether the C model file is present.
"""
import importlib.util
from pathlib import Path

_ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
_ISLAND_C_MODEL = _ARTIFACTS / "C" / "lstm_island_c.keras"


def regenerate_available() -> bool:
    """True iff TensorFlow is installed AND the Island-C model artifact exists."""
    if importlib.util.find_spec("tensorflow") is None:
        return False
    return _ISLAND_C_MODEL.exists()
