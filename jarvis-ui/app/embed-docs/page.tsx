import Link from 'next/link'
import { ArrowLeft, Code2, Copy, ExternalLink } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'Embed the Genesis Score · Genesis Swarm',
  description: 'Drop a Genesis Score badge on any website with a single iframe.',
}

const SAMPLE_LEI = '529900VBK42Y5HHRMD23'

export default function EmbedDocsPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#4a9eff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Code2 className="w-4 h-4 text-[#4a9eff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#4a9eff]">EMBED THE SCORE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">one iframe · works anywhere</span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <h1 className="font-black tracking-tight mb-4" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 0.95 }}>
            <span className="text-white">"Verified by Genesis"</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #4a9eff 0%, #00ff88 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              on every fund page.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Drop one iframe on any page. Show the Genesis Score for any LEI in the GLEIF registry.
            Auto-refreshing, dark + light themes, three sizes. Free forever.
          </p>
        </div>

        {/* LIVE PREVIEW */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4a9eff] font-black mb-4">Live preview</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PreviewCard label="Dark theme · medium" lei={SAMPLE_LEI} theme="dark" size="md" />
            <PreviewCard label="Light theme · medium" lei={SAMPLE_LEI} theme="light" size="md" />
            <PreviewCard label="Dark · large" lei={SAMPLE_LEI} theme="dark" size="lg" />
            <PreviewCard label="Dark · small" lei={SAMPLE_LEI} theme="dark" size="sm" />
          </div>
        </section>

        {/* CODE */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4a9eff] font-black mb-4">Copy the snippet</div>
          <CodeBlock
            language="html"
            code={`<iframe
  src="https://genesis-swarm-rgq5.vercel.app/embed/${SAMPLE_LEI}"
  width="320" height="120"
  style="border:0; background:transparent;"
  loading="lazy"
  title="Genesis Score">
</iframe>`} />
        </section>

        {/* PARAMS */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4a9eff] font-black mb-4">Parameters</div>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)' }}>
            <div className="grid grid-cols-[120px_100px_1fr] gap-4 px-4 py-3 text-[9px] uppercase tracking-[0.18em] font-black text-[rgba(255,255,255,0.4)]"
              style={{ background: 'rgba(74,158,255,0.04)', borderBottom: '1px solid rgba(74,158,255,0.15)' }}>
              <span>Param</span><span>Default</span><span>Values</span>
            </div>
            <Row p="path" d={SAMPLE_LEI}>20-character GLEIF LEI of the entity to display</Row>
            <Row p="?theme" d="dark">dark · light</Row>
            <Row p="?size" d="md">sm · md · lg</Row>
            <Row p="?link" d="true">true · false (disable click-through)</Row>
          </div>
        </section>

        {/* EXAMPLES */}
        <section className="mb-12">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4a9eff] font-black mb-4">Examples</div>
          <div className="space-y-3">
            <Example title="Light theme, small size, no link"
              code={`<iframe src="https://genesis-swarm-rgq5.vercel.app/embed/${SAMPLE_LEI}?theme=light&size=sm&link=false" width="260" height="100" style="border:0; background:transparent;"></iframe>`} />
            <Example title="Large dark badge on hero section"
              code={`<iframe src="https://genesis-swarm-rgq5.vercel.app/embed/${SAMPLE_LEI}?size=lg" width="400" height="150" style="border:0; background:transparent;"></iframe>`} />
          </div>
        </section>

        {/* NOTES */}
        <section className="rounded-2xl p-6"
          style={{ background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.25)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#4a9eff] font-black mb-3">Notes</div>
          <ul className="space-y-2 text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed">
            <li>— Score is cached for 1 hour upstream; the iframe is cached 1 hour at the edge</li>
            <li>— GLEIF identity data cached for 24 hours</li>
            <li>— Badges are fully responsive — the iframe scales to its container</li>
            <li>— No tracking cookies, no analytics, no user data collected by the badge</li>
            <li>— Click-through opens the full Genesis dossier in a new tab</li>
            <li>— Score reflects AI operational-risk analysis · not investment advice (<Link href="/legal" className="text-[#4a9eff] hover:underline">terms</Link>)</li>
          </ul>
        </section>

      </div>
    </div>
  )
}

function PreviewCard({ label, lei, theme, size }: { label: string; lei: string; theme: string; size: string }) {
  const bg = theme === 'light' ? '#f0f0f0' : '#0a0a14'
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-bold mb-2">{label}</div>
      <div className="rounded-xl p-4 flex items-center justify-center"
        style={{ background: bg, border: '1px solid rgba(255,255,255,0.06)', minHeight: '140px' }}>
        <iframe src={`/embed/${lei}?theme=${theme}&size=${size}`}
          width={size === 'lg' ? 400 : size === 'sm' ? 260 : 320}
          height={size === 'lg' ? 150 : size === 'sm' ? 95 : 120}
          style={{ border: 0, background: 'transparent' }}
          loading="lazy"
          title="Genesis Score badge preview" />
      </div>
    </div>
  )
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(74,158,255,0.25)', backdropFilter: 'blur(10px)' }}>
      <div className="flex items-center justify-between px-4 py-2"
        style={{ background: 'rgba(74,158,255,0.04)', borderBottom: '1px solid rgba(74,158,255,0.15)' }}>
        <span className="text-[10px] uppercase tracking-wider font-bold text-[#4a9eff]">{language}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-4 text-[12px] font-mono text-[rgba(255,255,255,0.85)] overflow-x-auto">{code}</pre>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  // Server-rendered version is non-interactive; replaced on client with copy capability via small inline script
  // For ship-speed, leaving as visual cue; can wire on next pass with 'use client' wrapper.
  return (
    <button type="button"
      data-copy={text}
      className="text-[10px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.5)] hover:text-white inline-flex items-center gap-1"
      aria-label="Copy code">
      <Copy className="w-3 h-3" /> Copy
    </button>
  )
}

function Row({ p, d, children }: { p: string; d: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_100px_1fr] gap-4 px-4 py-3 text-[11px] border-b border-[rgba(255,255,255,0.04)] last:border-0">
      <span className="font-mono text-[#4a9eff] font-bold">{p}</span>
      <span className="font-mono text-[rgba(255,255,255,0.5)]">{d}</span>
      <span className="text-[rgba(255,255,255,0.75)]">{children}</span>
    </div>
  )
}

function Example({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-[11px] font-bold text-white mb-2">{title}</div>
      <pre className="text-[10px] font-mono text-[rgba(255,255,255,0.6)] overflow-x-auto bg-[rgba(0,0,0,0.4)] p-3 rounded border border-[rgba(255,255,255,0.05)]">{code}</pre>
      <a href={`/embed/${SAMPLE_LEI}${code.split('?')[1]?.split('"')[0] ? '?' + code.split('?')[1].split('"')[0] : ''}`}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 mt-2 text-[10px] uppercase tracking-wider text-[#4a9eff] hover:underline">
        Open badge <ExternalLink className="w-2.5 h-2.5" />
      </a>
    </div>
  )
}
