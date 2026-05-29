"""
Simulation clock.

For the PoC demo the whole system is "frozen" to a fixed instant inside the
historical/forecast dataset, so every tab shares one coherent timeline and the
demo is deterministic (no wall-clock drift, no random jitter). The default
instant is the start of the LSTM forecast test window (28 Dec 2025 09:15) — the
moment the day-ahead / intra-day forecasts begin.

Override via env:
  PEA_SIM_NOW="2026-01-15T08:00:00"   → freeze to a different instant
  PEA_LIVE=1                          → use real wall-clock time (live mode)
"""
import os
from datetime import datetime

# Start of the forecast test window (forecast_7day.csv / forecast_6h.csv begin here).
_DEFAULT_SIM_NOW = "2025-12-28T09:15:00"


def _resolve() -> datetime | None:
    """Return the frozen instant, or None for live wall-clock mode."""
    if os.getenv("PEA_LIVE") == "1":
        return None
    raw = os.getenv("PEA_SIM_NOW", _DEFAULT_SIM_NOW)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


_FROZEN = _resolve()


def is_frozen() -> bool:
    """True when the clock is pinned to a fixed instant (demo mode)."""
    return _FROZEN is not None


def now() -> datetime:
    """Current instant — the frozen demo time, or real wall-clock if live."""
    return _FROZEN if _FROZEN is not None else datetime.now()
