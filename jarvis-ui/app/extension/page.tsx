import Link from 'next/link'
import { ArrowLeft, Download, Chrome, MousePointer2, Search, Shield, Globe } from 'lucide-react'

export default function ExtensionPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Chrome className="w-4 h-4 text-[#4a9eff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#4a9eff]">BROWSER EXTENSION</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(74,158,255,0.08)', border: '1px solid rgba(74,158,255,0.3)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#4a9eff]"
              style={{ animation: 'pulse 1.2s ease-in-out infinite', boxShadow: '0 0 8px #4a9eff' }} />
            <span className="text-[10px] font-black tracking-[0.25em] uppercase text-[#4a9eff]">CHROME · EDGE · BRAVE</span>
          </div>
          <h1 className="font-black tracking-tight mb-4" style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.5rem)', lineHeight: 1 }}>
            <span className="text-white">Hover any name.</span>
            <br />
            <span style={{ background: 'linear-gradient(90deg, #4a9eff 0%, #00ff88 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Screen anywhere.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-base max-w-2xl mx-auto leading-relaxed">
            Select any company on LinkedIn, Bloomberg Terminal, the FT, or any website.
            Genesis Swarm pops up an instant OFAC sanctions screen + compliance score.
            <span className="text-white"> Works on every page, in every tab.</span>
          </p>
        </div>

        {/* Install CTA */}
        <div className="rounded-2xl p-6 mb-10"
          style={{
            background: 'linear-gradient(135deg, rgba(74,158,255,0.05) 0%, rgba(0,255,136,0.03) 100%)',
            border: '1px solid rgba(74,158,255,0.3)',
            boxShadow: '0 0 40px rgba(74,158,255,0.08)',
          }}>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #4a9eff 0%, #2c6bbd 100%)', boxShadow: '0 0 28px rgba(74,158,255,0.5)' }}>
              <Chrome className="w-9 h-9 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-white">Genesis Swarm Extension v0.1</h2>
              <p className="text-[12px] text-[rgba(255,255,255,0.55)] mt-1">
                Manifest V3 · Chromium-compatible · 9 KB · No telemetry · Source code available
              </p>
            </div>
            <a href="/api/extension/download" download
              className="px-5 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black inline-flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #4a9eff 0%, #2c6bbd 100%)', color: '#fff', boxShadow: '0 0 20px rgba(74,158,255,0.4)' }}>
              <Download className="w-4 h-4" /> Download
            </a>
          </div>
        </div>

        {/* How it works */}
        <section className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#4a9eff] font-black mb-3">HOW IT WORKS</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { n: '01', Icon: MousePointer2, t: 'Select any text', d: 'Highlight a company name on any webpage. A green "Screen with Genesis Swarm" button appears next to your cursor.' },
              { n: '02', Icon: Search,        t: 'Click to screen',  d: 'Genesis Swarm checks the name against the live US Treasury OFAC SDN list (18,976 entities) in under 800ms.' },
              { n: '03', Icon: Shield,        t: 'Get the verdict',  d: 'Top-right overlay shows hits with match score + program. Click to generate a full 60-min audit pack.' },
            ].map(s => (
              <div key={s.n} className="rounded-xl p-5"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(74,158,255,0.18)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-black tabular-nums px-2 py-1 rounded"
                    style={{ background: 'rgba(74,158,255,0.1)', color: '#4a9eff', border: '1px solid rgba(74,158,255,0.4)' }}>{s.n}</span>
                  <s.Icon className="w-4 h-4 text-[#4a9eff]" />
                </div>
                <div className="text-[14px] font-black text-white mb-1">{s.t}</div>
                <div className="text-[11px] text-[rgba(255,255,255,0.55)] leading-relaxed">{s.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Install instructions */}
        <section className="rounded-2xl p-6 mb-10"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#4a9eff] font-black mb-3">INSTALL (DEV MODE)</div>
          <ol className="space-y-3 text-[12px] text-[rgba(255,255,255,0.75)] leading-relaxed">
            <li><span className="font-black text-white">1.</span> Click <span className="text-[#4a9eff] font-bold">Download</span> above — saves a .zip with the extension files</li>
            <li><span className="font-black text-white">2.</span> Unzip somewhere persistent (e.g. <code className="text-[#00ff88] font-mono text-[11px]">~/Documents/genesis-swarm-extension</code>)</li>
            <li><span className="font-black text-white">3.</span> Open <code className="text-[#00ff88] font-mono text-[11px]">chrome://extensions</code> (or <code className="text-[#00ff88] font-mono text-[11px]">edge://extensions</code>, <code className="text-[#00ff88] font-mono text-[11px]">brave://extensions</code>)</li>
            <li><span className="font-black text-white">4.</span> Enable <span className="font-bold">Developer mode</span> (top right)</li>
            <li><span className="font-black text-white">5.</span> Click <span className="font-bold">Load unpacked</span> → select the unzipped folder</li>
            <li><span className="font-black text-white">6.</span> Pin the icon to your toolbar. Done.</li>
          </ol>
          <div className="mt-4 pt-3 border-t border-[rgba(255,255,255,0.06)] text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">
            Web Store listing coming Q3 2026 once we have 100+ active users.
          </div>
        </section>

        {/* Features */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { Icon: Globe, t: 'Works everywhere', d: 'LinkedIn, Bloomberg, FT, Twitter, any site. <all_urls> permission scope.' },
            { Icon: Shield, t: 'Zero telemetry', d: 'Selection text is sent only to genesis-swarm-rgq5.vercel.app. Open source.' },
            { Icon: MousePointer2, t: 'Two activation modes', d: 'Selection floating button OR right-click "Screen with Genesis Swarm".' },
            { Icon: Search, t: 'Real OFAC data', d: 'Live US Treasury SDN list — 18,976 entities, ~800ms response.' },
          ].map(f => (
            <div key={f.t} className="rounded-lg p-4"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <f.Icon className="w-4 h-4 text-[#4a9eff] mb-2" />
              <div className="text-[13px] font-black text-white mb-1">{f.t}</div>
              <div className="text-[11px] text-[rgba(255,255,255,0.55)] leading-relaxed">{f.d}</div>
            </div>
          ))}
        </section>

      </div>
    </div>
  )
}
