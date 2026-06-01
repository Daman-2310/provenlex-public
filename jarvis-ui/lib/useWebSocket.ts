'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const WS_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000')
  .replace(/^http/, 'ws')

export interface WSSnapshot {
  type: 'snapshot' | 'error' | 'alert'
  ts: number
  payload: Record<string, unknown>
}

export interface WSState<T> {
  data: T | null
  connected: boolean
  error: string | null
  lastUpdated: Date | null
}

export function useWebSocket<T = WSSnapshot>(
  path: string = '/ws/live',
  transform: (raw: WSSnapshot) => T | null = (s) => s as unknown as T,
): WSState<T> {
  const [data, setData]             = useState<T | null>(null)
  const [connected, setConnected]   = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const wsRef       = useRef<WebSocket | null>(null)
  const retryRef    = useRef(0)
  const mountedRef  = useRef(true)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    const token = typeof window !== 'undefined' ? localStorage.getItem('gs_token') : null
    const url = `${WS_BASE}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      scheduleReconnect()
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      retryRef.current = 0
      setConnected(true)
      setError(null)
    }

    ws.onmessage = (evt) => {
      if (!mountedRef.current) return
      try {
        const raw: WSSnapshot = JSON.parse(evt.data as string)
        const transformed = transform(raw)
        if (transformed !== null) {
          setData(transformed)
          setLastUpdated(new Date())
        }
      } catch {
        // malformed frame — ignore
      }
    }

    ws.onerror = () => {
      if (!mountedRef.current) return
      setConnected(false)
      setError('WebSocket error')
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setConnected(false)
      scheduleReconnect()
    }
  }, [path, transform])

  function scheduleReconnect() {
    if (!mountedRef.current) return
    retryRef.current += 1
    // Exponential backoff: 1s, 2s, 4s … capped at 30s
    const delay = Math.min(1000 * Math.pow(2, retryRef.current - 1), 30_000)
    timerRef.current = setTimeout(connect, delay)
  }

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { data, connected, error, lastUpdated }
}

// ── Specialised hook: full dashboard snapshot ─────────────────────────────────

export interface BotRow {
  bot_id: string
  bot_type: string
  personality_label: string
  last_score: number
  is_anomaly: boolean
  healthy: boolean
  last_summary: string
  threshold: number
  uptime_s: number
  last_seen: string | null
  confidence?: number
  signals?: Record<string, number | string>
  precrime_weight?: number
}

export interface ShadowBotData {
  defeat_score: number
  coverage: number
  blind_spots: string[]
  evasion_difficulty: 'EXTREME' | 'HIGH' | 'MODERATE' | 'LOW'
  adversarial_narrative: string
  red_team_attempts: number
}

export interface PrecrimePulseData {
  index: number
  trajectory: 'RISING' | 'STABLE' | 'FALLING'
  dominant_signal: string
  months_to_incident: number | null
  matched_pattern: string | null
  contributing_bots: [string, number][]
}

export interface LiveSnapshot {
  status: {
    total_bots: number
    healthy_bots: number
    active_alerts: number
    top_threat: string | null
    top_score: number
    consensus_rounds: number
    healing_events: number
    uptime_seconds: number
  }
  mode: { mode: string; fear_index: number; safe_haven_active: boolean }
  bots: BotRow[]
  alerts: unknown[]
  shadow_bot?: ShadowBotData
  precrime?: PrecrimePulseData
  ts: number
}

export function useLiveDashboard(): WSState<LiveSnapshot> {
  const transform = useCallback((raw: WSSnapshot): LiveSnapshot | null => {
    if (raw.type !== 'snapshot') return null
    return {
      ...(raw.payload as Omit<LiveSnapshot, 'ts'>),
      ts: raw.ts,
    }
  }, [])

  return useWebSocket<LiveSnapshot>('/ws/live', transform)
}
