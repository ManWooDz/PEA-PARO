'use client'
import { useState, useEffect } from 'react'
import { fetchForecastSeries } from '@/lib/api'

export function useForecastSeries(horizon = '7day') {
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchForecastSeries(horizon)
      .then(d => { if (alive) setPoints(d.points || []) })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [horizon])

  return { points, loading, error }
}
