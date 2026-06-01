'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface PollingResult<T> {
  data: T | null
  loading: boolean
  lastUpdated: Date | null
  error: string | null
}

export function usePolling<T>(
  fetcher: () => Promise<T | null>,
  intervalMs: number = 2000,
  initialData: T | null = null
): PollingResult<T> {
  const [data, setData] = useState<T | null>(initialData)
  const [loading, setLoading] = useState<boolean>(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetcherRef = useRef(fetcher)
  useEffect(() => { fetcherRef.current = fetcher }, [fetcher])

  const failCountRef = useRef(0)
  const inFlightRef  = useRef(false)

  const runFetch = useCallback(async () => {
    // Skip tick if a previous fetch is still in-flight (prevents promise accumulation)
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const result = await fetcherRef.current()
      if (result !== null) {
        setData(result)
        setLastUpdated(new Date())
        setError(null)
        failCountRef.current = 0
      }
    } catch (err) {
      failCountRef.current += 1
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    void runFetch()

    // Exponential backoff: after 3 consecutive failures, back off up to 30s
    const tick = () => {
      const failures = failCountRef.current
      const backoff = failures >= 3
        ? Math.min(intervalMs * Math.pow(2, failures - 2), 30_000)
        : intervalMs
      return backoff
    }

    let timeoutId: ReturnType<typeof setTimeout>
    const schedule = () => {
      timeoutId = setTimeout(() => {
        void runFetch()
        schedule()
      }, tick())
    }
    schedule()

    return () => clearTimeout(timeoutId)
  }, [runFetch, intervalMs])

  return { data, loading, lastUpdated, error }
}

// Multi-fetcher variant for fetching multiple endpoints together
export function useMultiPolling<T extends Record<string, unknown>>(
  fetchers: { [K in keyof T]: () => Promise<T[K] | null> },
  intervalMs: number = 2000
): { data: Partial<T>; loading: boolean; lastUpdated: Date | null } {
  const [data, setData] = useState<Partial<T>>({})
  const [loading, setLoading] = useState<boolean>(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchersRef = useRef(fetchers)
  useEffect(() => {
    fetchersRef.current = fetchers
  }, [fetchers])

  const runFetch = useCallback(async () => {
    const keys = Object.keys(fetchersRef.current) as Array<keyof T>
    const results = await Promise.allSettled(
      keys.map((k) => fetchersRef.current[k]())
    )

    const newData: Partial<T> = {}
    results.forEach((result, i) => {
      const key = keys[i]
      if (result.status === 'fulfilled' && result.value !== null) {
        newData[key] = result.value as T[typeof key]
      }
    })

    setData((prev) => ({ ...prev, ...newData }))
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    void runFetch()
    const interval = setInterval(() => void runFetch(), intervalMs)
    return () => clearInterval(interval)
  }, [runFetch, intervalMs])

  return { data, loading, lastUpdated }
}
