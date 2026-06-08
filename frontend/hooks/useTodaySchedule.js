'use client'
import { useState, useEffect } from 'react'
import { fetchTodaySchedule } from '@/lib/api'

// Intra-day: today's remaining 15-min recommended schedule.
export function useTodaySchedule() {
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchTodaySchedule()
      .then(d => { if (alive) setSchedule(d) })
      .catch(() => { if (alive) setSchedule(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return { schedule, loading }
}
