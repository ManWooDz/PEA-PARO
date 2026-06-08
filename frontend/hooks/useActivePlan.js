'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchActivePlan } from '@/lib/api'

export function useActivePlan() {
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(false)
  // Guard state updates so an in-flight fetch can't setState after unmount.
  // A ref (not the useSchedule per-effect flag) because refresh() is also called
  // on demand after an upload, outside the mount effect.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    return fetchActivePlan()
      .then((d) => { if (alive.current) setActive(d) })
      .catch(() => { if (alive.current) setActive(null) })
      .finally(() => { if (alive.current) setLoading(false) })
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { active, loading, refresh }
}
