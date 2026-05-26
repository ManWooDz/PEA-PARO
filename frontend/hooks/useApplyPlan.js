'use client'
import { useState, useCallback } from 'react'
import { applyDispatchPlan } from '@/lib/api'

export function useApplyPlan() {
  const [submitting, setSubmitting] = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState(null)

  const apply = useCallback(async (payload) => {
    setSubmitting(true); setError(null)
    try {
      const data = await applyDispatchPlan(payload)
      setResult(data)
      return data
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setSubmitting(false)
    }
  }, [])

  return { apply, submitting, result, error }
}
