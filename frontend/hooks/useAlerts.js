'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchAlerts, resolveAlert } from '@/lib/api'

export function useAlerts() {
  const [alerts,  setAlerts]  = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAlerts()
      setAlerts(data.alerts ?? [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load])

  const resolve = useCallback(async (id, note = '') => {
    try {
      await resolveAlert(id, note)
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved' } : a))
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const activeAlerts  = alerts.filter(a => a.status !== 'resolved')
  const resolvedAlerts = alerts.filter(a => a.status === 'resolved')

  return { alerts, activeAlerts, resolvedAlerts, loading, error, resolve, reload: load }
}
