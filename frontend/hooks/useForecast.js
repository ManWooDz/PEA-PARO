'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchForecastDispatch, fetchForecast7d } from '@/lib/api'

/**
 * useForecast — drives Tab3.
 *
 * Calls POST /api/forecast-dispatch (LSTM → merit-order dispatch) and
 * GET  /api/forecast/7days in parallel.
 *
 * Returns:
 *   fd      — ForecastDispatchResponse | null
 *               .forecast_15min  [{datetime, load_mw, load_mw_safe}, ...]
 *               .dispatch_hourly [{hour, load_mw, grid_mw, battery_mw,
 *                                  diesel_a_mw, diesel_c_mw, soc_pct, status}, ...]
 *               .cost            {grid_thb, battery_thb, diesel_thb, total_thb}
 *               .margin_mw, .strategy, .horizon, .generated_at
 *   week    — Forecast7DayResponse | null  (.days[])
 *   hours   — numeric 6 | 24  (for horizon-button highlight)
 *   setHorizon(h) — accepts 6 or 24
 *   loading, error, reload
 */
export function useForecast() {
  const [horizon,  setHorizonState] = useState('24h')  // '6h' | '24h'
  const [fd,       setFd]           = useState(null)
  const [week,     setWeek]         = useState(null)
  const [loading,  setLoading]      = useState(false)
  const [error,    setError]        = useState(null)

  const load = useCallback(async (h) => {
    setLoading(true)
    setError(null)
    try {
      const [fdData, w] = await Promise.all([
        fetchForecastDispatch({ horizon: h }),
        fetchForecast7d(),
      ])
      setFd(fdData)
      setWeek(w)
    } catch (e) {
      setError(e.message ?? 'Forecast failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(horizon) }, [horizon, load])

  /** Accept numeric (6, 24) or string ('6h', '24h') from the horizon buttons */
  const setHorizon = (h) => {
    const next = (h === 6 || h === '6h') ? '6h' : '24h'
    setHorizonState(next)
  }

  const hours = horizon === '6h' ? 6 : 24

  return { fd, week, hours, setHorizon, loading, error, reload: () => load(horizon) }
}
