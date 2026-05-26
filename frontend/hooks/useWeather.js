'use client'
import { useEffect, useState, useCallback } from 'react'
import { fetchWeather } from '@/lib/api'

export function useWeather() {
  const [data,  setData]  = useState(null)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try { setData(await fetchWeather()); setError(null) }
    catch (e) { setError(e.message) }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 15 * 60 * 1000)   // every 15 min
    return () => clearInterval(id)
  }, [refresh])

  return { weather: data, error }
}
