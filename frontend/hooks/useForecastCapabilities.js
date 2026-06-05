'use client'
import { useState, useEffect } from 'react'
import { fetchForecastCapabilities } from '@/lib/api'

// Returns { available, loading }. Defaults to NOT available until confirmed,
// so the control stays hidden on slim deployments / while probing.
export function useForecastCapabilities() {
  const [available, setAvailable] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetchForecastCapabilities()
      .then(d => { if (alive) setAvailable(!!d.regenerate_available) })
      .catch(() => { if (alive) setAvailable(false) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return { available, loading }
}
