'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchDayAhead, fetchIntradayAlerts, fetchIntradayScenarios, fetchIntradayPlanActions, fetchTodayFullDayAhead } from '@/lib/api'

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
export function useDayAheadPlans({ days = 1, hasSolar = false, resolution = '1h' }) {
  const [plans, setPlans] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      fetchDayAhead({ strategy: 'baseline', days, hasSolar, resolution }),
      fetchDayAhead({ strategy: 'min-cost', days, hasSolar, resolution }),
    ])
      .then(([bl, mc]) => { if (alive) setPlans({ baseline: bl, 'min-cost': mc }) })
      .catch(() => { if (alive) setPlans({}) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days, hasSolar, resolution])

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

// Intra-day actions derived from today's recommended plan (consistent with the
// today schedule). Read-only, fetched once on mount.
export function useTodayPlanActions() {
  const [recommendations, setRecs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchIntradayPlanActions()
      .then(d => { if (alive) setRecs(d.recommendations || []) })
      .catch(() => { if (alive) setRecs([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return { recommendations, loading }
}

export function useIntradayScenarios(body) {
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchIntradayScenarios(body)
      .then(d => { if (alive) setScenarios(d.scenarios || []) })
      .catch(() => { if (alive) setScenarios([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [JSON.stringify(body)])    // eslint-disable-line react-hooks/exhaustive-deps

  return { scenarios, loading }
}

export function useTodayFullPlan() {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchTodayFullDayAhead()
      .then(d => { if (alive) setPlan(d) })
      .catch(() => { if (alive) setPlan(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return { plan, loading }
}
