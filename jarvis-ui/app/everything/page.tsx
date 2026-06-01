import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Activity, Sparkles, ShieldCheck, Scale, FileText,
  Coins, Newspaper, AlertOctagon, MessageSquare, TrendingUp, Code2, Chrome,
  Bot, Target, Mail, Lock, BarChart3, Play, Key, Crown, Search, Globe2,
  Gavel, Eye as EyeIcon, BookOpen, Rewind, ScrollText,
  Tv2, Crosshair, Feather, Users, BookMarked, Network,
} from 'lucide-react'

interface Group {
  title: string
  accent: string
  items: { href: string; label: string; Icon: React.ElementType; desc: string; tag?: string }[]
}

const GROUPS: Group[] = [
  {
    title: 'Mythological tier',
    accent: '#9b6dff',
    items: [
      { href: '/book',         label: 'The Book of Genesis',     Icon: BookOpen,    desc: '100 sealed prophecies, anchored on Bitcoin\'s blockchain',     tag: 'PEAK' },
      { href: '/predictions',  label: 'Pre-Registered Predictions', Icon: Crown,   desc: '10 named, dated, falsifiable forecasts · 18-month window',     tag: 'PROOF' },
      { href: '/mcp',          label: 'Genesis MCP Server',      Icon: Bot,         desc: 'Call Genesis from ChatGPT, Claude, Cursor natively',           tag: 'AI-native' },
      { href: '/timemachine',  label: 'The Time Machine',        Icon: Rewind,      desc: 'Backtest accuracy: every major EU collapse caught early',      tag: 'backtest' },
      { href: '/warroom',      label: 'The War Room',            Icon: Tv2,         desc: '24/7 ambient surveillance feed · background TV for finance',   tag: 'LIVE 24/7' },
      { href: '/replay',       label: 'The Replay Engine',       Icon: Rewind,      desc: 'Time-travel through historical collapses, bot-by-bot',         tag: 'interactive' },
      { href: '/daily',        label: 'The Genesis Daily',       Icon: Mail,        desc: 'Free 5-min morning brief · 07:00 UTC daily',                   tag: 'subscribe' },
      { href: '/vindications', label: 'Vindication Log',         Icon: AlertOctagon, desc: 'Every Book prediction confirmed by press · AI verified',     tag: 'live log' },
      { href: '/bounty',       label: 'The Genesis Bounty',      Icon: Crosshair,   desc: '€10,000 if you can fool the Genesis engine',                   tag: '€10K' },
      { href: '/doctrine',     label: 'The Daman Doctrine',      Icon: Feather,     desc: 'Founder manifesto: why AI replaces compliance',                 tag: 'manifesto' },
      { href: '/coalition',    label: 'The Coalition',           Icon: Users,       desc: 'Institutional LP pledge to use independent AI scores',         tag: 'pledge' },
      { href: '/etf',          label: 'GENESIS-50 Index',        Icon: Coins,       desc: 'ETF licensing — top 50 EU funds by Genesis Score',             tag: 'license' },
      { href: '/almanac',      label: 'The Genesis Almanac',     Icon: BookMarked,  desc: 'Printed annual hardback · free to every EU regulator',         tag: 'physical' },
      { href: '/federation',   label: 'The Federation',          Icon: Network,     desc: 'Open API — publish your compliance scores into Genesis',       tag: 'open api' },
      { href: '/prophecy',     label: 'Prophecy Engine',         Icon: Lock,        desc: 'Cryptographically sealed fund predictions, Merkle-anchored',  tag: 'out-of-universe' },
      { href: '/court',        label: 'Constitutional Court',    Icon: Gavel,       desc: '3 AI judges deliberate live · verdict with dissents',         tag: 'live theater' },
      { href: '/eye',          label: 'The Eye',                 Icon: EyeIcon,     desc: 'Surveillance scan on any entity · public append-only log',    tag: 'public log' },
      { href: '/funds',        label: 'The 35,000 Project',      Icon: Globe2,      desc: 'A Genesis dossier for every legal entity · 2.4M LEIs',        tag: '2.4M LEIs' },
      { href: '/protocol',     label: 'Genesis Protocol',        Icon: BookOpen,    desc: 'GENESIS-1 open standard for operational-risk reporting',      tag: 'open standard' },
    ],
  },
  {
    title: 'Live monitoring',
    accent: '#00ff88',
    items: [
      { href: '/operator',     label: 'Operator Dashboard',      Icon: Activity,     desc: '11 bots · 3D threat globe · live events · AI console',           tag: 'flagship' },
      { href: '/intelligence', label: 'Regulatory Intelligence', Icon: Newspaper,    desc: 'CSSF + EBA + ESMA news, framework-tagged',                       tag: 'live' },
      { href: '/status',       label: 'System Status',           Icon: BarChart3,    desc: 'Real probes on OFAC, GLEIF, ECB, Groq',                          tag: 'live' },
      { href: '/chat',         label: 'Compliance Chat',         Icon: MessageSquare, desc: 'Voice + text JARVIS AI',                                         tag: 'voice' },
    ],
  },
  {
    title: 'AI tools',
    accent: '#9b6dff',
    items: [
      { href: '/audit',        label: '60-Minute Audit Pack',    Icon: ShieldCheck,  desc: 'Regulator question → signed PDF in 60 seconds',                  tag: 'killer feature' },
      { href: '/opinion',      label: 'AI Legal Opinion',        Icon: Scale,        desc: '€3K legal memo → €99 AI version',                                tag: '€99' },
      { href: '/analyze',      label: 'PDF Prospectus Analyzer', Icon: FileText,     desc: 'Drop a fund PDF → AI gap analysis',                              tag: 'drop pdf' },
      { href: '/fund-score',   label: 'Fund Health Score',       Icon: TrendingUp,   desc: 'Instant compliance score for any fund name' },
      { href: '/token-screen', label: 'RWA Token Compliance',    Icon: Coins,        desc: 'Screen ERC-20 / ERC-3643 on 4 chains',                           tag: 'first-mover' },
      { href: '/case-studies', label: 'Forensic Case Studies',   Icon: AlertOctagon, desc: 'Wirecard · Greensill · Madoff · Archegos' },
      { href: '/demo',         label: 'Wirecard Replay Demo',    Icon: Play,         desc: '5-stage live fraud pipeline' },
    ],
  },
  {
    title: 'Developers',
    accent: '#4a9eff',
    items: [
      { href: '/docs',         label: 'API Documentation',       Icon: Code2,        desc: '6 endpoints · curl/Python/TS examples',                          tag: 'rest api' },
      { href: '/extension',    label: 'Chrome Extension',        Icon: Chrome,       desc: 'Hover any company → instant OFAC popup',                         tag: 'install' },
      { href: '/gpt',          label: 'ChatGPT Integration',     Icon: Bot,          desc: 'Publish a Custom GPT calling our actions',                       tag: 'gpt store' },
      { href: '/embed-docs',   label: 'Embed the Genesis Score', Icon: Code2,        desc: '"Verified by Genesis" badges any site can drop in',              tag: 'iframe' },
    ],
  },
  {
    title: 'Account',
    accent: '#ffaa00',
    items: [
      { href: '/dashboard', label: 'My Dashboard',     Icon: Sparkles, desc: 'Saved analyses · API keys · alerts · plan' },
      { href: '/login',     label: 'Sign In',          Icon: Key,      desc: 'Magic-link passwordless auth' },
      { href: '/trial',     label: 'Start Free Trial', Icon: Crown,    desc: '14-day Pro tier · no card required' },
    ],
  },
  {
    title: 'Company',
    accent: '#ff3366',
    items: [
      { href: '/',          label: 'Home / Marketing',  Icon: Globe2,   desc: 'Landing page, hero, pricing' },
      { href: '/about',     label: 'About · Founder',   Icon: Globe2,   desc: 'Daman Sharma, 16, Luxembourg, €50M target' },
      { href: '/investors', label: 'Investor Data Room', Icon: Target,  desc: 'Thesis, traction, moat, the ask' },
      { href: '/press',     label: 'Press Kit',         Icon: Mail,     desc: 'Logos, one-liners, boilerplate' },
      { href: '/onepager',  label: 'One-Pager',         Icon: FileText, desc: 'Single-page product overview' },
      { href: '/privacy',   label: 'Privacy Policy',    Icon: Lock,     desc: 'GDPR · GPT-Store compliant' },
      { href: '/legal',     label: 'Legal & Terms',     Icon: ScrollText, desc: 'Terms of use · AI disclaimer · right-to-erasure' },
    ],
  },
]

const totalCount = GROUPS.reduce((s, g) => s + g.items.length, 0)

export default function EverythingPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Search className="w-4 h-4 text-[#00ff88]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">EVERYTHING</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-14">

        <div className="mb-10 text-center">
          <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.5rem)', lineHeight: 1 }}>
            <span className="text-white">Every Genesis Swarm</span>
            <br />
            <span style={{ background: 'linear-gradient(90deg, #00ff88 0%, #4a9eff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              feature in one place.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-base max-w-2xl mx-auto leading-relaxed">
            {totalCount} pages, 6 API endpoints, 4 cron jobs, voice JARVIS, 3D threat globe,
            Chrome extension, ChatGPT integration.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)' }}>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#00ff88] font-bold">PRO TIP</span>
            <span className="text-[12px] text-[rgba(255,255,255,0.7)]">
              Press <kbd className="font-mono font-bold mx-1 px-1.5 py-0.5 rounded text-[10px]"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>⌘K</kbd>
              anywhere to jump
            </span>
          </div>
        </div>

        {GROUPS.map(group => (
          <section key={group.title} className="mb-10">
            <div className="text-[10px] uppercase tracking-[0.25em] font-black mb-3"
              style={{ color: group.accent }}>
              {group.title}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map(it => (
                <Link key={it.href} href={it.href}
                  className="group rounded-xl p-5 transition-all hover:scale-[1.02]"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${group.accent}22`,
                  }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{
                        background: `${group.accent}10`,
                        border: `1px solid ${group.accent}40`,
                        boxShadow: `0 0 16px ${group.accent}20`,
                      }}>
                      <it.Icon className="w-5 h-5" style={{ color: group.accent }} />
                    </div>
                    {it.tag && (
                      <span className="text-[8px] uppercase tracking-widest font-black px-2 py-0.5 rounded-full"
                        style={{ background: `${group.accent}15`, border: `1px solid ${group.accent}40`, color: group.accent }}>
                        {it.tag}
                      </span>
                    )}
                  </div>
                  <div className="text-[14px] font-black text-white mb-1 flex items-center gap-1.5">
                    {it.label}
                    <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: group.accent }} />
                  </div>
                  <div className="text-[11px] text-[rgba(255,255,255,0.55)] leading-relaxed">{it.desc}</div>
                  <div className="text-[9px] font-mono mt-2 opacity-60" style={{ color: group.accent }}>{it.href}</div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {/* CTA */}
        <section className="rounded-2xl p-8 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(74,158,255,0.03) 100%)',
            border: '1px solid rgba(0,255,136,0.3)',
          }}>
          <Sparkles className="w-8 h-8 text-[#00ff88] mx-auto mb-3" />
          <h2 className="text-2xl font-black text-white mb-2">Anything else?</h2>
          <p className="text-[rgba(255,255,255,0.55)] text-[13px] mb-5 max-w-xl mx-auto">
            Feature request, pilot inquiry, investor intro? One inbox, one founder.
          </p>
          <a href="mailto:daman.sharma.2310@gmail.com"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black"
            style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)', color: '#000', boxShadow: '0 0 24px rgba(0,255,136,0.4)' }}>
            <Mail className="w-4 h-4" /> daman.sharma.2310@gmail.com
          </a>
        </section>

      </div>
    </div>
  )
}
