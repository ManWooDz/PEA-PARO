'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchRealtime, fetchLoadHistory, fetchEnergyMix } from '@/lib/api'

export function useRealtime() {
  const [data,         setData]         = useState(null)
  const [history,      setHistory]      = useState(null)
  const [energyMix,    setEnergyMix]    = useState(null)
  const [error,        setError]        = useState(null)
  const [prevLoad,     setPrevLoad]     = useState(null)
  const [lastReceived, setLastReceived] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [rt, hist, mix] = await Promise.all([
        fetchRealtime(),
        fetchLoadHistory(),
        fetchEnergyMix(),
      ])
      setData(prev => {
        if (prev) setPrevLoad(prev.kpi.island_c_load_mw)
        return rt
      })
      setHistory(hist)
      setEnergyMix(mix)
      setError(null)
      setLastReceived(new Date().toISOString())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  const delta = data && prevLoad != null
    ? data.kpi.island_c_load_mw - prevLoad
    : null

  return { data, history, energyMix, error, delta, refresh, lastReceived }
}
