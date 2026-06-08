'use client'
import { useState, useEffect } from 'react'
import { fetchSchedule } from '@/lib/api'

export function useSchedule() {
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchSchedule()
      .then(d => { if (alive) setSchedule(d) })
      .catch(() => { if (alive) setSchedule(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return { schedule, loading }
}
