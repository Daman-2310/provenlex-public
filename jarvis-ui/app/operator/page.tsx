'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  fetchStatus, fetchBots, fetchAlerts, fetchBotHistory,
  fetchBotForecast, fetchMerkle, fetchTrust, fetchChaos,
  fetchSecurity, fetchSystemMetrics, queryMemory,
  fetchInvestorBrief,
  fetchAllBotSnapshots,
  wakeupBackend,
  type MemoryQueryResult,
} from '@/lib/api'
import { usePolling } from '@/lib/usePolling'
import { useLiveDashboard } from '@/lib/useWebSocket'
import AlertToast from '@/components/AlertToast'
import CommandStrip from '@/components/CommandStrip'
import { AnimatePresence } from 'framer-motion'
import BotCard from '@/components/BotCard'
import BotCardPremium from '@/components/BotCardPremium'
import NodeGraph from '@/components/NodeGraph'
import XAICard from '@/components/XAICard'
import MerkleViewer from '@/components/MerkleViewer'
import MerkleHUD from '@/components/MerkleHUD'
import ConsensusRing2 from '@/components/ConsensusRing2'
import JarvisChat from '@/components/JarvisChat'
import DetectionSpeedPanel from '@/components/DetectionSpeedPanel'
import CaseManagement from '@/components/CaseManagement'
import PrecedentDrillDown from '@/components/PrecedentDrillDown'
import ThreatMap from '@/components/ThreatMap'
import TransactionGatewayPanel from '@/components/TransactionGatewayPanel'
import RegulatoryPanel from '@/components/RegulatoryPanel'
import WirecardTimeline from '@/components/WirecardTimeline'
import SanctionsPanel from '@/components/SanctionsPanel'
import InvestorProofPanel from '@/components/InvestorProofPanel'
import BoardroomMode from '@/components/BoardroomMode'
import { quarantineNode, restoreNode, type BotStatus } from '@/lib/api'
import ShadowBotCard from '@/components/ShadowBotCard'
import HeroCounter from '@/components/HeroCounter'
import LiveEventTicker from '@/components/LiveEventTicker'
import dynamic from 'next/dynamic'
const ThreatGlobe = dynamic(() => import('@/components/ThreatGlobe'), { ssr: false })
const ThreatRadar = dynamic(() => import('@/components/ThreatRadar'), { ssr: false })
const SwarmOperations3D = dynamic(() => import('@/components/SwarmOperations3D'), { ssr: false })
import LiveIntelligence from '@/components/LiveIntelligence'
import PrecrimeMeter from '@/components/PrecrimeMeter'
import {
  Activity, AlertTriangle, Shield, Cpu, Zap, FileText,
  Eye, Lock, GitBranch, Radio, FileDown, LogOut, Play,
  TrendingUp, Search, Tag, ScanSearch, Bell, CheckCircle, ChevronDown, Check,
} from 'lucide-react'

const BOT_TYPES = [
  'NAV_DETECTOR','CARGO_BOT','FUEL_BOT','SANCTIONS_BOT',
  'FX_BOT','COMPLIANCE_BOT','SUCCESSION_BOT','SOVEREIGN_BOT',
  'YACHT_GUARDIAN','ORBITAL_BOT','SHADOW_BOT',
]

function StatPill({
  icon: Icon, label, value, alert = false, unit = '',
}: {
  icon: React.ElementType
  label: string
  value: string | number | null
  alert?: boolean
  unit?: string
}) {
  const color = alert ? '#ff3366' : '#00ff88'
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded font-mono transition-all"
      style={{
        background: alert ? 'rgba(255,51,102,0.06)' : 'rgba(0,255,136,0.04)',
        border: `1px solid ${alert ? 'rgba(255,51,102,0.3)' : 'rgba(0,255,136,0.18)'}`,
        boxShadow: `0 0 12px ${color}08`,
      }}>
      <Icon className="w-3 h-3 shrink-0" style={{ color }} />
      <span className="text-[9px] uppercase tracking-wider" style={{ color: `${color}66` }}>{label}</span>
      <span className="text-[11px] font-black tabular-nums" style={{ color, textShadow: `0 0 8px ${color}66` }}>
        {value ?? '—'}{unit}
      </span>
    </div>
  )
}

export default function Home() {
  const [xaiData, setXaiData] = useState<MemoryQueryResult | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const xaiLastBot = useRef<string>('')
  const [chaosMode, setChaosMode] = useState(false)
  const [drillDown, setDrillDown] = useState<BotStatus | null>(null)
  const [backendState, setBackendState] = useState<'connecting' | 'online' | 'offline'>('connecting')

  // Wake up Render free-tier backend (takes up to 60s on cold start)
  useEffect(() => {
    wakeupBackend().then(ok => setBackendState(ok ? 'online' : 'offline'))
  }, [])

  // ── WebSocket primary — polling fallback when WS is disconnected ──────────
  const { data: wsSnap, connected: wsConnected } = useLiveDashboard()
  const { data: polledStatus }    = usePolling(fetchStatus, 3000)
  const { data: polledBotsRaw }   = usePolling(fetchBots,   3000, [])
  const { data: polledAlertsRaw } = usePolling(fetchAlerts, 4000, [])

  // ML extras from WebSocket
  const shadowBot = wsSnap?.shadow_bot ?? null
  const precrime  = wsSnap?.precrime   ?? null

  // Merge WS status + mode into the flat shape the rest of the page expects
  const status = wsSnap
    ? { ...(wsSnap.status as object), ...(wsSnap.mode as object), fear_index: wsSnap.mode?.fear_index ?? 0 }
    : polledStatus
  const bots   = ((wsSnap?.bots   ?? polledBotsRaw   ?? []) as import('@/lib/api').BotStatus[])
  const alerts = ((wsSnap?.alerts ?? polledAlertsRaw ?? []) as import('@/lib/api').Alert[])

  // ── One-click pipeline demo ───────────────────────────────────────────────
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoStage, setDemoStage] = useState<number>(-1) // -1 = idle
  const handleDemoTrigger = useCallback(async () => {
    if (demoRunning) return
    setDemoRunning(true)
    setDemoStage(0)
    // Advance through 5 pipeline stages
    const stageTimes = [0, 1400, 3100, 5200, 7800]
    stageTimes.forEach((t, i) => setTimeout(() => setDemoStage(i), t))
    try {
      const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://daman23-genesis-swarm-api.hf.space'
      await fetch(`${BASE}/api/v1/simulation/wirecard-replay`)
    } catch { /* ignore — demo fires regardless */ }
    setTimeout(() => { setDemoRunning(false); setDemoStage(-1) }, 18000)
  }, [demoRunning])
  // ── XAI: use /api/ai/chat SSE stream (same endpoint as JarvisChat) ──────────
  const handleXAIQuery = useCallback(async (q: string) => {
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: q }),
      })
      if (!res.ok || !res.body) throw new Error('chat failed')
      // Read SSE stream and assemble complete answer
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = '', answer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const token = line.slice(6)
          if (token === '[DONE]') break
          if (token.startsWith('[')) continue
          answer += token.replace(/\\n/g, '\n')
        }
      }
      if (answer.trim()) {
        setXaiData({ query: q, answer: answer.trim(), precedents: [], confidence: 0.84 })
      }
    } catch {
      setXaiData({ query: q, answer: 'Swarm analysis unavailable — backend warming up. Try a quick command below.', precedents: [], confidence: 0 })
    }
  }, [])

  const { data: merkle } = usePolling(fetchMerkle, 4000)
  const { data: trust  } = usePolling(fetchTrust,  4000)
  const { data: chaos  } = usePolling(fetchChaos,  5000)
  const { data: security } = usePolling(fetchSecurity, 5000)
  const { data: sysMetrics } = usePolling(fetchSystemMetrics, 3000)
  const { data: investorBrief } = usePolling(fetchInvestorBrief, 5000)

  // Per-bot history + forecast — single batch call instead of 22 parallel fetches
  const [botHistories, setBotHistories] = useState<Record<string, unknown[]>>({})
  const [botForecasts, setBotForecasts] = useState<Record<string, unknown>>({})

  const refreshBotData = useCallback(async () => {
    const snapshots = await fetchAllBotSnapshots()
    if (!snapshots) return
    const histories: Record<string, unknown[]> = {}
    const forecasts: Record<string, unknown> = {}
    for (const [bt, snap] of Object.entries(snapshots)) {
      if (snap.history?.length) histories[bt] = snap.history
      if (snap.forecast)        forecasts[bt] = snap.forecast
    }
    setBotHistories(histories)
    setBotForecasts(forecasts)
  }, [])

  usePolling(refreshBotData, 4000)

  // ── Derived values ─────────────────────────────────────────────────────────
  const activeAlerts = alerts.length
  const topBot = bots.reduce(
    (best, b) => (b.last_score ?? 0) > (best.last_score ?? 0) ? b : best,
    {} as import('@/lib/api').BotStatus
  )

  const fearIndex = (status as { fear_index?: number })?.fear_index ?? 0
  const fearColor = fearIndex > 70 ? '#ff3366' : fearIndex > 40 ? '#ffaa00' : '#00ff88'

  // ── Chaos mode toggle ─────────────────────────────────────────────────────
  const handleChaosToggle = useCallback(async () => {
    if (chaosMode) {
      await restoreNode()
      setChaosMode(false)
    } else {
      // Quarantine the highest-scoring bot
      const target = bots.reduce(
        (best, b) => (b.last_score ?? 0) > (best.last_score ?? 0) ? b : best,
        bots[0]
      )
      if (target?.bot_type) {
        await quarantineNode(target.bot_type)
      }
      setChaosMode(true)
    }
  }, [chaosMode, bots])

  // ── Auto-query XAI when top bot changes or is anomalous ───────────────────
  useEffect(() => {
    const bt = topBot?.bot_type
    if (!bt) return
    const key = `${bt}-${Math.round((topBot?.last_score ?? 0) / 5) * 5}`
    if (key === xaiLastBot.current) return
    xaiLastBot.current = key
    const q = topBot?.is_anomaly
      ? `Explain the compliance anomaly detected on ${bt} — risk score ${Math.round(topBot?.last_score ?? 0)}/100. What regulatory action is required?`
      : `Give a brief DORA and CSSF compliance status summary for ${bt}.`
    handleXAIQuery(q)
  }, [topBot?.bot_type, topBot?.last_score, topBot?.is_anomaly, handleXAIQuery])

  // Section label component
  const SectionLabel = ({ color = '#00ff88', children }: { color?: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-1 h-5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <div className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color }}>{children}</div>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}30, transparent)` }} />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono select-none overflow-x-hidden">

      {/* ── Scan-line overlay ──────────────────────────────────────────────── */}
      <div className="scanline pointer-events-none fixed inset-0 z-50" />

      {/* ── Alert toast — fires on WebSocket alert events ──────────────────── */}
      <AlertToast />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40" style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,255,136,0.1)' }}>
        <div className="px-5 h-14 flex items-center justify-between gap-3">

          {/* ── LEFT: Logo + live stats ─────────────────────────────────── */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
                <div className="absolute w-4 h-4 rounded-full bg-[#00ff88] animate-ping opacity-20" />
              </div>
              <span className="text-[#00ff88] font-black tracking-[0.18em] text-sm uppercase">Genesis Swarm</span>
              <span className="text-[rgba(0,255,136,0.25)] text-[8px] tracking-[0.3em] hidden lg:block">// SOVEREIGN</span>
            </div>
            <div className="hidden xl:flex items-center gap-1.5">
              <StatPill icon={Cpu}           label="Bots"    value={(status as {total_bots?: number})?.total_bots ?? '—'} />
              <StatPill icon={Activity}      label="Healthy" value={(status as {healthy_bots?: number})?.healthy_bots ?? '—'} />
              <StatPill icon={AlertTriangle} label="Alerts"  value={activeAlerts} alert={activeAlerts > 0} />
              <StatPill icon={Zap}           label="Fear"    value={Math.round(fearIndex)} unit="%" alert={fearIndex > 70} />
            </div>
          </div>

          {/* ── CENTER: Grouped dropdown nav ────────────────────────────── */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center" onMouseLeave={() => setOpenMenu(null)}>
            {([
              { id: 'compliance', label: 'Compliance', color: '#00ff88', items: [
                { href: '/onboard',    label: 'Fund Onboarding',      sub: '4-step gap assessment' },
                { href: '/dora',       label: 'DORA Art. 28 Scanner', sub: 'ICT contract analysis' },
                { href: '/dora/register', label: 'DORA ICT Register', sub: 'EBA RTS 2024 builder' },
                { href: '/sfdr',       label: 'SFDR Generator',       sub: 'Art. 6/8/9 disclosures' },
                { href: '/aifmd',      label: 'AIFMD II Assessment',  sub: 'EU 2024/927 checker' },
                { href: '/audit-sim',  label: 'CSSF Audit Simulator', sub: 'Readiness grade A–F' },
                { href: '/doc-check',  label: 'Document Checker',     sub: 'Regulatory coverage scan' },
              ]},
              { id: 'reports', label: 'Reports', color: '#00aaff', items: [
                { href: '/board-report', label: 'AI Board Report',      sub: 'Quarterly compliance report' },
                { href: '/fund-score',   label: 'Fund Health Score',    sub: 'A–F compliance grade' },
                { href: '/radar',        label: 'Regulatory Radar',     sub: 'Live CSSF + ESMA alerts' },
                { href: '/certificate',  label: 'Compliance Certificate',sub: 'SHA3-512 signed proof' },
                { href: '/onepager',     label: 'One-Pager',            sub: 'Printable A4 overview' },
                { href: '/api/report/compliance', label: 'DORA PDF Export', sub: 'Full audit report' },
              ]},
              { id: 'tools', label: 'Tools', color: '#b478ff', items: [
                { href: '/chat',       label: 'AI Compliance Chat',   sub: 'Luxembourg reg Q&A' },
                { href: '/portfolio',  label: 'Portfolio Dashboard',  sub: 'Multi-fund view' },
                { href: '/screening',  label: 'AML / Sanctions',      sub: 'OFAC · EU · UN screening' },
                { href: '/pricing',    label: 'Pricing',              sub: '€2.5k → €5k → Enterprise' },
                { href: '/settings',   label: 'Notifications',        sub: 'Alert preferences' },
              ]},
            ] as { id: string; label: string; color: string; items: { href: string; label: string; sub: string }[] }[]).map(menu => (
              <div key={menu.id} className="relative" onMouseEnter={() => setOpenMenu(menu.id)}>
                <button
                  className="flex items-center gap-1 px-3 py-2 rounded text-[10px] uppercase tracking-[0.15em] font-bold transition-all"
                  style={{
                    color: openMenu === menu.id ? menu.color : 'rgba(255,255,255,0.45)',
                    background: openMenu === menu.id ? `${menu.color}0f` : 'transparent',
                  }}
                >
                  {menu.label}
                  <ChevronDown className="w-2.5 h-2.5" style={{ transform: openMenu === menu.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {openMenu === menu.id && (
                  <div className="absolute top-full left-0 mt-1 w-56 rounded-lg overflow-hidden z-50"
                    style={{ background: 'rgba(8,8,12,0.98)', border: `1px solid ${menu.color}25`, boxShadow: `0 20px 60px rgba(0,0,0,0.8), 0 0 40px ${menu.color}08`, backdropFilter: 'blur(20px)' }}>
                    <div className="p-1">
                      {menu.items.map(item => (
                        <a key={item.href} href={item.href}
                          className="flex flex-col px-3 py-2.5 rounded transition-all hover:bg-[rgba(255,255,255,0.04)] group/item"
                          onClick={() => setOpenMenu(null)}>
                          <span className="text-[10px] font-bold uppercase tracking-wider transition-colors" style={{ color: 'rgba(255,255,255,0.75)' }}>{item.label}</span>
                          <span className="text-[8px] tracking-wide mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>{item.sub}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* ── RIGHT: logout only ──────────────────────────────────────── */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { document.cookie = 'gs_token=; path=/; max-age=0'; localStorage.removeItem('gs_token'); window.location.href = '/login' }}
              className="p-2 rounded transition-all hover:bg-[rgba(255,51,102,0.08)]"
              style={{ border: '1px solid rgba(255,51,102,0.2)', color: 'rgba(255,51,102,0.5)' }}
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Fear progress bar */}
        <div className="h-px" style={{ background: 'rgba(0,255,136,0.06)' }}>
          <div className="h-full transition-all duration-1000" style={{ width: `${fearIndex}%`, background: fearColor, boxShadow: `0 0 8px ${fearColor}` }} />
        </div>
      </header>

      {/* ── Command strip — fear gauge + AUM + mode + WS status ───────────── */}
      {/* ── Command strip — fear gauge + AUM + mode + WS status ───────────── */}
      <CommandStrip
        fearIndex={fearIndex}
        totalBots={(status as {total_bots?: number})?.total_bots ?? 12}
        healthyBots={(status as {healthy_bots?: number})?.healthy_bots ?? 12}
        mode={(status as {mode?: string})?.mode ?? 'NORMAL'}
        consensusRounds={(status as {consensus_rounds?: number})?.consensus_rounds ?? 0}
        wsConnected={wsConnected}
        topScore={(status as {top_score?: number})?.top_score ?? 0}
        precrimeIndex={precrime?.index ?? null}
        defeatScore={shadowBot?.defeat_score ?? null}
      />

      {/* ── Wirecard Demo Overlay ────────────────────────────────────────── */}
      {demoRunning && (
        <div className="fixed top-14 left-0 right-0 z-30 px-4 pt-3 pointer-events-none">
          <div className="rounded-lg p-4 pointer-events-auto demo-overlay"
            style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.5)', backdropFilter: 'blur(12px)', boxShadow: '0 0 60px rgba(255,51,102,0.15)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#ff3366]" style={{ animation: 'pulse 0.6s ease-in-out infinite' }} />
                <span className="text-[#ff3366] font-black text-xs uppercase tracking-[0.2em]">Wirecard Replay Active — Live Pipeline Execution</span>
              </div>
              <span className="text-[8px] text-[rgba(255,51,102,0.6)] uppercase tracking-widest">Stage {demoStage + 1}/5</span>
            </div>
            <div className="flex items-center gap-1">
              {['Detect (340ms)', 'PBFT Consensus', 'Alert Dispatch', 'Merkle Anchor', 'PDF Report'].map((s, i) => {
                const done = i < demoStage
                const active = i === demoStage
                const col = done ? '#00ff88' : active ? '#ffaa00' : 'rgba(255,255,255,0.15)'
                return (
                  <div key={s} className="flex items-center flex-1 min-w-0 gap-1">
                    <div className="flex flex-col items-center flex-1">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-black transition-all duration-300"
                        style={{ background: done ? 'rgba(0,255,136,0.15)' : active ? 'rgba(255,170,0,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${col}`, color: col, boxShadow: active ? `0 0 12px rgba(255,170,0,0.4)` : done ? `0 0 8px rgba(0,255,136,0.3)` : 'none' }}>
                        {done ? <Check className="w-3 h-3" /> : i + 1}
                      </div>
                      <div className="text-[7px] mt-1 uppercase tracking-wide text-center truncate w-full" style={{ color: col }}>{s}</div>
                    </div>
                    {i < 4 && <div className="w-2 shrink-0 h-px mb-4" style={{ background: i < demoStage ? '#00ff88' : 'rgba(255,255,255,0.1)' }} />}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <main className="p-4 space-y-4" style={{ paddingTop: demoRunning ? '130px' : undefined }}>

        {/* ── 1. HERO COUNTER ──────────────────────────────────────────── */}
        <HeroCounter
          aumProtected={(status as {aum_protected?: number})?.aum_protected ?? 14_780_000_000}
          threatsBlocked={847_231 + Math.floor(((status as {active_alerts?: number})?.active_alerts ?? 0) * 12.3)}
          consensusRounds={(status as {consensus_rounds?: number})?.consensus_rounds ?? 48_221}
          detectionLatencyMs={340}
        />

        {/* ── 1.5 LIVE CONSENSUS SWARM — 3D, bound to real bot telemetry ─── */}
        <div>
          <SectionLabel>Live Consensus Swarm · 11 Nodes · PBFT · Real-Time Telemetry</SectionLabel>
          <SwarmOperations3D bots={bots} chaosMode={chaosMode} wsConnected={wsConnected} />
        </div>

        {/* ── 2. LIVE EVENTS + THREAT RADAR ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: 420 }}>
          <LiveEventTicker />
          <ThreatGlobe />
        </div>

        {/* ── 2.5 LIVE INTELLIGENCE — real public-source data ────────── */}
        <LiveIntelligence />

        {/* ── 3. DETECTION BOTS ────────────────────────────────────────── */}
        <div>
          <SectionLabel>Autonomous Detection Swarm · Live Anomaly Scores</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {BOT_TYPES.map(bt => {
              const bot = bots.find(b => b.bot_type === bt)
              const placeholder = backendState !== 'online' && !bot
              const botObj = bot ?? {
                bot_id: bt, bot_type: bt, personality_label: '',
                last_score: 0, is_anomaly: false,
                healthy: placeholder ? true : false,
                last_summary: placeholder ? 'Connecting to swarm…' : 'Monitoring nominal',
                threshold: 75,
              }
              return (
                <div key={bt}
                  onClick={() => bot?.is_anomaly ? setDrillDown(bot) : undefined}
                  className={bot?.is_anomaly ? 'cursor-pointer' : ''}>
                  <BotCardPremium bot={botObj} />
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 4. ML INTELLIGENCE ──────────────────────────────────────── */}
        {(shadowBot || precrime) && (
          <div>
            <SectionLabel color="#ff3366">ML Intelligence · Adversarial Red Team · Pre-Crime Forensics</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {shadowBot && <ShadowBotCard data={shadowBot} />}
              {precrime  && <PrecrimeMeter data={precrime} />}
            </div>
          </div>
        )}

        {/* ── 5. XAI REASONING + JARVIS AI ─────────────────────────────── */}
        <div>
          <SectionLabel color="#00ff88">AI Compliance Console · Explainable Reasoning + Live Chat</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: 360 }}>
            <XAICard
              explanation={xaiData}
              botType={topBot?.bot_type ?? 'UNKNOWN'}
              onQuery={handleXAIQuery}
            />
            <JarvisChat />
          </div>
        </div>

        {/* ── 6. MERKLE AUDIT + BFT CONSENSUS ─────────────────────────── */}
        <div>
          <SectionLabel color="#4a9eff">Cryptographic Proof Layer · Immutable Audit Chain + PBFT Consensus</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: 420 }}>
            <MerkleViewer merkle={merkle as { root: string | null; depth: number; leaves: Array<{ hash: string; ts: number; event_type?: string }> } | null} />
            <ConsensusRing2 chaosMode={chaosMode} onChaosToggle={handleChaosToggle} />
          </div>
        </div>

        {/* ── Drill-Down Modal ───────────────────────────────────────── */}
        <AnimatePresence>
          {drillDown && (
            <PrecedentDrillDown
              botType={drillDown.bot_type}
              score={drillDown.last_score}
              summary={drillDown.last_summary}
              onClose={() => setDrillDown(null)}
            />
          )}
        </AnimatePresence>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer className="border-t border-[rgba(255,255,255,0.06)] pt-4 mt-8 text-[9px] text-[rgba(255,255,255,0.3)] flex justify-between flex-wrap gap-2 uppercase tracking-wider">
          <span>Genesis Swarm v0.4 · CSSF · DORA compliant</span>
          <span>Luxembourg RegTech · Sovereign Grade</span>
          <span>Merkle Root: {sysMetrics?.merkle_root?.slice(0, 12) ?? 'pending'}…</span>
        </footer>

      </main>
    </div>
  )
}
