import type { Metadata, Viewport } from 'next'
import './globals.css'
import TickerBar from '@/components/TickerBar'
import CommandPalette from '@/components/CommandPalette'
import PwaRegister from '@/components/PwaRegister'
import RevealObserver from '@/components/RevealObserver'

export const metadata: Metadata = {
  title: 'GENESIS SWARM // SOVEREIGN COMMAND CENTER',
  description: 'AI compliance & operational-risk intelligence for European funds. The Book of Genesis, anchored on Bitcoin.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      // Monogram favicon: a "G" mark on the brand purple — no emoji glyph.
      { url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%23050510'/><text x='50' y='73' font-family='ui-sans-serif,system-ui' font-size='68' font-weight='800' fill='%239b6dff' text-anchor='middle'>G</text></svg>" },
      { url: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
    ],
    apple: '/icon-192.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Genesis Swarm',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#9b6dff',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* No-JS fallback: never leave reveal-targets stuck invisible. */}
        <noscript><style>{`[data-reveal]{opacity:1 !important;transform:none !important;}`}</style></noscript>
      </head>
      <body className="min-h-screen bg-genesis-bg text-genesis-green font-mono antialiased grid-lines" style={{ paddingBottom: 36 }}>
        {children}
        <RevealObserver />
        <TickerBar />
        <CommandPalette />
        <PwaRegister />
      </body>
    </html>
  )
}
