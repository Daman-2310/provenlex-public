import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import CommandPalette from '@/components/CommandPalette'
import PwaRegister from '@/components/PwaRegister'
import RevealObserver from '@/components/RevealObserver'
import SmoothScroll from '@/components/SmoothScroll'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  metadataBase: new URL('https://provenlex.vercel.app'),
  title: 'ProvenLex — Deterministic compliance for European funds',
  description: 'Deterministic compliance tooling for European funds. It reads a fund prospectus and checks it against AIFMD II in the browser — no LLM, so every verdict is reproducible and re-verifiable. Source-available.',
  openGraph: {
    type: 'website',
    siteName: 'ProvenLex',
    url: 'https://provenlex.vercel.app',
    title: 'ProvenLex — Deterministic compliance for European funds',
    description: 'Reads a fund prospectus and checks it against AIFMD II in the browser — no LLM, reproducible and re-verifiable. Source-available.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ProvenLex — Deterministic compliance for European funds',
    description: 'Deterministic AIFMD II checks, in the browser. No LLM, reproducible, source-available.',
  },
  manifest: '/manifest.json',
  verification: {
    google: 'g6Rb4TvCAjsaodaU_eAVWxMd8j6qZbStafeKsCgulRk',
  },
  icons: {
    icon: [
      // Monogram favicon: a "P" mark in the brand emerald — no emoji glyph.
      { url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%2306070A'/><text x='50' y='73' font-family='ui-sans-serif,system-ui' font-size='68' font-weight='800' fill='%2310D982' text-anchor='middle'>P</text></svg>" },
      { url: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
    ],
    apple: '/icon-192.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ProvenLex',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#10D982',
}

// Structured data: lets a "ProvenLex" search resolve to a recognized organisation
// + tool, with the right description and links — a cleaner, more authoritative
// branded result for a CO who searches the name before replying.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://provenlex.vercel.app/#org',
      name: 'ProvenLex',
      url: 'https://provenlex.vercel.app',
      logo: 'https://provenlex.vercel.app/icon-512.svg',
      description:
        'Deterministic AIFMD II / UCITS prospectus compliance tooling for European funds — no LLM in the decision path; every verdict reproducible, cited and sealed.',
      founder: {
        '@type': 'Person',
        name: 'Daman Sharma',
        url: 'https://www.linkedin.com/in/daman-sharma-4b0b67407',
        sameAs: ['https://www.linkedin.com/in/daman-sharma-4b0b67407'],
      },
      sameAs: ['https://github.com/Daman-2310/provenlex-public'],
    },
    {
      '@type': 'SoftwareApplication',
      name: 'ProvenLex',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://provenlex.vercel.app/scan',
      isAccessibleForFree: true,
      description:
        'Reads a fund prospectus and checks it against the AIFMD II and UCITS quantitative limits in the browser. No LLM in the decision path; every verdict is reproducible, cited to the exact article, and SHA-256 sealed.',
      publisher: { '@id': 'https://provenlex.vercel.app/#org' },
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body className="min-h-screen bg-genesis-bg text-[#E7ECEF] font-sans antialiased">
        <main>{children}</main>
        <SmoothScroll />
        <RevealObserver />
        <Analytics />
        <CommandPalette />
        <PwaRegister />
      </body>
    </html>
  )
}
