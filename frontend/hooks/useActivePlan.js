'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchActivePlan } from '@/lib/api'

export function useActivePlan() {
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    return fetchActivePlan()
      .then((d) => setActive(d))
      .catch(() => setActive(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { active, loading, refresh }
}
