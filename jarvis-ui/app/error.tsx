'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => { Sentry.captureException(error) }, [error])
  const isDev = process.env.NODE_ENV !== 'production'
  return (
    <div className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)', color: 'white' }}>
      <div className="max-w-xl w-full text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6"
          style={{ background: 'rgba(245,165,36,0.08)', border: '1px solid rgba(245,165,36,0.3)' }}>
          <AlertTriangle className="w-3.5 h-3.5 text-[#F5A524]" />
          <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#F5A524]">Page error</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 leading-tight">
          This page couldn&apos;t load.
        </h1>
        <p className="text-[rgba(255,255,255,0.65)] text-base leading-relaxed mb-6">
          The route encountered an unexpected error. The rest of ProvenLex is still working —
          try the action below or jump back to the home page.
        </p>

        {error?.digest && (
          <div className="inline-block text-[10px] font-mono text-[rgba(255,255,255,0.45)] px-3 py-1.5 rounded-lg mb-6"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
            ref: {error.digest}
          </div>
        )}

        {isDev && error?.message && (
          <pre className="text-[11px] font-mono text-[#F5A524] text-left max-h-60 overflow-auto p-3 rounded-lg mb-6 whitespace-pre-wrap break-words"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245,165,36,0.2)' }}>
            {error.message}{'\n\n'}{error.stack ?? ''}
          </pre>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={reset}
            className="flex items-center gap-2 px-5 py-3 rounded-lg text-[12px] uppercase tracking-wider font-bold transition-all"
            style={{ background: 'rgba(91,141,239,0.15)', border: '1px solid rgba(91,141,239,0.5)', color: '#5B8DEF' }}>
            <RefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
          <Link href="/"
            className="flex items-center gap-2 px-5 py-3 rounded-lg text-[12px] uppercase tracking-wider font-bold transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.65)' }}>
            <Home className="w-3.5 h-3.5" />
            Home
          </Link>
        </div>

        <p className="text-[11px] text-[rgba(255,255,255,0.4)] mt-7">
          Persistent issue? Email{' '}
          <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#5B8DEF] hover:underline">
            daman.sharma.2310@gmail.com
          </a>
        </p>
      </div>
    </div>
  )
}
