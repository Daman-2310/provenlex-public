'use client'

/**
 * ProvenLex backdrop — institutional restraint.
 *
 * A deep, calm near-black base with a single faint accent wash and a fine
 * technical grid. No animation, no glowing orbs, no WebGL: every page should
 * read like a precision instrument — an audit report or a terminal — not a
 * startup landing page. The grid signals engineering; the grain kills banding
 * and adds a premium, tactile feel. Same prop signature as before so every
 * caller keeps working; only `accent` tints the wash.
 */

interface Props { variant?: 'calm' | 'intense' | 'void'; accent?: string; solarSystem?: boolean }

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

export default function CosmicBackground({ accent = '#10D982' }: Props) {
  const a = hexToRgb(accent)
  return (
    <>
      {/* Base — deep institutional dark, one faint accent wash at top, a cooler
          wash bottom-right. Restrained on purpose. */}
      <div
        className="fixed inset-0 pointer-events-none -z-30"
        style={{
          background: `
            radial-gradient(120% 80% at 50% -10%, rgba(${a.r},${a.g},${a.b},0.05) 0%, transparent 45%),
            radial-gradient(90% 60% at 100% 100%, rgba(91,141,239,0.03) 0%, transparent 55%),
            linear-gradient(180deg, #080A0E 0%, #06070A 52%, #050609 100%)
          `,
        }}
      />
      {/* Fine technical grid — the 'precision instrument' cue. Ultra-low contrast,
          masked so it fades toward the bottom and never competes with content. */}
      <div
        className="fixed inset-0 pointer-events-none -z-20"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.017) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.017) 1px, transparent 1px)
          `,
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(125% 90% at 50% 0%, #000 28%, transparent 82%)',
          WebkitMaskImage: 'radial-gradient(125% 90% at 50% 0%, #000 28%, transparent 82%)',
        }}
      />
      {/* Faint film grain — removes gradient banding, adds a tactile, premium feel. */}
      <div
        className="fixed inset-0 pointer-events-none -z-10 opacity-[0.02] mix-blend-overlay"
        aria-hidden="true"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </>
  )
}
