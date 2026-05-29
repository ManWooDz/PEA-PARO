'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchDispatch, fetchCustomDispatch } from '@/lib/api'

export function useDispatch() {
  const [plans,     setPlans]     = useState({})
  const [activeId,  setActiveId]  = useState('baseline')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [hasSolar,  setHasSolar]  = useState(false)

  // Custom Dispatch only: BESS / Diesel #8 / Diesel #9 / Solar
  const [customCfg, setCustomCfg] = useState({
    shares:  { battery: 35, diesel_a: 15, diesel_c: 25, solar: 25 },
    windows: { battery: [9, 22], diesel_a: [19, 22], diesel_c: [18, 22], solar: [7, 18] },
  })

  const loadStrategies = useCallback(async (solar) => {
    setLoading(true)
    try {
      const strategies = ['baseline', 'min-cost']
      const results = await Promise.all(strategies.map(s => fetchDispatch(s, solar)))
      const map = {}
      strategies.forEach((s, i) => { map[s] = results[i] })
      setPlans(p => ({ ...p, ...map }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCustom = useCallback(async (cfg, solar) => {
    try {
      const result = await fetchCustomDispatch({ ...cfg, has_solar: solar })
      setPlans(p => ({ ...p, custom: result }))
    } catch (e) {
      setError(e.message)
    }
  }, [])

  // Reload all strategies whenever Solar scenario flips
  useEffect(() => { loadStrategies(hasSolar) }, [loadStrategies, hasSolar])

  useEffect(() => {
    loadCustom(customCfg, hasSolar)
  }, [customCfg, hasSolar, loadCustom])

  const applyPlan = (id) => setActiveId(id)

  return {
    plans, activeId, loading, error,
    customCfg, setCustomCfg,
    hasSolar, setHasSolar,
    applyPlan, reload: () => loadStrategies(hasSolar),
  }
}
