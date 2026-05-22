'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchForecast, fetchForecast7d } from '@/lib/api'

export function useForecast() {
  const [hours,   setHours]   = useState(24)
  const [short,   setShort]   = useState(null)   // next N hours
  const [week,    setWeek]    = useState(null)   // 7-day daily
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const load = useCallback(async (h) => {
    setLoading(true)
    try {
      const [s, w] = await Promise.all([fetchForecast(h), fetchForecast7d()])
      setShort(s)
      setWeek(w)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(hours) }, [hours, load])

  const setHorizon = (h) => setHours(h)

  return { short, week, hours, setHorizon, loading, error, reload: () => load(hours) }
}
