'use client'

import { useEffect } from 'react'

export default function ConsensusPage() {
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
    window.location.href = `${base}/consensus`
  }, [])

  return (
    <div
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        color: '#00ff88',
        background: '#010208',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '13px',
        letterSpacing: '0.05em',
      }}
    >
      REDIRECTING TO CONSENSUS VISUALIZER…
    </div>
  )
}
