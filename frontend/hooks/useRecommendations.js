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

/**
 * Fetch the day-ahead plans for BOTH strategies (baseline + min-cost) from the
 * MILP-backed /api/dispatch/day-ahead, so the strategy cards + chart show the
 * real MILP schedule and the genuine "ลดต้นทุน vs แผนปัจจุบัน" savings.
 * Returns { plans: { baseline, "min-cost" }, loading }.
 */
export function useDayAheadPlans({ days = 1, hasSolar = false }) {
  const [plans, setPlans] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      fetchDayAhead({ strategy: 'baseline', days, hasSolar }),
      fetchDayAhead({ strategy: 'min-cost', days, hasSolar }),
    ])
      .then(([bl, mc]) => { if (alive) setPlans({ baseline: bl, 'min-cost': mc }) })
      .catch(() => { if (alive) setPlans({}) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days, hasSolar])

  return { plans, loading }
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
