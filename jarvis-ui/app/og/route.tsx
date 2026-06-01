import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Dynamic OG image generator.
//
// Usage: /og?title=The%20Genesis%20Watch%20List&kicker=2026-2027&accent=ff3366
// Renders a 1200x630 OG card matching the brand cosmic background + accent.

const ACCENTS: Record<string, { primary: string; secondary: string }> = {
  red:     { primary: '#ff3366', secondary: '#ff7a00' },
  purple:  { primary: '#9b6dff', secondary: '#4a9eff' },
  green:   { primary: '#00ff88', secondary: '#4a9eff' },
  cyan:    { primary: '#00d8ff', secondary: '#9b6dff' },
  amber:   { primary: '#ffaa00', secondary: '#ff7a00' },
  bitcoin: { primary: '#f7931a', secondary: '#ffaa00' },
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams
  const title = (u.get('title') ?? 'Genesis Swarm').slice(0, 140)
  const kicker = (u.get('kicker') ?? 'The AI immune system for European funds').slice(0, 80)
  const accentKey = u.get('accent') ?? 'purple'
  const accent = ACCENTS[accentKey] ?? ACCENTS.purple

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#05050c',
          backgroundImage: `radial-gradient(circle at 20% 20%, ${accent.primary}22 0%, transparent 50%), radial-gradient(circle at 80% 80%, ${accent.secondary}22 0%, transparent 50%)`,
          padding: '80px',
          fontFamily: 'system-ui',
          color: 'white',
          position: 'relative',
        }}
      >
        {/* Grid background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          display: 'flex',
        }} />

        {/* Kicker */}
        <div style={{
          fontSize: 24,
          textTransform: 'uppercase',
          letterSpacing: '0.3em',
          color: accent.primary,
          fontWeight: 700,
          marginBottom: 40,
          display: 'flex',
        }}>
          {kicker}
        </div>

        {/* Title */}
        <div style={{
          fontSize: title.length > 60 ? 64 : title.length > 30 ? 80 : 100,
          fontWeight: 900,
          lineHeight: 1.0,
          letterSpacing: '-0.02em',
          color: 'white',
          maxWidth: '95%',
          display: 'flex',
        }}>
          {title}
        </div>

        {/* Footer */}
        <div style={{
          position: 'absolute',
          bottom: 60,
          left: 80,
          right: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: accent.primary,
              boxShadow: `0 0 16px ${accent.primary}`,
            }} />
            <div style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.95)',
            }}>
              Genesis Swarm
            </div>
          </div>
          <div style={{
            fontSize: 18,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: 'monospace',
          }}>
            genesis-swarm-rgq5.vercel.app
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
