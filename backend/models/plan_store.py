"""In-memory active operating plan (B3).

The operator uploads a confirmed day-ahead schedule; it is stored as a daily
operating profile keyed by time-of-day (HH:MM) so the intra-day Early-Warning
can check whether the plan's planned supply still covers the latest forecast.
A single active plan, in-memory only (resets on restart — fine for the demo).
"""
from data.clock import now as sim_now

_active: dict | None = None   # {"by_hhmm": {...}, "uploaded_at": str, "n_steps": int}


def store_plan(steps: list[dict]) -> str:
    """Store steps keyed by HH:MM (parsed from each step's ISO 'datetime'), keeping
    diesel_a_mw/diesel_c_mw/battery_mw per slot. Returns the uploaded_at ISO.
    A full day's 96 steps have unique HH:MM; on any duplicate slot the last wins."""
    global _active
    by_hhmm: dict[str, dict] = {}
    for s in steps:
        hhmm = str(s["datetime"])[11:16]
        by_hhmm[hhmm] = {
            "diesel_a_mw": float(s.get("diesel_a_mw", 0.0) or 0.0),
            "diesel_c_mw": float(s.get("diesel_c_mw", 0.0) or 0.0),
            "battery_mw": float(s.get("battery_mw", 0.0) or 0.0),
        }
    uploaded_at = sim_now().isoformat()
    _active = {"by_hhmm": by_hhmm, "uploaded_at": uploaded_at, "n_steps": len(by_hhmm)}
    return uploaded_at


def get_plan() -> dict | None:
    return _active


def clear() -> None:
    global _active
    _active = None
