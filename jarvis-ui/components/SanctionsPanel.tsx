'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, RefreshCw, Search, Shield, ShieldAlert, Zap } from 'lucide-react'
import {
  fetchSanctionsStats,
  fetchSanctionsMatches,
  screenEntity,
  reloadSanctionsList,
  type OFACStats,
  type OFACMatch,
} from '../lib/api'

const PROGRAM_COLOR: Record<string, string> = {
  'SDN':                '#ff3366',
  'UKRAINE-EO13685':    '#ffaa00',
  'UKRAINE-EO13661':    '#ffaa00',
  'RUSSIA-EO14024':     '#ffaa00',
  'IRAN':               '#ff6600',
  'IRAN-TRA':           '#ff6600',
  'DPRK':               '#ff3366',
  'DPRK2':              '#ff3366',
  'VENEZUELA':          '#ff8800',
  'SYRIA':              '#cc44ff',
  'CUBA':               '#00aaff',
}

function programColor(p: string): string {
  for (const [key, col] of Object.entries(PROGRAM_COLOR)) {
    if (p.includes(key)) return col
  }
  return '#666688'
}

function MatchScore({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 95 ? '#ff3366' : pct >= 88 ? '#ffaa00' : '#ff8800'
  return (
    <div className="flex items-center gap-1">
      <div
        className="h-1 rounded-full"
        style={{ width: `${pct * 0.48}px`, background: color, minWidth: 4 }}
      />
      <span className="text-[8px] font-mono tabular-nums" style={{ color }}>
        {pct}%
      </span>
    </div>
  )
}

function MatchRow({ match, idx }: { match: OFACMatch; idx: number }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.04 }}
      className="border rounded cursor-pointer transition-colors"
      style={{
        borderColor: open ? '#ff3366' : 'rgba(255,51,102,0.12)',
        background: open ? 'rgba(255,51,102,0.06)' : 'transparent',
      }}
      onClick={() => setOpen(v => !v)}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <ShieldAlert className="w-3 h-3 text-[#ff3366] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-bold text-[#ff3366] font-mono truncate max-w-[120px]">
              {match.entity}
            </span>
            <span className="text-[7px] text-[rgba(255,51,102,0.4)]">→</span>
            <span className="text-[9px] font-mono text-[rgba(255,255,255,0.7)] truncate max-w-[140px]">
              {match.sdn_name}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <MatchScore score={match.match_score} />
            <span
              className="text-[7px] font-mono px-1 py-0.5 rounded border"
              style={{ borderColor: 'rgba(255,51,102,0.3)', color: 'rgba(255,51,102,0.6)' }}
            >
              {match.match_type}
            </span>
            <span className="text-[7px] text-[rgba(255,255,255,0.3)]">{match.sdn_type}</span>
            <span className="text-[7px] font-mono text-[rgba(255,51,102,0.3)] ml-auto">
              {match.screened_date}
            </span>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {match.programs.map(p => (
                <span
                  key={p}
                  className="text-[7px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: `${programColor(p)}18`, color: programColor(p), border: `1px solid ${programColor(p)}40` }}
                >
                  {p}
                </span>
              ))}
              <span className="text-[7px] text-[rgba(255,255,255,0.2)] ml-1">
                UID #{match.sdn_uid}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function SanctionsPanel() {
  const [stats, setStats]     = useState<OFACStats | null>(null)
  const [matches, setMatches] = useState<OFACMatch[]>([])
  const [query, setQuery]     = useState('')
  const [searching, setSearching] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [liveHit, setLiveHit] = useState<OFACMatch | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const [s, m] = await Promise.all([
      fetchSanctionsStats(),
      fetchSanctionsMatches(30),
    ])
    if (s) setStats(s)
    if (m) setMatches(m)
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [])

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setLiveHit(null)
    const res = await screenEntity(query.trim())
    setSearching(false)
    if (res && res.hits > 0) {
      setLiveHit(res.matches[0])
      await load()
    } else {
      setLiveHit(null)
    }
  }

  const handleReload = async () => {
    setReloading(true)
    await reloadSanctionsList()
    await load()
    setReloading(false)
  }

  const loaded = stats?.loaded ?? false

  return (
    <div className="bg-[#0d0d1a] border border-[rgba(255,51,102,0.25)] rounded overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-[rgba(255,51,102,0.07)] border-b border-[rgba(255,51,102,0.2)] px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#ff3366]" />
            <span className="text-[11px] uppercase tracking-widest font-bold text-[#ff3366]">
              OFAC SDN Live Screening
            </span>
            <span
              className="text-[7px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: loaded ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,102,0.1)',
                color: loaded ? '#00ff88' : '#ff3366',
                border: `1px solid ${loaded ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)'}`,
              }}
            >
              {loaded ? `LIVE · ${stats?.total_entries?.toLocaleString()} entries` : 'LOADING…'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {stats?.publish_date && (
              <span className="text-[7px] font-mono text-[rgba(255,51,102,0.4)]">
                Published {stats.publish_date}
              </span>
            )}
            <button
              onClick={handleReload}
              disabled={reloading}
              className="flex items-center gap-1 px-2 py-1 rounded text-[7px] uppercase tracking-wider transition-colors"
              style={{
                border: '1px solid rgba(255,51,102,0.3)',
                color: 'rgba(255,51,102,0.6)',
                background: reloading ? 'rgba(255,51,102,0.08)' : 'transparent',
              }}
            >
              <RefreshCw className={`w-2.5 h-2.5 ${reloading ? 'animate-spin' : ''}`} />
              Reload
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-4 divide-x divide-[rgba(255,51,102,0.1)] border-b border-[rgba(255,51,102,0.1)]">
          {[
            { label: 'SDN Entries',    value: stats.total_entries.toLocaleString() },
            { label: 'Screened',       value: stats.screen_count.toLocaleString() },
            { label: 'Hits',           value: stats.hit_count.toString(),   accent: stats.hit_count > 0 },
            { label: 'Hit Rate',       value: `${stats.hit_rate_pct}%`,     accent: stats.hit_rate_pct > 0 },
          ].map(({ label, value, accent }) => (
            <div key={label} className="px-3 py-2 text-center">
              <div
                className="text-[18px] font-bold font-mono tabular-nums"
                style={{ color: accent ? '#ff3366' : 'rgba(255,255,255,0.7)' }}
              >
                {value}
              </div>
              <div className="text-[7px] uppercase tracking-wider text-[rgba(255,51,102,0.4)] mt-0.5">
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Live search ────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[rgba(255,51,102,0.1)]">
        <div className="text-[8px] uppercase tracking-wider text-[rgba(255,51,102,0.4)] mb-2 flex items-center gap-2">
          <Search className="w-3 h-3" />
          Screen Entity Against OFAC SDN
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. SBERBANK, MAHAN AIR, ROSNEFT…"
            className="flex-1 bg-[rgba(255,51,102,0.05)] border border-[rgba(255,51,102,0.2)] rounded px-2 py-1 text-[9px] font-mono text-white placeholder-[rgba(255,51,102,0.3)] focus:outline-none focus:border-[rgba(255,51,102,0.5)]"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-3 py-1 rounded text-[8px] font-bold uppercase tracking-wider transition-all"
            style={{
              background: searching ? 'rgba(255,51,102,0.2)' : 'rgba(255,51,102,0.15)',
              border: '1px solid rgba(255,51,102,0.4)',
              color: '#ff3366',
            }}
          >
            {searching ? '…' : 'SCREEN'}
          </button>
        </div>

        <AnimatePresence>
          {liveHit && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 p-2 rounded border border-[rgba(255,51,102,0.5)] bg-[rgba(255,51,102,0.08)]"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3 h-3 text-[#ff3366] shrink-0" />
                <span className="text-[9px] font-bold text-[#ff3366]">SDN MATCH DETECTED</span>
                <span className="text-[8px] font-mono text-[rgba(255,255,255,0.6)]">
                  {liveHit.sdn_name}
                </span>
                <MatchScore score={liveHit.match_score} />
              </div>
              <div className="flex gap-1 mt-1 flex-wrap">
                {liveHit.programs.map(p => (
                  <span
                    key={p}
                    className="text-[7px] font-mono px-1 py-0.5 rounded"
                    style={{ background: `${programColor(p)}18`, color: programColor(p), border: `1px solid ${programColor(p)}40` }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
          {liveHit === null && query && !searching && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-2 text-[8px] font-mono text-[rgba(0,255,136,0.6)]"
            >
              No SDN match found for "{query}"
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Match feed ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <div className="text-[8px] uppercase tracking-wider text-[rgba(255,51,102,0.4)] mb-2 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Recent SDN Matches
          <span className="ml-auto text-[rgba(255,51,102,0.3)] font-mono">
            {matches.length} hits
          </span>
        </div>

        {matches.length === 0 && (
          <div className="text-center py-6">
            {loaded ? (
              <p className="text-[8px] text-[rgba(255,51,102,0.3)] font-mono">
                No SDN matches yet — list is loading or no entities screened
              </p>
            ) : (
              <div className="space-y-1">
                <div className="w-5 h-5 border-2 border-[#ff3366] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-[8px] text-[rgba(255,51,102,0.4)] font-mono animate-pulse">
                  Downloading OFAC SDN list…
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,51,102,0.2) transparent' }}>
          {matches.map((m, i) => (
            <MatchRow key={`${m.sdn_uid}-${m.screened_at}`} match={m} idx={i} />
          ))}
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-t border-[rgba(255,51,102,0.1)] bg-[rgba(255,51,102,0.03)] flex items-center justify-between">
        <span className="text-[7px] font-mono text-[rgba(255,51,102,0.3)]">
          Source: US Treasury OFAC SDN List · treasury.gov/ofac
        </span>
        {stats && (
          <span className="text-[7px] font-mono text-[rgba(255,51,102,0.3)]">
            Threshold {Math.round(stats.match_threshold * 100)}% · Refreshes every {stats.refresh_interval_s / 60}min
          </span>
        )}
      </div>
    </div>
  )
}
