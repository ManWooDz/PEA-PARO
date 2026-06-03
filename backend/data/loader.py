"""
Real CSV loader — reads both Historical_Load CSVs from docs/data/,
merges them, normalises column names to MW units, and computes battery SoC.
Falls back to synthetic data if the files are absent.
"""
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

from data.seed import ISLAND_C_LOAD_PROFILE, ISLAND_C_PEAK_KW
from data.clock import now as sim_now

# ── Path resolution ───────────────────────────────────────────────────────────
_BACKEND_DIR = Path(__file__).parent.parent          # backend/
_LOCAL_DATA  = Path(__file__).parent                 # backend/data/  (deployed)
_DOCS_DATA   = _BACKEND_DIR.parent / "docs" / "data" # project_root/docs/data/ (local dev)

# Prefer the combined file bundled in backend/data/ (docs/ is git-ignored and
# lives outside the serverless function root). Fall back to docs/data, then the
# two split files, for local development.
CSV_ALL = _LOCAL_DATA / "Historical_Load_All.csv"
if not CSV_ALL.exists():
    CSV_ALL = _DOCS_DATA / "Historical_Load_All.csv"
CSV1 = _DOCS_DATA / "Historical_Load_Jan-Jun25.csv"
CSV2 = _DOCS_DATA / "Historical_Load_July25-Feb26.csv"

BAT_CAPACITY_MWH = 30.0
SOC_START_MWH    = 18.0   # 60 % initial SoC

# ── Column rename map ─────────────────────────────────────────────────────────
_COL_MAP = {
    "1 (115kV)":    "line1_mw",
    "2 (115kV)":    "line2_mw",
    "3 (33kV)":     "line3_mw",
    "4 (115kV)":    "line4_mw",
    "5 (33kV)":     "line5_mw",
    "6 (33kV)":     "line6_mw",
    "7 (Battery A)":"battery_mw",
    "8 (Diesel A)": "diesel_a_mw",
    "9 (Diesel C)": "diesel_c_mw",
    "Grid":         "grid_avail_mw",   # main-grid supply (cable 1+2+3) — availability cap
    "Load A":       "load_a_mw",
    "Load B":       "load_b_mw",
    "Load C":       "load_c_mw",
}

# ── Module-level caches ───────────────────────────────────────────────────────
_df: pd.DataFrame | None = None        # 15-min granularity
_df_hourly: pd.DataFrame | None = None # hourly aggregated


# ── Private helpers ───────────────────────────────────────────────────────────

def _read_one_csv(path: Path) -> pd.DataFrame:
    """Parse a single historical CSV file."""
    # Skip trailing empty header columns
    df = pd.read_csv(path, usecols=lambda c: not str(c).startswith("Unnamed"))
    # Parse datetime — the CSV uses mixed formats: "1/1/2025 00:00" and
    # occasionally "31/3/2025, 23:30" (comma before time at month boundaries).
    # format='mixed' with dayfirst handles both gracefully.
    df["timestamp"] = pd.to_datetime(df["Date"], dayfirst=True, format="mixed")
    df = df.drop(columns=["Date", "Time"], errors="ignore")
    # Rename to standard MW column names
    df = df.rename(columns={k: v for k, v in _COL_MAP.items() if k in df.columns})
    # Coerce all data columns to numeric
    for col in df.columns:
        if col != "timestamp":
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _compute_soc(df: pd.DataFrame) -> pd.DataFrame:
    """
    Integrate battery_mw (15-min intervals) to compute SoC.
    Positive battery_mw = discharging  → SoC decreases.
    Negative battery_mw = charging     → SoC increases.
    """
    df = df.copy()
    battery = df["battery_mw"].fillna(0).values
    soc = np.empty(len(df))
    cur = SOC_START_MWH
    for i, b in enumerate(battery):
        cur = float(np.clip(cur - b * 0.25, 0.0, BAT_CAPACITY_MWH))
        soc[i] = cur
    df["soc_mwh"] = np.round(soc, 2)
    df["soc_pct"]  = np.round(soc / BAT_CAPACITY_MWH * 100, 1)
    return df


def _make_synthetic() -> pd.DataFrame:
    """Fallback: synthesise 1 year of 15-min data."""
    print("[loader] Generating synthetic fallback data")
    rng = np.random.default_rng(42)
    ts = pd.date_range("2025-01-01", periods=8760 * 4, freq="15min")
    rows = []
    for t in ts:
        h   = t.hour
        base = ISLAND_C_LOAD_PROFILE[h] * ISLAND_C_PEAK_KW / 1000  # kW → MW
        lc   = float(max(0.5, base + rng.normal(0, base * 0.05)))
        rows.append({
            "timestamp":  t,
            "load_c_mw":  round(lc, 2),
            "load_a_mw":  round(lc * 15 + rng.normal(0, 1), 2),
            "load_b_mw":  round(lc * 3  + rng.normal(0, 0.2), 2),
            "line1_mw":   round(lc * 7,    2),
            "line2_mw":   round(lc * 5,    2),
            "line3_mw":   round(lc * 2,    2),
            "line4_mw":   round(lc * 3,    2),
            "line5_mw":   round(lc * 0.8,  2),
            "line6_mw":   round(lc * 0.95, 2),
            "battery_mw": round(float(rng.uniform(-3, 3)), 2),
            "diesel_a_mw":0.0,
            "diesel_c_mw":round(float(max(0, rng.normal(1.5, 0.5))), 2),
        })
    df = pd.DataFrame(rows)
    return _compute_soc(df)


# ── Public API ────────────────────────────────────────────────────────────────

def load_historical() -> pd.DataFrame:
    """Return the full 15-min historical DataFrame (cached after first call)."""
    global _df
    if _df is not None:
        return _df

    frames = []
    paths = [CSV_ALL] if CSV_ALL.exists() else [CSV1, CSV2]
    for path in paths:
        if path.exists():
            try:
                frames.append(_read_one_csv(path))
                print(f"[loader] Loaded {path.name}")
            except Exception as exc:
                print(f"[loader] Failed to read {path.name}: {exc}")

    if not frames:
        _df = _make_synthetic()
        return _df

    df = pd.concat(frames, ignore_index=True).sort_values("timestamp").reset_index(drop=True)

    # Fill missing Line 6 (Jan–Jun 2025) with Load C − Diesel C
    if "line6_mw" not in df.columns:
        df["line6_mw"] = np.nan
    mask = df["line6_mw"].isna()
    if mask.any() and "load_c_mw" in df.columns:
        df.loc[mask, "line6_mw"] = (
            df.loc[mask, "load_c_mw"] - df.loc[mask, "diesel_c_mw"].fillna(0)
        ).clip(lower=0)

    df = _compute_soc(df)
    _df = df
    print(f"[loader] Total {len(_df)} rows | "
          f"{_df['timestamp'].min().date()} to {_df['timestamp'].max().date()}")
    return _df


def get_grid_availability(timestamps) -> list[float]:
    """Main-grid availability (MW) at each timestamp, from the historical 'Grid'
    column (cable 1+2+3). Used as the per-step grid cap in the MILP. Falls back to
    the sum of lines 1-3, then to the physical 72 MW, if the column is missing.
    """
    df = load_historical()
    if "grid_avail_mw" in df.columns:
        series = df["grid_avail_mw"]
    else:
        cols = [c for c in ("line1_mw", "line2_mw", "line3_mw") if c in df.columns]
        series = df[cols].sum(axis=1) if cols else None
    if series is None:
        return [72.0] * len(timestamps)
    s = pd.Series(series.values, index=df["timestamp"]).sort_index()
    targets = pd.DatetimeIndex([pd.Timestamp(t) for t in timestamps])
    vals = s.reindex(targets, method="nearest")
    return [float(v) if pd.notna(v) else 72.0 for v in vals]


def load_hourly() -> pd.DataFrame:
    """Return hourly-aggregated DataFrame (mean of 4 × 15-min per hour)."""
    global _df_hourly
    if _df_hourly is not None:
        return _df_hourly

    df = load_historical()
    df2 = df.copy()
    df2["hour_ts"] = df2["timestamp"].dt.floor("h")

    agg_cols = [c for c in df2.columns if c not in ("timestamp", "hour_ts")]
    # For SoC use the last value in the hour (end-of-hour state)
    soc_cols = ["soc_mwh", "soc_pct"]
    mean_cols = [c for c in agg_cols if c not in soc_cols]

    agg = df2.groupby("hour_ts").agg(
        {**{c: "mean" for c in mean_cols},
         **{c: "last" for c in soc_cols if c in df2.columns}}
    ).reset_index().rename(columns={"hour_ts": "timestamp"})

    _df_hourly = agg
    return _df_hourly


def get_current_state() -> dict:
    """
    Return the 'current' reading by reading the real historical row at the
    simulation clock's instant (see data.clock). Frozen demo mode → the actual
    measured values at the frozen timestamp (no averaging, no random jitter).
    Live mode → the row nearest to wall-clock now (last available if out of range).
    """
    df = load_historical()
    t = pd.Timestamp(sim_now())
    idx = (df["timestamp"] - t).abs().idxmin()
    row = df.loc[idx]

    def g(col: str, default: float = 0.0) -> float:
        v = row.get(col, default)
        return float(default if pd.isna(v) else v)

    soc_mwh = float(np.clip(g("soc_mwh", SOC_START_MWH), 0.0, BAT_CAPACITY_MWH))

    return {
        "load_c_mw":   round(max(0.0, g("load_c_mw")),  2),
        "load_a_mw":   round(max(0.0, g("load_a_mw")),  2),
        "load_b_mw":   round(max(0.0, g("load_b_mw")),  2),
        "line1_mw":    round(max(0.0, g("line1_mw")),   2),
        "line2_mw":    round(max(0.0, g("line2_mw")),   2),
        "line3_mw":    round(max(0.0, g("line3_mw")),   2),
        "line4_mw":    round(max(0.0, g("line4_mw")),   2),
        "line5_mw":    round(max(0.0, g("line5_mw")),   2),
        "line6_mw":    round(max(0.0, g("line6_mw")),   2),
        "battery_mw":  round(g("battery_mw"),           2),
        "diesel_a_mw": round(max(0.0, g("diesel_a_mw")),2),
        "diesel_c_mw": round(max(0.0, g("diesel_c_mw")),2),
        "soc_mwh":     round(soc_mwh, 2),
        "soc_pct":     round(soc_mwh / BAT_CAPACITY_MWH * 100, 1),
    }


def get_recent_24h_hourly() -> list[dict]:
    """
    Return the 24 hours of real historical data ending at the simulation clock
    (real timestamps — no time-shift). Used by the /load-history endpoint.
    """
    df_h = load_hourly()
    if df_h.empty:
        return []

    t = pd.Timestamp(sim_now()).floor("h")
    window = df_h[df_h["timestamp"] <= t].tail(24)
    if window.empty:
        window = df_h.tail(24)

    records = []
    for _, row in window.iterrows():
        ts = row["timestamp"]
        records.append({
            "ts":   ts.strftime("%Y-%m-%dT%H:%M:%S"),
            "hour": int(ts.hour),
            "load_mw":  round(float(row.get("load_c_mw", 0)), 2),
        })
    return records


def get_recent_12h_mix() -> list[dict]:
    """
    Return the 12 hours of real energy-mix data ending at the simulation clock
    (real timestamps — no time-shift). Used by the /energy-mix endpoint.
    """
    df_h = load_hourly()
    if df_h.empty:
        return []

    t = pd.Timestamp(sim_now()).floor("h")
    window = df_h[df_h["timestamp"] <= t].tail(12)
    if window.empty:
        window = df_h.tail(12)

    records = []
    for _, row in window.iterrows():
        ts = row["timestamp"]
        # battery positive = discharging (supply), negative = charging (demand)
        bat = float(row.get("battery_mw", 0))
        bat_supply = max(0.0, bat)
        load_c = float(row.get("load_c_mw", 0))
        d_a    = float(row.get("diesel_a_mw", 0))
        d_c    = float(row.get("diesel_c_mw", 0))
        line6  = float(row.get("line6_mw", 0))
        # Grid = what comes through Line 6 minus battery and diesel local supply
        grid   = max(0.0, line6)

        records.append({
            "ts":          ts.strftime("%Y-%m-%dT%H:%M:%S"),
            "grid_mw":     round(grid,      2),
            "battery_mw":  round(bat_supply, 2),
            "diesel_a_mw": round(d_a,        2),
            "diesel_c_mw": round(d_c,        2),
        })
    return records


def get_blended_cost(state: dict) -> float:
    """
    Load-weighted average cost (Token/kWh) of current generation mix.
    state must be the dict returned by get_current_state().
    """
    from data.seed import COST
    grid_mw    = max(0.0, state.get("line6_mw", 0.0))
    battery_mw = max(0.0, state.get("battery_mw", 0.0))  # positive = discharging
    d8_mw      = max(0.0, state.get("diesel_a_mw", 0.0))
    d9_mw      = max(0.0, state.get("diesel_c_mw", 0.0))
    total      = grid_mw + battery_mw + d8_mw + d9_mw
    if total < 0.01:
        return 0.0
    h = sim_now().hour
    grid_rate = COST["grid_peak"] if 9 <= h < 22 else COST["grid_offpeak"]
    cost = (
        grid_mw    * grid_rate +
        battery_mw * COST["battery"] +
        d8_mw      * COST["diesel_a"] +
        d9_mw      * COST["diesel_c"]
    ) / total
    return round(cost, 3)


# ── PV array config — Koh Tao 0.8 MWp ────────────────────────────────────────
PV_INSTALLED_MW   = 0.8     # total installed capacity
PV_PR             = 0.93    # Performance Ratio (system losses)
PV_NOCT           = 45.0    # Nominal Operating Cell Temperature (°C)
PV_TEMP_COEFF     = -0.0029 # power temp coefficient per °C above 25°C


def _solar_mw(irr_w_m2: float, temp_c: float,
              installed_mw: float = PV_INSTALLED_MW) -> float:
    """
    NOCT-based solar generation in MW.
      ghi_kw     = irradiance [W/m²] / 1000           → kW/m²
      t_cell     = temp + ((NOCT-20)/800) * irr_W/m²  → °C
      tf         = clip(1 + temp_coeff*(t_cell-25), 0.5)
      solar_mw   = installed_mw * ghi_kw * PR * tf
    """
    ghi_kw  = max(0.0, irr_w_m2) / 1000.0
    t_cell  = temp_c + ((PV_NOCT - 20.0) / 800.0) * max(0.0, irr_w_m2)
    tf      = max(0.5, 1.0 + PV_TEMP_COEFF * (t_cell - 25.0))
    return installed_mw * ghi_kw * PV_PR * tf


def get_solar_mw_now() -> float:
    """
    Current PV generation in MW for the Koh Tao 0.8 MWp array, using
    the latest POA irradiance + ambient temp from /api/weather.
    Returns 0 at night (or when weather unavailable).
    """
    try:
        from routers.weather import _CACHE
        data = _CACHE.get("data")
        if not data or not data.points:
            return 0.0
        now_hour = datetime.now().strftime("%Y-%m-%dT%H:00")
        match = next(
            (p for p in data.points if p.ts >= now_hour),
            data.points[0] if data.points else None
        )
        if not match:
            return 0.0
        return round(_solar_mw(match.solar_irradiance_w_m2, match.temperature_c), 3)
    except Exception:
        return 0.0


def get_solar_profile_24h(installed_mw: float = PV_INSTALLED_MW) -> list[float]:
    """
    Return a 24-element MW list for the next 24 hours, computed from the
    cached weather forecast. Falls back to a clear-sky bell curve if the
    cache is empty.
    Used by the dispatch optimizer so the 24h plan respects real weather.
    """
    try:
        from routers.weather import _CACHE
        data = _CACHE.get("data")
        if data and data.points:
            out = []
            for i in range(min(24, len(data.points))):
                p = data.points[i]
                out.append(round(_solar_mw(p.solar_irradiance_w_m2,
                                           p.temperature_c, installed_mw), 3))
            # Pad to 24 if weather feed shorter
            while len(out) < 24:
                out.append(0.0)
            return out
    except Exception:
        pass
    # Fallback: clear-sky bell at 30°C — ~80 % of installed peak around noon
    return [
        round(_solar_mw(
            max(0.0, 850.0 * max(0.0, 1 - ((h - 12) / 6) ** 2)),
            28.0 + 4 * max(0.0, 1 - ((h - 14) / 7) ** 2),
            installed_mw,
        ), 3)
        for h in range(24)
    ]


def get_hourly_profile_for_c() -> dict[int, dict]:
    """
    Return per-hour statistics for Island C load (used by forecasting).
    Returns {hour: {mean_mw, std_mw}}.
    """
    df = load_historical()
    df2 = df.copy()
    df2["h"] = df2["timestamp"].dt.hour
    grp = df2.groupby("h")["load_c_mw"].agg(["mean", "std"]).fillna(0)
    return {
        int(h): {"mean_mw": round(float(row["mean"]), 3),
                 "std_mw":  round(float(row["std"]),  3)}
        for h, row in grp.iterrows()
    }
