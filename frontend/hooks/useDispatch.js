'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchDispatch, fetchCustomDispatch } from '@/lib/api'

export function useDispatch() {
  const [plans,      setPlans]      = useState({})
  const [activeId,   setActiveId]   = useState('min-cost')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [customCfg,  setCustomCfg]  = useState({
    shares:  { grid: 55, battery: 30, diesel_c: 10, diesel_a: 5 },
    windows: { grid: [0, 24], battery: [9, 22], diesel_c: [18, 22], diesel_a: [19, 22] },
  })

  const loadStrategies = useCallback(async () => {
    setLoading(true)
    try {
      const strategies = ['baseline','min-cost','reliability','eco']
      const results = await Promise.all(strategies.map(s => fetchDispatch(s)))
      const map = {}
      strategies.forEach((s, i) => { map[s] = results[i] })
      setPlans(map)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCustom = useCallback(async (cfg) => {
    try {
      const result = await fetchCustomDispatch(cfg)
      setPlans(p => ({ ...p, custom: result }))
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { loadStrategies() }, [loadStrategies])

  useEffect(() => {
    loadCustom(customCfg)
  }, [customCfg, loadCustom])

  const applyPlan = (id) => setActiveId(id)

  return {
    plans, activeId, loading, error,
    customCfg, setCustomCfg,
    applyPlan, reload: loadStrategies,
  }
}
