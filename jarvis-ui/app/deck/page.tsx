import Link from 'next/link'
import { ArrowLeft, Sparkles, Crosshair, Brain, Network, Eye, BarChart3, Award, Send, AlertOctagon, Bitcoin } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'Genesis Swarm — Pitch Deck · €1M Pre-Seed · 2026',
  description: 'The AI immune system for European funds. Bitcoin-anchored risk scoring. Built by a 16-year-old in Luxembourg. Pitch deck for €1M pre-seed.',
  openGraph: {
    title: 'Genesis Swarm — Pitch Deck',
    description: 'Bitcoin-anchored compliance AI · 16-year-old founder · Luxembourg · pre-seed open',
  },
}

const NAV = [
  { n: '01', label: 'Cover' },
  { n: '02', label: 'The Problem' },
  { n: '03', label: 'What Genesis Is' },
  { n: '04', label: 'The Watch List' },
  { n: '05', label: 'Why Now' },
  { n: '06', label: 'The Moats' },
  { n: '07', label: 'Distribution' },
  { n: '08', label: 'Revenue Model' },
  { n: '09', label: 'Traction' },
  { n: '10', label: 'Roadmap' },
  { n: '11', label: 'The Ask' },
  { n: '12', label: 'Contact' },
]

export default function DeckPage() {
  return (
    <div className="text-white relative">
      <CosmicBackground variant="calm" accent="#9b6dff" />

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 print:hidden"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3 flex-wrap">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Sparkles className="w-4 h-4 text-[#9b6dff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">PITCH DECK</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.45)]">scroll · screenshot · share</span>
            <a href="#01" className="text-[10px] uppercase tracking-wider text-[#9b6dff] hover:underline">Top</a>
          </div>
        </div>
      </header>

      {/* Side rail nav (desktop) */}
      <nav className="hidden xl:flex flex-col fixed left-6 top-1/2 -translate-y-1/2 z-20 gap-2 print:hidden">
        {NAV.map(s => (
          <a key={s.n} href={`#${s.n}`}
            className="group flex items-center gap-2 text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] hover:text-white">
            <span className="font-mono">{s.n}</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">{s.label}</span>
          </a>
        ))}
      </nav>

      {/* SLIDE 01 — COVER */}
      <Slide id="01">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8"
            style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <Sparkles className="w-3 h-3 text-[#9b6dff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#9b6dff]">
              €1M pre-seed · Luxembourg · 2026
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-6"
            style={{ fontSize: 'clamp(3rem, 10vw, 8rem)', lineHeight: 0.9 }}>
            <span className="text-white">Genesis</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #9b6dff 0%, #ff3366 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 32px rgba(155,109,255,0.4))',
            }}>Swarm.</span>
          </h1>
          <div className="text-2xl sm:text-3xl text-[rgba(255,255,255,0.85)] font-light max-w-3xl mx-auto leading-tight mb-10">
            The AI immune system<br />for European funds.
          </div>
          <div className="text-[12px] uppercase tracking-[0.3em] text-[rgba(255,255,255,0.45)]">
            Built by a 16-year-old · Anchored on Bitcoin · Live in production
          </div>
        </div>
      </Slide>

      {/* SLIDE 02 — THE PROBLEM */}
      <Slide id="02">
        <SlideTitle num="02" label="The Problem" accent="#ff3366" />
        <h2 className="text-5xl sm:text-6xl font-black text-white tracking-tight leading-none mb-8">
          €60 billion in EU/global<br />
          <span className="text-[#ff3366]">finance collapses since 2020.</span>
        </h2>
        <p className="text-xl text-[rgba(255,255,255,0.75)] max-w-3xl leading-relaxed mb-10">
          Wirecard. Greensill. Archegos. FTX. Silicon Valley Bank. Every collapse was foreseeable from public signals 12-24 months in advance. No vendor flags them.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat n="€24bn" l="Wirecard 2020" />
          <Stat n="€10bn" l="Greensill 2021" />
          <Stat n="€10bn" l="Archegos 2021" />
          <Stat n="$8bn"  l="FTX 2022" />
          <Stat n="$209bn" l="SVB 2023" />
        </div>
        <div className="mt-10 text-[14px] text-[rgba(255,255,255,0.55)] max-w-3xl leading-relaxed">
          S&amp;P/Moody&apos;s/Fitch publish credit ratings — backward-looking. Bloomberg sells price data — no risk signal. Big-4 audit — once a year, retrospective. The market is structurally blind to forward operational risk.
        </div>
      </Slide>

      {/* SLIDE 03 — WHAT GENESIS IS */}
      <Slide id="03">
        <SlideTitle num="03" label="What Genesis Is" accent="#9b6dff" />
        <h2 className="text-5xl sm:text-6xl font-black text-white tracking-tight leading-none mb-8">
          11 specialised AI bots.<br />
          <span className="text-[#9b6dff]">One Pre-Crime Index per entity.</span>
        </h2>
        <p className="text-xl text-[rgba(255,255,255,0.75)] max-w-3xl leading-relaxed mb-10">
          Each bot specialises in one input stream — regulator filings, prospectuses, news, social signals, audits, earnings calls. Aggregated into a single 0-100 operational-risk score per entity, published openly.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat n="100" l="entities live" />
          <Stat n="11"  l="scoring bots" />
          <Stat n="18mo" l="reveal window" />
          <Stat n="BTC" l="anchored ledger" />
        </div>
        <div className="mt-10 text-[14px] text-[rgba(255,255,255,0.55)] max-w-3xl leading-relaxed">
          The Book of Genesis (100 sealed prophecies) is cryptographically committed via Merkle root and anchored to Bitcoin through OpenTimestamps. Anyone, anywhere, anytime can prove the scoring date.
        </div>
      </Slide>

      {/* SLIDE 04 — THE WATCH LIST */}
      <Slide id="04">
        <SlideTitle num="04" label="The Watch List · The Wedge" accent="#ff3366" icon={<Crosshair className="w-4 h-4 text-[#ff3366]" />} />
        <h2 className="text-5xl sm:text-6xl font-black text-white tracking-tight leading-none mb-8">
          5 named EU entities.<br />
          <span className="text-[#ff3366]">18 months to be right.</span>
        </h2>
        <p className="text-xl text-[rgba(255,255,255,0.75)] max-w-3xl leading-relaxed mb-10">
          Bitcoin-anchored, falsifiable forecast of operational-risk events. Published 2026-05-30. No other vendor cryptographically commits its predictions. We do.
        </p>
        <div className="rounded-2xl p-6 mb-6"
          style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(247,147,26,0.3)', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Bitcoin className="w-4 h-4 text-[#f7931a]" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-[#f7931a]">SHA-256 · BTC-anchored</span>
          </div>
          <div className="font-mono text-[12px] text-white break-all">9e52141ce22948f8ea7d6bd354a73b2f0fba2d3e25d1596360a03096a9a059d1</div>
        </div>
        <div className="text-[14px] text-[rgba(255,255,255,0.55)] max-w-3xl leading-relaxed">
          When one of the five triggers a vindication event (enforcement action, fine, audit qualification, leadership departure, share-price stress), the Genesis Obituary engine activates and publishes a forensic post-mortem within six hours. We become the canonical post-collapse source.
        </div>
        <Link href="/watchlist"
          className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-full text-[12px] uppercase tracking-wider font-bold transition-all"
          style={{ background: 'rgba(255,51,102,0.15)', border: '1px solid rgba(255,51,102,0.5)', color: '#ff3366' }}>
          /watchlist →
        </Link>
      </Slide>

      {/* SLIDE 05 — WHY NOW */}
      <Slide id="05">
        <SlideTitle num="05" label="Why Now · Why Us" accent="#4a9eff" />
        <h2 className="text-5xl sm:text-6xl font-black text-white tracking-tight leading-none mb-8">
          DORA. AIFMD II.<br />
          <span className="text-[#4a9eff]">The decade of operational risk.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <div className="rounded-2xl p-5" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(74,158,255,0.25)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#4a9eff] font-bold mb-2">Regulatory tailwind</div>
            <div className="text-[14px] text-[rgba(255,255,255,0.8)] leading-relaxed">
              DORA effective 17 January 2025. AIFMD II in force from 16 April 2024. SFDR Art-8/9 scrutiny rising. Every regulated EU fund must demonstrate operational-risk discipline, on annual cadence, with audit trail.
            </div>
          </div>
          <div className="rounded-2xl p-5" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(74,158,255,0.25)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#4a9eff] font-bold mb-2">Why us</div>
            <div className="text-[14px] text-[rgba(255,255,255,0.8)] leading-relaxed">
              16-year-old solo founder with deep AI + compliance + crypto stack. Built the engine, the Book, the Watch List, the Obituary in three months. Asymmetric profile: motivated, low burn, fast.
            </div>
          </div>
        </div>
      </Slide>

      {/* SLIDE 06 — THE MOATS */}
      <Slide id="06">
        <SlideTitle num="06" label="The Moats" accent="#9b6dff" />
        <h2 className="text-5xl sm:text-6xl font-black text-white tracking-tight leading-none mb-8">
          Five things<br />
          <span className="text-[#9b6dff]">Bloomberg cannot ship.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          <Moat icon={<Eye className="w-4 h-4 text-[#00d8ff]" />} title="Mirror" desc="Promised vs observed across every AIFMD/Pillar-3 claim. Drift detection no vendor publishes." accent="#00d8ff" />
          <Moat icon={<Network className="w-4 h-4 text-[#9b6dff]" />} title="Network" desc="250+ counterparty edges. Risk propagates 3 hops. The Bloomberg-Terminal-for-EU-funds shape." accent="#9b6dff" />
          <Moat icon={<BarChart3 className="w-4 h-4 text-[#ff7a00]" />} title="Twin" desc="Monte Carlo stress simulator. 10k trials × 6 scenarios per entity. Citadel-shape modelling, open." accent="#ff7a00" />
          <Moat icon={<Brain className="w-4 h-4 text-[#00d8ff]" />} title="Codex" desc="Open compliance LLM. API now. Self-hostable .gguf in Q4. AI-infrastructure positioning." accent="#00d8ff" />
          <Moat icon={<AlertOctagon className="w-4 h-4 text-[#ff3366]" />} title="Obituary" desc="Canonical forensic post-mortem when an entity fails. Cited by press, reflexively." accent="#ff3366" />
          <Moat icon={<Crosshair className="w-4 h-4 text-[#ff3366]" />} title="Watch List" desc="Bitcoin-anchored falsifiable forecast. The press lever. The credibility multiplier." accent="#ff3366" />
        </div>
      </Slide>

      {/* SLIDE 07 — DISTRIBUTION */}
      <Slide id="07">
        <SlideTitle num="07" label="Distribution" accent="#00d8ff" />
        <h2 className="text-5xl sm:text-6xl font-black text-white tracking-tight leading-none mb-8">
          Embedded in<br />
          <span className="text-[#00d8ff]">every LLM stack.</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          <DistroBox label="MCP Server" detail="Call from ChatGPT / Claude / Cursor / Copilot natively. One config line." />
          <DistroBox label="On-chain Oracle" detail="DeFi lending, RWA tokenization, on-chain insurance read PCI scores. Signed HTTP." />
          <DistroBox label="12-bot Sentinel" detail="Autonomous agents posting findings to /sentinel + cross-posting to X. Distribution flywheel." />
          <DistroBox label="Embeddable badges" detail="Any compliance dashboard can show Genesis score via iframe. Federation API open." />
          <DistroBox label="Daily briefing" detail="Morning email to compliance officers. Audience asset compounds independent of product." />
          <DistroBox label="Press cycle" detail="Watch List → Obituary → cited in Reuters/FT. Brand becomes regulatory canon." />
        </div>
      </Slide>

      {/* SLIDE 08 — REVENUE MODEL */}
      <Slide id="08">
        <SlideTitle num="08" label="Revenue Model" accent="#00ff88" />
        <h2 className="text-5xl sm:text-6xl font-black text-white tracking-tight leading-none mb-8">
          Two-sided economics.<br />
          <span className="text-[#00ff88]">LPs free. Entities pay.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          <div className="rounded-2xl p-5" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.25)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#00ff88] font-bold mb-2">Reverse Onboarding (the wedge)</div>
            <div className="text-3xl font-black text-white mb-1">€5K-€15K</div>
            <div className="text-[11px] text-[rgba(255,255,255,0.6)] mb-3">/entity · one-time + €1K-€3K /year</div>
            <div className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed">
              Entities apply to be added to the Book. Yelp-claim model. At 200 paying entities = <strong className="text-white">€3M-€10M ARR ceiling.</strong>
            </div>
          </div>
          <div className="rounded-2xl p-5" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(155,109,255,0.25)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#9b6dff] font-bold mb-2">SaaS · LP-side</div>
            <div className="text-3xl font-black text-white mb-1">€2.5K-€5K</div>
            <div className="text-[11px] text-[rgba(255,255,255,0.6)] mb-3">/fund /month (Standard / Pro)</div>
            <div className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed">
              AIFMs and ManCos buy a seat to use Mirror, Network, Twin, Witness, Whistleblower. 200 funds = <strong className="text-white">€6M-€12M ARR.</strong>
            </div>
          </div>
        </div>
        <div className="text-[14px] text-[rgba(255,255,255,0.55)] max-w-3xl leading-relaxed">
          Combined ceiling at 24 months: <strong className="text-white">€10M-€20M ARR.</strong> At 8-12x revenue multiple (regtech median), that&apos;s €80M-€240M exit valuation. The €50M sale is the floor, not the ceiling.
        </div>
      </Slide>

      {/* SLIDE 09 — TRACTION */}
      <Slide id="09">
        <SlideTitle num="09" label="Traction" accent="#ffaa00" />
        <h2 className="text-5xl sm:text-6xl font-black text-white tracking-tight leading-none mb-8">
          What is already built<br />
          <span className="text-[#ffaa00]">and live in production.</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          <Stat n="38" l="pages live" />
          <Stat n="18" l="API routes" />
          <Stat n="100" l="sealed prophecies" />
          <Stat n="5"  l="forensic Obituaries" />
          <Stat n="250+" l="counterparty edges" />
          <Stat n="12" l="autonomous bots" />
          <Stat n="6"  l="stress scenarios" />
          <Stat n="BTC" l="anchored ledger" />
        </div>
        <div className="text-[14px] text-[rgba(255,255,255,0.55)] max-w-3xl leading-relaxed mb-6">
          All in three months by one person. Zero burn. Zero outside funding. The product is so far past MVP that the gap is not engineering — it is distribution. That is what the seed funds.
        </div>
        <Link href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] uppercase tracking-wider font-bold transition-all"
          style={{ background: 'rgba(255,170,0,0.12)', border: '1px solid rgba(255,170,0,0.5)', color: '#ffaa00' }}>
          Genesis homepage →
        </Link>
      </Slide>

      {/* SLIDE 10 — ROADMAP */}
      <Slide id="10">
        <SlideTitle num="10" label="Roadmap · 12 months" accent="#4a9eff" />
        <h2 className="text-5xl sm:text-6xl font-black text-white tracking-tight leading-none mb-8">
          From sealed bet<br />
          <span className="text-[#4a9eff]">to seed close.</span>
        </h2>
        <div className="space-y-3 mb-10">
          <RoadmapRow q="Now" what="Watch List press push. 5-tier reporter outreach. First press cycle." />
          <RoadmapRow q="Q3 2026" what="First 10 pilot AIFMs at €5K-€10K MRR. Luxembourg SARL formation." />
          <RoadmapRow q="Q4 2026" what="Codex .gguf release on Hugging Face. Open-source flywheel begins." />
          <RoadmapRow q="Q1 2027" what="First Watch List vindication. Obituary engine activates. Inbound investor cycle." />
          <RoadmapRow q="Q2 2027" what="Seed round close at €30M-€50M valuation. Hire compliance partner + senior engineer + GTM." />
        </div>
      </Slide>

      {/* SLIDE 11 — THE ASK */}
      <Slide id="11">
        <SlideTitle num="11" label="The Ask" accent="#ff3366" />
        <h2 className="text-5xl sm:text-6xl font-black text-white tracking-tight leading-none mb-8">
          €1M-€2M pre-seed.<br />
          <span className="text-[#ff3366]">€10M-€15M valuation.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
          <AskBox amount="€600K" what="Compliance partner + senior engineer + GTM hire — first 3 hires." />
          <AskBox amount="€250K" what="Luxembourg presence: SARL formation, regulatory advisory, fiduciaire, real estate." />
          <AskBox amount="€150K" what="Customer-acquisition runway: press, conferences, paid pilots." />
        </div>
        <div className="text-[14px] text-[rgba(255,255,255,0.55)] max-w-3xl leading-relaxed">
          18-month runway to seed close. Target lead: a single conviction angel (€200K-€500K) plus 4-6 syndicate participants. Strategic preferred over financial.
        </div>
      </Slide>

      {/* SLIDE 12 — CONTACT */}
      <Slide id="12">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8"
            style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <Send className="w-3 h-3 text-[#9b6dff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#9b6dff]">12 of 12</span>
          </div>
          <h2 className="text-5xl sm:text-7xl font-black text-white tracking-tight leading-none mb-8">
            <span style={{
              background: 'linear-gradient(90deg, #9b6dff 0%, #ff3366 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>Daman Sharma.</span>
          </h2>
          <p className="text-2xl text-[rgba(255,255,255,0.85)] leading-relaxed mb-8">
            16. Luxembourg-bound (currently India).<br />Founder &amp; everything-else.
          </p>
          <div className="space-y-2 mb-10">
            <div className="text-[14px]"><span className="text-[rgba(255,255,255,0.5)]">Direct line · </span><a href="mailto:daman.sharma.2310@gmail.com" className="text-[#9b6dff] hover:underline">daman.sharma.2310@gmail.com</a></div>
            <div className="text-[14px]"><span className="text-[rgba(255,255,255,0.5)]">Product · </span><a href="https://genesis-swarm-rgq5.vercel.app" className="text-[#9b6dff] hover:underline">genesis-swarm-rgq5.vercel.app</a></div>
            <div className="text-[14px]"><span className="text-[rgba(255,255,255,0.5)]">Watch List · </span><a href="/watchlist" className="text-[#9b6dff] hover:underline">/watchlist</a></div>
            <div className="text-[14px]"><span className="text-[rgba(255,255,255,0.5)]">The Book · </span><a href="/book" className="text-[#9b6dff] hover:underline">/book</a></div>
            <div className="text-[14px]"><span className="text-[rgba(255,255,255,0.5)]">Obituaries · </span><a href="/obituary" className="text-[#9b6dff] hover:underline">/obituary</a></div>
          </div>
          <div className="text-[12px] uppercase tracking-[0.3em] text-[rgba(255,255,255,0.4)]">
            The kid who anchored predictions on Bitcoin.
          </div>
        </div>
      </Slide>

      {/* PRINT STYLES */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .slide { page-break-after: always; min-height: 100vh; }
        }
      `}</style>
    </div>
  )
}

function Slide({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id}
      className="slide relative min-h-screen flex items-center justify-center px-6 sm:px-10 py-20"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="max-w-6xl w-full">{children}</div>
    </section>
  )
}

function SlideTitle({ num, label, accent, icon }: { num: string; label: string; accent: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <span className="text-[10px] uppercase tracking-[0.25em] font-mono font-black" style={{ color: accent }}>{num} / 12</span>
      <span className="w-8 h-px" style={{ background: `${accent}50` }} />
      {icon}
      <span className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: accent }}>{label}</span>
    </div>
  )
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="rounded-xl p-4 text-center"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
      <div className="text-3xl font-black text-white mb-1">{n}</div>
      <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.5)]">{l}</div>
    </div>
  )
}

function Moat({ icon, title, desc, accent }: { icon: React.ReactNode; title: string; desc: string; accent: string }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${accent}30`, backdropFilter: 'blur(8px)' }}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-[14px] font-bold text-white">{title}</span></div>
      <div className="text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed">{desc}</div>
    </div>
  )
}

function DistroBox({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,216,255,0.25)', backdropFilter: 'blur(8px)' }}>
      <div className="text-[13px] font-bold text-white mb-1.5">{label}</div>
      <div className="text-[11px] text-[rgba(255,255,255,0.6)] leading-relaxed">{detail}</div>
    </div>
  )
}

function RoadmapRow({ q, what }: { q: string; what: string }) {
  return (
    <div className="rounded-xl p-4 grid grid-cols-[100px_1fr] gap-4 items-center"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(74,158,255,0.2)', backdropFilter: 'blur(8px)' }}>
      <div className="text-[12px] font-mono uppercase tracking-wider font-black text-[#4a9eff]">{q}</div>
      <div className="text-[13px] text-[rgba(255,255,255,0.8)] leading-relaxed">{what}</div>
    </div>
  )
}

function AskBox({ amount, what }: { amount: string; what: string }) {
  return (
    <div className="rounded-xl p-5"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,51,102,0.25)', backdropFilter: 'blur(8px)' }}>
      <div className="text-3xl font-black text-white mb-2">{amount}</div>
      <div className="text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed">{what}</div>
    </div>
  )
}
