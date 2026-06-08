'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchForecastAccuracy } from '@/lib/api'

// Returns { accuracy, reload } — call reload() after a regeneration to refresh MAPE.
export function useForecastAccuracy({ island = 'C', horizon = '6h' } = {}) {
  const [accuracy, setAccuracy] = useState(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce(n => n + 1), [])

  useEffect(() => {
    let alive = true
    fetchForecastAccuracy({ island, horizon })
      .then(d => { if (alive) setAccuracy(d) })
      .catch(() => { if (alive) setAccuracy(null) })
    return () => { alive = false }
  }, [island, horizon, nonce])

  return { accuracy, reload }
}
