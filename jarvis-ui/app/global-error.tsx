'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => { Sentry.captureException(error) }, [error])
  const isDev = process.env.NODE_ENV !== 'production'
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)',
        color: 'white',
        fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{ maxWidth: 540, textAlign: 'center' }}>
          <div style={{
            display: 'inline-block',
            padding: '6px 12px',
            borderRadius: '999px',
            background: 'rgba(242,86,110,0.08)',
            border: '1px solid rgba(242,86,110,0.3)',
            color: '#F2566E',
            fontSize: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            fontWeight: 700,
            marginBottom: 24,
          }}>
            System Error
          </div>
          <h1 style={{
            fontSize: 48,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            lineHeight: 1.0,
            margin: '0 0 16px',
          }}>
            Something broke.
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.65)',
            fontSize: 14,
            lineHeight: 1.6,
            margin: '0 0 28px',
          }}>
            The ProvenLex platform hit an unexpected error. The incident has been logged.
            You can try again, or jump back to the home page.
          </p>

          {error?.digest && (
            <div style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 10,
              color: 'rgba(255,255,255,0.4)',
              marginBottom: 28,
              padding: '8px 12px',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              display: 'inline-block',
            }}>
              ref: {error.digest}
            </div>
          )}

          {isDev && error?.message && (
            <pre style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              color: '#F5A524',
              textAlign: 'left',
              maxHeight: 240,
              overflow: 'auto',
              padding: 12,
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(245,165,36,0.2)',
              borderRadius: 8,
              margin: '0 0 24px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
{error.message}{'\n\n'}{error.stack ?? ''}
            </pre>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={reset}
              style={{
                padding: '12px 24px',
                borderRadius: 8,
                background: 'rgba(91,141,239,0.15)',
                border: '1px solid rgba(91,141,239,0.5)',
                color: '#5B8DEF',
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}>
              Try again
            </button>
            <a href="/" style={{
              padding: '12px 24px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.65)',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}>
              Go home
            </a>
          </div>

          <p style={{
            color: 'rgba(255,255,255,0.35)',
            fontSize: 11,
            marginTop: 28,
          }}>
            Persistent issue? Email <a href="mailto:daman.sharma.2310@gmail.com" style={{ color: '#5B8DEF' }}>daman.sharma.2310@gmail.com</a>
          </p>
        </div>
      </body>
    </html>
  )
}
