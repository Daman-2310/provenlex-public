'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePolling } from '@/lib/usePolling'
import {
  fetchRegulatorySensitivity, fetchRegulatoryRules,
  ingestRegulatoryText,
  type SensitivityMap, type RegulatoryRule,
} from '@/lib/api'
import { FileText, ChevronDown, ChevronUp, Send } from 'lucide-react'

const BOT_ORDER = [
  'SANCTIONS_BOT', 'YACHT_GUARDIAN', 'ORBITAL_BOT', 'NAV_DETECTOR',
  'SHADOW_BOT', 'FX_BOT', 'COMPLIANCE_BOT', 'SOVEREIGN_BOT',
  'CARGO_BOT', 'FUEL_BOT', 'SUCCESSION_BOT',
]

const BOT_COLORS: Record<string, string> = {
  SANCTIONS_BOT:  '#ff3366',
  YACHT_GUARDIAN: '#00aaff',
  ORBITAL_BOT:    '#aa00ff',
  NAV_DETECTOR:   '#00ff88',
  SHADOW_BOT:     '#ffaa00',
  FX_BOT:         '#ff8800',
  COMPLIANCE_BOT: '#00ffcc',
  SOVEREIGN_BOT:  '#88ff00',
  CARGO_BOT:      '#ff6600',
  FUEL_BOT:       '#ffcc00',
  SUCCESSION_BOT: '#cc88ff',
}

function DeltaBar({ bot, delta }: { bot: string; delta: number }) {
  const pct    = Math.abs(delta) * 100
  const isPos  = delta >= 0
  const color  = BOT_COLORS[bot] ?? '#00ff88'
  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] font-mono text-[rgba(0,255,136,0.5)] w-24 shrink-0 truncate">{bot}</span>
      <div className="flex-1 relative h-2 bg-[rgba(0,255,136,0.05)] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute top-0 h-full rounded-full"
          style={{
            background: color,
            opacity: 0.7,
            left: isPos ? '0%' : undefined,
            right: isPos ? undefined : '0%',
          }}
        />
      </div>
      <span
        className="text-[8px] font-mono w-10 text-right shrink-0"
        style={{ color: isPos ? color : 'rgba(0,255,136,0.4)' }}
      >
        {isPos ? '+' : ''}{(delta * 100).toFixed(0)}%
      </span>
    </div>
  )
}

function RuleCard({ rule }: { rule: RegulatoryRule }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[rgba(0,255,136,0.1)] rounded overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-2 py-1.5
          hover:bg-[rgba(0,255,136,0.03)] transition-colors"
      >
        <div className="flex items-center gap-2 text-left min-w-0">
          <span className="text-[8px] font-mono text-[rgba(0,255,136,0.4)] shrink-0 w-16">{rule.rule_id}</span>
          <span className="text-[9px] font-mono text-[#00ff88] font-bold shrink-0">{rule.source}</span>
          <span
            className="text-[8px] font-mono shrink-0 ml-auto"
            style={{ color: rule.delta >= 0 ? '#ff8800' : 'rgba(0,255,136,0.5)' }}
          >
            {rule.delta >= 0 ? '+' : ''}{(rule.delta * 100).toFixed(0)}% sensitivity
          </span>
        </div>
        <span className="ml-2 shrink-0 text-[rgba(0,255,136,0.4)]">
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 pt-1 space-y-1 border-t border-[rgba(0,255,136,0.08)]">
              <div className="text-[8px] font-mono text-[rgba(0,255,136,0.4)] leading-relaxed">
                {rule.raw_excerpt}
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {rule.keywords_found.map(k => (
                  <span key={k} className="text-[7px] px-1 py-0.5 rounded bg-[rgba(0,255,136,0.08)]
                    text-[rgba(0,255,136,0.6)] font-mono border border-[rgba(0,255,136,0.1)]">
                    {k}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {rule.affected_bots.map(b => (
                  <span key={b} className="text-[7px] px-1 py-0.5 rounded font-mono"
                    style={{ background: `${BOT_COLORS[b] ?? '#00ff88'}18`, color: BOT_COLORS[b] ?? '#00ff88' }}>
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const QUICK_REGS = [
  { label: 'DORA',   source: 'DORA Art.52', text: 'Critical ICT third-party risk must trigger mandatory incident reporting immediately. Operational resilience testing shall be unconditionally increased.' },
  { label: 'AML6',   source: 'AMLR 6AMLD',  text: 'Money laundering and terrorist financing shall be prohibited. Structuring and layering must be automatically flagged with mandatory enhanced due diligence.' },
  { label: 'MiCA',   source: 'MiCA 2024',    text: 'Virtual asset and crypto transfers must be monitored with enhanced controls. NFT transactions may apply simplified de minimis procedures below €1,000.' },
  { label: 'CSSF',   source: 'CSSF 22/811',  text: 'Politically exposed persons require enhanced due diligence. Sanctions screening must be applied unconditionally. Yacht and real estate transactions require heightened scrutiny.' },
]

export default function RegulatoryPanel() {
  const [tab, setTab] = useState<'sensitivity' | 'rules' | 'ingest'>('sensitivity')
  const [ingestSource, setIngestSource] = useState('')
  const [ingestText, setIngestText] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [lastIngested, setLastIngested] = useState<RegulatoryRule | null>(null)

  const { data: sensitivity } = usePolling(fetchRegulatorySensitivity, 5000)
  const { data: rules }       = usePolling(fetchRegulatoryRules, 5000, [])

  const sm = sensitivity as SensitivityMap | null
  const ruleList = (rules as RegulatoryRule[]) ?? []

  const handleIngest = useCallback(async () => {
    if (!ingestSource || !ingestText) return
    setIngesting(true)
    const rule = await ingestRegulatoryText(ingestSource, ingestText)
    if (rule) setLastIngested(rule)
    setIngesting(false)
    setIngestSource('')
    setIngestText('')
  }, [ingestSource, ingestText])

  const handleQuick = useCallback(async (source: string, text: string) => {
    setIngesting(true)
    const rule = await ingestRegulatoryText(source, text)
    if (rule) setLastIngested(rule)
    setIngesting(false)
  }, [])

  return (
    <div className="bg-[#0d0d1a] border border-[rgba(0,255,136,0.15)] rounded h-full flex flex-col">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-[rgba(0,255,136,0.1)] shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-[#00ff88]" />
            <span className="text-[10px] uppercase tracking-widest text-[rgba(0,255,136,0.6)]">
              Regulatory Parser // Semantic Weighting
            </span>
          </div>
          <span className="text-[9px] font-mono text-[rgba(0,255,136,0.4)]">
            {sm?.active_rules ?? 0} rules active
          </span>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-2">
          {(['sensitivity', 'rules', 'ingest'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[8px] uppercase tracking-wider px-2 py-0.5 rounded transition-colors
                ${tab === t
                  ? 'bg-[rgba(0,255,136,0.15)] text-[#00ff88] border border-[rgba(0,255,136,0.3)]'
                  : 'text-[rgba(0,255,136,0.4)] hover:text-[rgba(0,255,136,0.7)]'
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3">
        <AnimatePresence mode="wait">
          {tab === 'sensitivity' && (
            <motion.div
              key="sensitivity"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-1.5"
            >
              <div className="text-[8px] uppercase text-[rgba(0,255,136,0.35)] tracking-wider mb-2">
                Per-bot sensitivity delta from all loaded regulations
              </div>
              {BOT_ORDER.map(bot => (
                <DeltaBar
                  key={bot}
                  bot={bot}
                  delta={sm?.adjustments[bot] ?? 0}
                />
              ))}
            </motion.div>
          )}

          {tab === 'rules' && (
            <motion.div
              key="rules"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-1.5"
            >
              {ruleList.length === 0 ? (
                <div className="text-[9px] text-[rgba(0,255,136,0.25)] uppercase tracking-widest text-center py-8 animate-pulse">
                  No rules loaded
                </div>
              ) : (
                [...ruleList].reverse().map(r => <RuleCard key={r.rule_id} rule={r} />)
              )}
            </motion.div>
          )}

          {tab === 'ingest' && (
            <motion.div
              key="ingest"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Quick inject buttons */}
              <div>
                <div className="text-[8px] uppercase text-[rgba(0,255,136,0.35)] tracking-wider mb-1.5">
                  Quick-load EU regulations
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_REGS.map(q => (
                    <button
                      key={q.label}
                      onClick={() => handleQuick(q.source, q.text)}
                      disabled={ingesting}
                      className="text-[8px] uppercase tracking-wider px-2 py-1 border border-[rgba(0,255,136,0.25)]
                        text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors disabled:opacity-40"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual ingest */}
              <div className="space-y-2">
                <div className="text-[8px] uppercase text-[rgba(0,255,136,0.35)] tracking-wider">
                  Manual ingest
                </div>
                <input
                  value={ingestSource}
                  onChange={e => setIngestSource(e.target.value)}
                  placeholder="Source (e.g. CSSF 22/811)"
                  className="w-full bg-[rgba(0,255,136,0.04)] border border-[rgba(0,255,136,0.15)]
                    rounded px-2 py-1.5 text-[9px] font-mono text-[#00ff88] placeholder-[rgba(0,255,136,0.25)]
                    outline-none focus:border-[rgba(0,255,136,0.35)]"
                />
                <textarea
                  value={ingestText}
                  onChange={e => setIngestText(e.target.value)}
                  placeholder="Paste regulatory text here…"
                  rows={4}
                  className="w-full bg-[rgba(0,255,136,0.04)] border border-[rgba(0,255,136,0.15)]
                    rounded px-2 py-1.5 text-[9px] font-mono text-[#00ff88] placeholder-[rgba(0,255,136,0.25)]
                    outline-none focus:border-[rgba(0,255,136,0.35)] resize-none"
                />
                <button
                  onClick={handleIngest}
                  disabled={ingesting || !ingestSource || !ingestText}
                  className="flex items-center gap-1.5 text-[8px] uppercase tracking-wider px-3 py-1.5
                    border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded
                    hover:bg-[rgba(0,255,136,0.08)] transition-colors disabled:opacity-40"
                >
                  <Send className="w-2.5 h-2.5" />
                  {ingesting ? 'Parsing…' : 'Ingest & Parse'}
                </button>
              </div>

              {/* Last result */}
              <AnimatePresence>
                {lastIngested && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border border-[rgba(0,255,136,0.2)] rounded p-2 bg-[rgba(0,255,136,0.03)]"
                  >
                    <div className="text-[8px] uppercase text-[rgba(0,255,136,0.4)] mb-1">Last parsed rule</div>
                    <div className="text-[9px] font-mono text-[#00ff88] font-bold">{lastIngested.source}</div>
                    <div className="text-[8px] font-mono text-[rgba(0,255,136,0.5)] mt-0.5">
                      {lastIngested.keywords_found.length} keywords · {lastIngested.affected_bots.length} bots ·
                      delta {lastIngested.delta >= 0 ? '+' : ''}{(lastIngested.delta * 100).toFixed(0)}%
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
