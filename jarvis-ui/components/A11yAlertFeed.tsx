'use client'

/**
 * A11yAlertFeed — screen-reader accessible alert feed.
 *
 * Visually hidden (sr-only CSS) but announced to assistive technology via:
 *   - role="log" aria-live="polite" — announces new items without interrupting
 *   - role="alert" aria-live="assertive" — for EMERGENCY severity items
 *
 * Also provides a skip-to-content link at the top of the page.
 *
 * Usage:
 *   <A11yAlertFeed alerts={recentAlerts} />
 *
 * The component renders nothing visible — it exists purely for accessibility.
 */

import { useEffect, useRef } from 'react'

interface Alert {
  bot_type: string
  severity: string
  anomaly_score: number
  summary: string
  timestamp: string
  round_id?: string
}

interface Props {
  alerts: Alert[]
  maxItems?: number
}

export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-[#00ff88] focus:text-black focus:px-4 focus:py-2 focus:rounded focus:font-bold"
      tabIndex={0}
    >
      Skip to main content
    </a>
  )
}

export default function A11yAlertFeed({ alerts, maxItems = 10 }: Props) {
  const prevCountRef = useRef(0)
  const emergencies  = alerts.filter(a => a.severity === 'EMERGENCY').slice(0, 3)
  const recent       = alerts.slice(0, maxItems)

  useEffect(() => {
    prevCountRef.current = alerts.length
  }, [alerts.length])

  if (recent.length === 0) return null

  return (
    <>
      {/* EMERGENCY alerts announced assertively (interrupts screen reader) */}
      {emergencies.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="sr-only"
          aria-label="Emergency alerts"
        >
          {emergencies.map((a, i) => (
            <p key={i}>
              Emergency alert from {a.bot_type}: {a.summary}.
              Anomaly score {a.anomaly_score.toFixed(0)} out of 100.
            </p>
          ))}
        </div>
      )}

      {/* All recent alerts in a polite log (queued, non-interrupting) */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Recent swarm alerts"
        aria-relevant="additions"
        className="sr-only"
      >
        <h2>Recent Alerts</h2>
        <ul>
          {recent.map((a, i) => (
            <li key={i}>
              {a.severity} alert: {a.bot_type} detected anomaly score {a.anomaly_score.toFixed(0)}.
              {a.summary ? ` ${a.summary}.` : ''}
              Time: {a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : 'unknown'}.
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
