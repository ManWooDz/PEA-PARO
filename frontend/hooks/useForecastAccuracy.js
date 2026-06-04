'use client'
import { useState, useEffect } from 'react'
import { fetchForecastAccuracy } from '@/lib/api'

export function useForecastAccuracy({ island = 'C', horizon = '6h' } = {}) {
  const [accuracy, setAccuracy] = useState(null)

  useEffect(() => {
    let alive = true
    fetchForecastAccuracy({ island, horizon })
      .then(d => { if (alive) setAccuracy(d) })
      .catch(() => { if (alive) setAccuracy(null) })
    return () => { alive = false }
  }, [island, horizon])

  return accuracy
}
