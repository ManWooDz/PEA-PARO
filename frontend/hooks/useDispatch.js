'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchDispatch } from '@/lib/api'

export function useDispatch() {
  const [activeId,  setActiveId]  = useState('baseline')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [hasSolar,  setHasSolar]  = useState(false)

  const loadStrategies = useCallback(async (solar) => {
    setLoading(true)
    try {
      const strategies = ['baseline', 'min-cost']
      await Promise.all(strategies.map(s => fetchDispatch(s, solar)))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reload all strategies whenever Solar scenario flips
  useEffect(() => { loadStrategies(hasSolar) }, [loadStrategies, hasSolar])

  const applyPlan = (id) => setActiveId(id)

  return {
    activeId, loading, error,
    hasSolar, setHasSolar,
    applyPlan, reload: () => loadStrategies(hasSolar),
  }
}
