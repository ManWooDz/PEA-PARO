'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchDayAhead, fetchIntradayAlerts } from '@/lib/api'

export function useDayAhead({ strategy = 'min-cost', days = 1, hasSolar = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchDayAhead({ strategy, days, hasSolar })
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [strategy, days, hasSolar])

  return { data, loading, error }
}

export function useIntradayAlerts(body) {
  const [recommendations, setRecs] = useState([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    fetchIntradayAlerts(body)
      .then(d => setRecs(d.recommendations || []))
      .catch(() => setRecs([]))
      .finally(() => setLoading(false))
  }, [JSON.stringify(body)])    // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { refresh() }, [refresh])
  return { recommendations, loading, refresh }
}
