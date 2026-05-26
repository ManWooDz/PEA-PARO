'use client'
import { useEffect, useState, useCallback } from 'react'
import { fetchEvents } from '@/lib/api'

export function useEvents(pollMs = 5000) {
  const [events, setEvents] = useState([])
  const [error,  setError]  = useState(null)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchEvents()
      setEvents(data.events ?? [])
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, pollMs)
    return () => clearInterval(id)
  }, [refresh, pollMs])

  return { events, error, refresh }
}
