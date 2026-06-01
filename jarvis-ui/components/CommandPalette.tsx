'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Activity, Sparkles, ShieldCheck, Scale, FileText, Coins, Newspaper,
  AlertOctagon, MessageSquare, TrendingUp, Code2, Chrome, Bot, Target,
  Mail, Lock, BarChart3, Play, Key, Crown, Search, Globe2,
  Gavel, Eye as EyeIcon, BookOpen, Rewind, ScrollText,
  Tv2, Crosshair, Feather, Users, BookMarked, Network, Anchor, Cpu, Brain, Award, Landmark, Boxes,
} from 'lucide-react'

interface Item {
  href: string
  label: string
  description: string
  group: 'Mythological' | 'Tools' | 'Developers' | 'Company' | 'Account' | 'Live'
  Icon: React.ElementType
  keywords: string[]
}

const ITEMS: Item[] = [
  // Mythological tier
  { href: '/book',            label: 'The Book of Genesis',          description: '100 sealed prophecies · anchored on Bitcoin\'s blockchain',          group: 'Mythological', Icon: BookOpen,    keywords: ['book','genesis','100','bitcoin','blockchain','prophecies','sealed','peak'] },
  { href: '/anchor',          label: 'Bitcoin Anchor Proof',         description: 'Verify the Book\'s Merkle root on Bitcoin · OpenTimestamps receipt',  group: 'Mythological', Icon: Anchor,      keywords: ['anchor','bitcoin','proof','opentimestamps','ots','verify','timestamp','merkle','immutable'] },
  { href: '/globe',           label: 'Genesis Globe',                description: 'All 100 prophecies plotted in 3D · color-graded by Pre-Crime Index',  group: 'Mythological', Icon: Globe2,      keywords: ['globe','3d','map','jurisdiction','geographic','world','heatmap','threat'] },
  { href: '/network',         label: 'Genesis Network',              description: 'Counterparty exposure graph · contagion ripples 3 hops along edges',  group: 'Mythological', Icon: Network,     keywords: ['network','graph','counterparty','contagion','edges','custody','prime broker','bloomberg'] },
  { href: '/oracle',          label: 'Genesis Oracle',               description: 'Signed Genesis scores over HTTP · DeFi/RWA/insurance read on-chain',  group: 'Developers',   Icon: Cpu,         keywords: ['oracle','chainlink','onchain','solidity','defi','rwa','smart contract','tokenization'] },
  { href: '/whistleblower',   label: 'Sealed Whistleblower',         description: 'Commit-reveal insider tips · we never see the contents, ever',        group: 'Mythological', Icon: ShieldCheck, keywords: ['whistleblower','insider','tip','sealed','sha256','commit','reveal','anonymous'] },
  { href: '/witness',         label: 'Board Witness',                description: 'Board members publicly attest to having reviewed a prophecy',          group: 'Mythological', Icon: Gavel,       keywords: ['witness','board','director','attestation','d&o','liability','aifmd','sign'] },
  { href: '/mirror',          label: 'Prospectus Mirror',            description: 'Promised vs observed · is the fund following its own prospectus rules', group: 'Mythological', Icon: EyeIcon,     keywords: ['mirror','prospectus','aifmd','drift','breach','tier1','solvency','nav deviation','reality check'] },
  { href: '/obituary',        label: 'Genesis Obituary',             description: 'Forensic post-mortems of Wirecard, Greensill, Archegos, FTX, SVB',     group: 'Mythological', Icon: AlertOctagon, keywords: ['obituary','wirecard','greensill','archegos','ftx','svb','forensic','post-mortem','backcast'] },
  { href: '/twin',            label: 'Genesis Twin',                 description: 'Monte Carlo stress simulator · 10k trials per entity per scenario',    group: 'Mythological', Icon: BarChart3,   keywords: ['twin','monte carlo','stress test','simulation','rate shock','credit crunch','redemption'] },
  { href: '/sentinel',        label: 'Genesis Sentinel',             description: '12 autonomous agents posting findings live · the AI lab feed',         group: 'Mythological', Icon: Activity,    keywords: ['sentinel','bots','autonomous','agents','feed','live','ai lab','vesta','cassius'] },
  { href: '/codex',           label: 'Genesis Codex',                description: 'Open compliance LLM · API now · self-hostable .gguf in Q4',           group: 'Developers',   Icon: Brain,       keywords: ['codex','llm','model','gguf','llama','aifmd','ucits','sfdr','self-host','open source'] },
  { href: '/claim',           label: 'Claim Your Listing',           description: 'Entity reverse-onboarding · €5K + €1K/yr · Yelp-claim model for compliance', group: 'Company',  Icon: Award,       keywords: ['claim','listing','reverse','onboarding','apply','be scored','entity','revenue','tier','pricing'] },
  { href: '/watchlist',       label: 'The Watch List 2026-27',       description: '5 named EU entities · cryptographically committed · Bitcoin-anchored',  group: 'Mythological', Icon: Crosshair,   keywords: ['watch list','watchlist','prediction','5 entities','bitcoin anchored','press','reuters','ft'] },
  { href: '/deck',            label: 'Pitch Deck',                   description: '12-slide pre-seed deck · scroll, screenshot, share · €1M-€2M at €10M-€15M',     group: 'Company',      Icon: Sparkles,    keywords: ['deck','pitch','investor','seed','round','valuation','slides','presentation'] },
  { href: '/independence',    label: 'Independence Pledge',          description: 'Six pledges · we never accept payment from any entity we score',         group: 'Company',      Icon: Scale,       keywords: ['independence','pledge','conflict','interest','norm ai','sp','moodys','structural','vs'] },
  { href: '/research',        label: 'Foresight Lab',                description: 'Open methodology · academic research · cited findings · CC-BY 4.0',     group: 'Developers',   Icon: FileText,    keywords: ['research','foresight','paper','methodology','academic','lab','citation','cryptographic'] },
  { href: '/architecture',    label: 'The Genesis Engine · 7 Pillars', description: 'Law as software · code-to-law, ZK vaults, red-team, precedent, topology, twins, kinetic', group: 'Developers', Icon: Cpu,    keywords: ['architecture','engine','pillars','code-to-law','zero knowledge','red team','topology','kinetic','compliance kernel','loop'] },
  { href: '/lux',             label: 'Luxembourg RegTech · 5 Engines', description: 'Live CSSF 24/856 substance, reconciliation, AIFMD II, e-ID, 18/698 delegation', group: 'Developers', Icon: Landmark, keywords: ['luxembourg','cssf','aifmd','substance','24/856','18/698','e-identification','delegation','reconciliation','regtech','engines'] },
  { href: '/clearing',        label: 'Clearing Matrix · live crypto',  description: 'Escrow breaker + proof-of-substance ring + real Paillier homomorphic compute', group: 'Developers', Icon: Boxes,    keywords: ['clearing','escrow','paillier','homomorphic','encryption','zero knowledge','bls','dark pool','crypto','solidity'] },
  { href: '/lookup',          label: 'Search Your Exposure',         description: 'Type any counterparty name · instant exposure check across the Book',  group: 'Live',         Icon: Target,      keywords: ['lookup','search','counterparty','exposure','my fund','find','my bank'] },
  { href: '/predictions',     label: 'Pre-Registered Predictions',   description: '10 named, dated, falsifiable forecasts · 18-month verdict window',  group: 'Mythological', Icon: Crown,       keywords: ['predictions','live','forecasts','dated','pre-registered','top 10'] },
  { href: '/mcp',             label: 'Genesis MCP Server',           description: 'Call Genesis from ChatGPT, Claude, Cursor — JSON-RPC over HTTP',     group: 'Developers',   Icon: Bot,         keywords: ['mcp','model context protocol','ai','llm','chatgpt','claude','cursor','tool'] },
  { href: '/timemachine',     label: 'The Time Machine',             description: 'Backtest: Genesis would have caught every major EU collapse',        group: 'Mythological', Icon: Rewind,      keywords: ['time machine','backtest','accuracy','wirecard','foresight','proof'] },
  { href: '/warroom',         label: 'The War Room',                 description: '24/7 ambient surveillance feed · live globe',                        group: 'Mythological', Icon: Tv2,         keywords: ['war room','livestream','feed','ambient','tv','globe'] },
  { href: '/replay',          label: 'The Replay Engine',            description: 'Time-travel through Wirecard, FTX, Greensill, Archegos, Madoff',     group: 'Mythological', Icon: Rewind,      keywords: ['replay','wirecard','ftx','greensill','archegos','madoff','timeline','historical'] },
  { href: '/daily',           label: 'The Genesis Daily',            description: 'Free 5-min morning brief · 07:00 UTC daily',                         group: 'Mythological', Icon: Mail,        keywords: ['daily','newsletter','email','subscribe','brief','morning'] },
  { href: '/vindications',    label: 'Vindication Log',              description: 'Every Book prediction confirmed by external press · AI verified',    group: 'Mythological', Icon: AlertOctagon, keywords: ['vindication','vindications','log','confirmed','news','hits','press'] },
  { href: '/bounty',          label: 'The Genesis Bounty',           description: '€10,000 if you can fool the Genesis scoring engine',                  group: 'Mythological', Icon: Crosshair,   keywords: ['bounty','adversarial','fool','break','researcher','prize'] },
  { href: '/doctrine',        label: 'The Daman Doctrine',           description: 'Founder manifesto: why AI replaces compliance',                      group: 'Mythological', Icon: Feather,     keywords: ['doctrine','manifesto','daman','founder','essay','vision'] },
  { href: '/coalition',       label: 'The Anti-Wirecard Coalition',  description: 'Institutional LP pledge to use independent AI risk scores',           group: 'Mythological', Icon: Users,       keywords: ['coalition','pledge','lp','signatory','wirecard','anti'] },
  { href: '/etf',             label: 'GENESIS-50 Index',             description: 'ETF licensing pitch · top 50 EU funds by Genesis Score',             group: 'Mythological', Icon: Coins,       keywords: ['etf','index','genesis-50','licensing','msci','asset manager'] },
  { href: '/almanac',         label: 'The Genesis Almanac',          description: 'Printed annual hardback · mailed free to regulators',                group: 'Mythological', Icon: BookMarked,  keywords: ['almanac','hardback','printed','annual','book','physical'] },
  { href: '/federation',      label: 'The Genesis Federation',       description: 'Open API — publish your compliance scores into the ledger',           group: 'Mythological', Icon: Network,     keywords: ['federation','api','publish','aggregator','github of compliance'] },
  { href: '/prophecy',        label: 'Prophecy Engine',              description: 'Cryptographically sealed predictions · Merkle anchored',            group: 'Mythological', Icon: Lock,        keywords: ['prophecy','prediction','seal','merkle','oracle','foresight'] },
  { href: '/court',           label: 'Constitutional Court',         description: '3 AI judges deliberate · live verdict with dissents',                group: 'Mythological', Icon: Gavel,       keywords: ['court','court','justice','judge','prosecutor','defender','verdict'] },
  { href: '/eye',             label: 'The Eye',                      description: 'Live surveillance scan · public append-only log',                    group: 'Mythological', Icon: EyeIcon,     keywords: ['eye','surveillance','scan','investigation','live'] },
  { href: '/funds',           label: 'The 35,000 Project',           description: 'A Genesis dossier for every legal entity · 2.4M LEIs',               group: 'Mythological', Icon: Globe2,      keywords: ['funds','35000','lei','gleif','dossier','wikipedia','public'] },
  { href: '/protocol',        label: 'Genesis Protocol',             description: 'GENESIS-1 open standard · Apache 2.0',                              group: 'Mythological', Icon: BookOpen,    keywords: ['protocol','genesis-1','standard','spec','open','apache'] },
  { href: '/embed-docs',      label: 'Embed the Score',              description: 'iframe-able Genesis badges for any website',                         group: 'Developers',   Icon: Code2,       keywords: ['embed','iframe','badge','widget','distribute'] },
  { href: '/legal',           label: 'Legal &amp; Terms',                description: 'Terms of use · GDPR · right-to-erasure',                            group: 'Company',      Icon: ScrollText,  keywords: ['legal','terms','gdpr','erasure','privacy','rights'] },

  // Live tools
  { href: '/operator',        label: 'Live Operator Dashboard',     description: '11 bots, 3D threat globe, live event stream, AI console',           group: 'Live',       Icon: Activity,    keywords: ['dashboard','live','bots','globe','jarvis'] },
  { href: '/intelligence',    label: 'Regulatory Intelligence Feed', description: 'CSSF + EBA + ESMA news, AI-tagged by framework',                    group: 'Live',       Icon: Newspaper,   keywords: ['news','cssf','eba','esma','rss','feed'] },
  { href: '/status',          label: 'System Status',                description: 'Live health probes across OFAC, GLEIF, ECB, Groq',                  group: 'Live',       Icon: BarChart3,   keywords: ['status','health','uptime'] },
  { href: '/chat',            label: 'Compliance Chat',              description: 'Voice + text AI assistant',                                          group: 'Live',       Icon: MessageSquare, keywords: ['chat','jarvis','voice','ai'] },

  // Tools
  { href: '/audit',           label: '60-Minute Audit Pack',         description: 'Regulator question → signed PDF in 60 seconds',                     group: 'Tools',      Icon: ShieldCheck, keywords: ['audit','pdf','dora','aifmd','cssf','regulator'] },
  { href: '/opinion',         label: 'AI Legal Opinion',             description: '€3K Arendt opinion → €99 AI memo',                                  group: 'Tools',      Icon: Scale,       keywords: ['legal','opinion','memo','arendt','counsel'] },
  { href: '/analyze',         label: 'PDF Prospectus Analyzer',      description: 'Drop a fund prospectus → AI compliance gap analysis',               group: 'Tools',      Icon: FileText,    keywords: ['pdf','prospectus','analyze','fund','gap'] },
  { href: '/fund-score',      label: 'Fund Health Score',            description: 'Instant compliance score for any fund name',                        group: 'Tools',      Icon: TrendingUp,  keywords: ['fund','score','health','rating'] },
  { href: '/token-screen',    label: 'RWA Token Compliance',         description: 'Screen any ERC-20 or ERC-3643 contract',                            group: 'Tools',      Icon: Coins,       keywords: ['rwa','token','erc20','erc3643','crypto','tokenized'] },
  { href: '/case-studies',    label: 'Forensic Case Studies',        description: 'Wirecard, Greensill, Madoff, Archegos timelines',                   group: 'Tools',      Icon: AlertOctagon, keywords: ['wirecard','greensill','madoff','archegos','fraud'] },
  { href: '/demo',            label: 'Wirecard Replay',              description: '5-stage live fraud detection pipeline demo',                        group: 'Tools',      Icon: Play,        keywords: ['demo','wirecard','replay','pipeline'] },

  // Developers
  { href: '/docs',            label: 'API Documentation',            description: 'REST endpoints, curl/Python/TS examples, auth & rate limits',       group: 'Developers', Icon: Code2,       keywords: ['api','docs','rest','curl','python','typescript'] },
  { href: '/extension',       label: 'Chrome Extension',             description: 'Hover any company → instant OFAC screen popup',                      group: 'Developers', Icon: Chrome,      keywords: ['chrome','extension','browser','plugin'] },
  { href: '/gpt',             label: 'ChatGPT Integration',          description: 'Publish a Custom GPT calling Genesis Swarm actions',                group: 'Developers', Icon: Bot,         keywords: ['chatgpt','gpt','openai','custom gpt','assistant'] },

  // Company
  { href: '/about',           label: 'About · Founder Story',        description: 'Daman Sharma, 16, Luxembourg, €50M target',                         group: 'Company',    Icon: Globe2,      keywords: ['about','founder','story','daman'] },
  { href: '/investors',       label: 'Investor Data Room',           description: 'Thesis, traction, moat, the ask',                                   group: 'Company',    Icon: Target,      keywords: ['investors','seed','funding','pitch','data room'] },
  { href: '/press',           label: 'Press Kit',                    description: 'Logos, one-liners, boilerplate, screenshots',                       group: 'Company',    Icon: Mail,        keywords: ['press','media','kit','logo','boilerplate'] },
  { href: '/onepager',        label: 'One-Pager',                    description: 'Single-page product overview',                                      group: 'Company',    Icon: FileText,    keywords: ['one pager','overview','summary'] },
  { href: '/privacy',         label: 'Privacy Policy',               description: 'GDPR compliance, data handling, third parties',                     group: 'Company',    Icon: Lock,        keywords: ['privacy','gdpr','data','policy'] },

  // Account
  { href: '/dashboard',       label: 'My Dashboard',                 description: 'Saved analyses, API keys, alerts, plan',                            group: 'Account',    Icon: Sparkles,    keywords: ['dashboard','account','my','home'] },
  { href: '/login',           label: 'Sign In',                      description: 'Magic-link passwordless auth',                                       group: 'Account',    Icon: Key,         keywords: ['login','sign in','auth','magic link'] },
  { href: '/trial',           label: 'Start Free Trial',             description: '14-day Pro tier trial, no card required',                           group: 'Account',    Icon: Crown,       keywords: ['trial','signup','register','start'] },
]

function fuzzyMatch(item: Item, q: string): number {
  if (!q.trim()) return 1
  const query = q.toLowerCase()
  const hay = (item.label + ' ' + item.description + ' ' + item.keywords.join(' ')).toLowerCase()
  if (hay.startsWith(query)) return 100
  if (hay.includes(query)) return 80
  // Token overlap
  const qTokens = query.split(/\s+/).filter(t => t.length > 0)
  const hayTokens = new Set(hay.split(/\s+/))
  const hits = qTokens.filter(t => hayTokens.has(t)).length
  return hits > 0 ? 40 + hits * 10 : 0
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global ⌘K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
      // Listen for global event from header button
      // also handle / key (only when not focused on input)
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    const opener = () => setOpen(true)
    window.addEventListener('gs:open-palette', opener)
    return () => { window.removeEventListener('keydown', handler); window.removeEventListener('gs:open-palette', opener) }
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30)
      setSelected(0)
    } else {
      setQ('')
    }
  }, [open])

  // Filter + sort
  const scored = ITEMS.map(it => ({ item: it, score: fuzzyMatch(it, q) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)

  const grouped: Record<string, typeof scored> = {}
  for (const s of scored) {
    if (!grouped[s.item.group]) grouped[s.item.group] = []
    grouped[s.item.group].push(s)
  }
  const flat = scored.map(s => s.item)

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, flat.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); const item = flat[selected]; if (item) { window.location.href = item.href; setOpen(false) } }
  }, [flat, selected])

  if (!open) return null

  let idx = 0
  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[8vh] px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(16px) saturate(150%)' }}>

      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(8,8,16,0.97)',
          border: '1px solid rgba(0,255,136,0.25)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(0,255,136,0.1)',
        }}>

        {/* Search */}
        <div className="relative px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(255,255,255,0.4)]" />
          <input ref={inputRef} type="text" value={q}
            onChange={e => { setQ(e.target.value); setSelected(0) }}
            onKeyDown={onKeyDown}
            placeholder="Search Genesis Swarm... (try 'audit', 'api', 'wirecard', 'token')"
            className="w-full bg-transparent pl-7 pr-16 text-[15px] text-white placeholder:text-[rgba(255,255,255,0.35)] focus:outline-none"
            style={{ fontFamily: 'system-ui' }} />
          <kbd className="absolute right-5 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-widest font-bold px-2 py-1 rounded"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {flat.length === 0 ? (
            <div className="px-5 py-8 text-center text-[12px] text-[rgba(255,255,255,0.4)]">
              No matches. Try &quot;audit&quot;, &quot;api&quot;, &quot;dashboard&quot;, or browse <a href="/everything" className="text-[#00ff88] hover:underline">all features →</a>
            </div>
          ) : Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="px-5 pt-3 pb-1 text-[9px] uppercase tracking-[0.25em] font-black text-[rgba(0,255,136,0.5)]">{group}</div>
              {items.map(({ item }) => {
                const myIdx = idx++
                const isActive = myIdx === selected
                return (
                  <a key={item.href} href={item.href}
                    onMouseEnter={() => setSelected(myIdx)}
                    className="flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors"
                    style={{ background: isActive ? 'rgba(0,255,136,0.06)' : 'transparent' }}>
                    <div className="w-8 h-8 rounded flex items-center justify-center shrink-0"
                      style={{
                        background: isActive ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isActive ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      }}>
                      <item.Icon className="w-4 h-4" style={{ color: isActive ? '#00ff88' : 'rgba(255,255,255,0.6)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-bold truncate ${isActive ? 'text-white' : 'text-[rgba(255,255,255,0.85)]'}`}>{item.label}</div>
                      <div className="text-[11px] text-[rgba(255,255,255,0.5)] truncate">{item.description}</div>
                    </div>
                    <div className="text-[9px] uppercase tracking-widest font-mono text-[rgba(255,255,255,0.3)] shrink-0">{item.href}</div>
                  </a>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.4)' }}>
          <div className="flex items-center gap-3 text-[9px] uppercase tracking-widest text-[rgba(255,255,255,0.4)]">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span><kbd className="font-mono">esc</kbd> close</span>
          </div>
          <div className="text-[9px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] font-bold">
            Genesis Swarm · {ITEMS.length} pages
          </div>
        </div>
      </div>
    </div>
  )
}
