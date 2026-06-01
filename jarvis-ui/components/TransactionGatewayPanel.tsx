'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePolling } from '@/lib/usePolling'
import {
  fetchGatewayDecisions, fetchGatewayStats,
  triggerMockTransaction, triggerGatewayBatch,
  type GatewayDecision, type GatewayStats,
} from '@/lib/api'
import { Shield, AlertTriangle, Zap, Lock, CheckCircle, XCircle } from 'lucide-react'

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  APPROVED:   { label: 'APPROVED',    color: '#00ff88', icon: CheckCircle },
  HARD_BLOCK: { label: 'HARD BLOCK',  color: '#ff3366', icon: XCircle },
  PURGATORY:  { label: 'PURGATORY',   color: '#ffaa00', icon: Lock },
  PENDING:    { label: 'PENDING',     color: 'rgba(0,255,136,0.4)', icon: Zap },
}

const BUCKET_COLOR: Record<string, string> = {
  NANO:         'rgba(0,255,136,0.4)',
  MICRO:        'rgba(0,255,136,0.6)',
  SMALL:        '#00ff88',
  MEDIUM:       '#ffaa00',
  LARGE:        '#ff8800',
  XLARGE:       '#ff5500',
  INSTITUTIONAL:'#ff3366',
}

function VoteBar({ votes }: { votes: GatewayDecision['votes'] }) {
  const total = votes.length
  const flagged = votes.filter(v => v.flags_suspicious).length
  return (
    <div className="flex gap-0.5 items-center">
      {votes.map((v, i) => (
        <motion.div
          key={v.node_type}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: i * 0.03, duration: 0.2 }}
          className="w-2 rounded-sm"
          style={{
            height: 12,
            background: v.flags_suspicious ? '#ff3366' : 'rgba(0,255,136,0.5)',
            opacity: 0.8 + v.confidence * 0.2,
          }}
          title={`${v.node_type}: ${v.flags_suspicious ? 'suspicious' : 'clear'} (${(v.confidence * 100).toFixed(0)}%)`}
        />
      ))}
      <span className="text-[8px] font-mono text-[rgba(0,255,136,0.4)] ml-1">
        {flagged}/{total}
      </span>
    </div>
  )
}

function DecisionRow({ d, onClick }: { d: GatewayDecision; onClick: () => void }) {
  const meta = STATUS_META[d.status] ?? STATUS_META.PENDING
  const Icon = meta.icon
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
      layout
      onClick={onClick}
      className="flex items-center gap-2 px-2 py-1.5 rounded border border-transparent
        hover:border-[rgba(0,255,136,0.15)] hover:bg-[rgba(0,255,136,0.03)]
        cursor-pointer transition-colors"
    >
      <Icon className="w-3 h-3 shrink-0" style={{ color: meta.color }} />
      <span className="font-mono text-[9px] text-[rgba(0,255,136,0.5)] w-20 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {(d.masked_tx_id ?? '').slice(0, 12)}
      </span>
      <span
        className="font-mono text-[8px] uppercase font-bold shrink-0 w-14"
        style={{ color: meta.color }}
      >
        {meta.label}
      </span>
      <span
        className="font-mono text-[8px] shrink-0"
        style={{ color: BUCKET_COLOR[d.amount_bucket] ?? '#00ff88' }}
      >
        {d.amount_bucket}
      </span>
      <span className="font-mono text-[8px] text-[rgba(0,255,136,0.4)] shrink-0 w-12">
        {(d.tx_type ?? '').slice(0, 8)}
      </span>
      <div className="flex-1 min-w-0">
        <VoteBar votes={d.votes} />
      </div>
      <span className="font-mono text-[8px] text-[rgba(0,255,136,0.4)] shrink-0">
        {(d.weighted_suspicion * 100).toFixed(0)}%
      </span>
    </motion.div>
  )
}

function DecisionDetail({ d, onClose }: { d: GatewayDecision; onClose: () => void }) {
  const meta = STATUS_META[d.status] ?? STATUS_META.PENDING
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(5,5,8,0.85)]"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0d1a] border border-[rgba(0,255,136,0.2)] rounded-lg p-5 max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[rgba(0,255,136,0.5)] uppercase tracking-wider">
              Gateway Decision
            </span>
            <span className="font-mono text-[11px] font-bold" style={{ color: meta.color }}>
              {meta.label}
            </span>
          </div>
          <button onClick={onClose} className="text-[rgba(0,255,136,0.4)] hover:text-[#00ff88] text-xs"></button>
        </div>

        {/* TX info */}
        <div className="space-y-1 mb-4 font-mono text-[10px]">
          <div className="flex justify-between">
            <span className="text-[rgba(0,255,136,0.4)]">Masked TX</span>
            <span className="text-[#00ff88]">{d.masked_tx_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgba(0,255,136,0.4)]">Type</span>
            <span className="text-[#00ff88]">{d.tx_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgba(0,255,136,0.4)]">Amount Bucket</span>
            <span style={{ color: BUCKET_COLOR[d.amount_bucket] ?? '#00ff88' }}>{d.amount_bucket}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgba(0,255,136,0.4)]">Weighted Suspicion</span>
            <span style={{ color: d.weighted_suspicion >= 0.28 ? '#ff3366' : '#00ff88' }}>
              {(d.weighted_suspicion * 100).toFixed(1)}% {d.weighted_suspicion >= 0.28 ? '' : ''}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgba(0,255,136,0.4)]">Purgatory Time</span>
            <span className="text-[#ffaa00]">{d.purgatory_ms}ms</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[rgba(0,255,136,0.4)]">Votes (suspicious/total)</span>
            <span className="text-[#00ff88]">{d.yes_count} / {d.votes.length}</span>
          </div>
        </div>

        {/* Block reason */}
        {d.hard_block_reason && (
          <div className="mb-4 p-2 rounded border border-[rgba(255,51,102,0.3)] bg-[rgba(255,51,102,0.05)]">
            <div className="text-[8px] uppercase text-[rgba(255,51,102,0.6)] mb-1">Block Reason</div>
            <div className="text-[9px] font-mono text-[#ff3366]">{d.hard_block_reason}</div>
          </div>
        )}

        {/* Agent votes */}
        <div className="text-[8px] uppercase text-[rgba(0,255,136,0.4)] tracking-wider mb-2">
          Agent Votes
        </div>
        <div className="space-y-1">
          {d.votes.sort((a, b) => b.weight - a.weight).map(v => (
            <div key={v.node_type} className="flex items-center gap-2 font-mono text-[9px]">
              <span className="w-24 text-[rgba(0,255,136,0.5)] text-[8px] shrink-0">{v.node_type}</span>
              <span className="text-[rgba(0,255,136,0.3)] w-8 text-right shrink-0">×{v.weight}</span>
              <div className="flex-1 h-1.5 bg-[rgba(0,255,136,0.08)] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${v.confidence * 100}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full rounded-full"
                  style={{ background: v.flags_suspicious ? '#ff3366' : 'rgba(0,255,136,0.6)' }}
                />
              </div>
              <span
                className="w-6 text-right text-[8px] shrink-0"
                style={{ color: v.flags_suspicious ? '#ff3366' : '#00ff88' }}
              >
                {v.flags_suspicious ? '' : ''}
              </span>
              <span className="text-[rgba(0,255,136,0.3)] text-[8px] shrink-0">{v.latency_ms}ms</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

export default function TransactionGatewayPanel() {
  const [selected, setSelected] = useState<GatewayDecision | null>(null)
  const [loading, setLoading] = useState(false)

  const { data: decisions } = usePolling(fetchGatewayDecisions, 3000, [])
  const { data: stats }     = usePolling(fetchGatewayStats, 3000)

  const s = stats as GatewayStats | null
  const list = (decisions as GatewayDecision[]) ?? []

  const fireMock = useCallback(async (suspicious: boolean) => {
    setLoading(true)
    await triggerMockTransaction(suspicious)
    setLoading(false)
  }, [])

  const fireBatch = useCallback(async () => {
    setLoading(true)
    await triggerGatewayBatch(5, false)
    setLoading(false)
  }, [])

  return (
    <>
      <AnimatePresence>
        {selected && <DecisionDetail d={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>

      <div className="bg-[#0d0d1a] border border-[rgba(0,255,136,0.15)] rounded h-full flex flex-col">
        {/* Header */}
        <div className="px-3 pt-3 pb-2 border-b border-[rgba(0,255,136,0.1)] shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest text-[rgba(0,255,136,0.6)]">
                Transaction Gateway // Pre-Execution Quorum
              </span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => fireMock(false)}
                disabled={loading}
                className="text-[8px] uppercase tracking-wider px-2 py-0.5 border border-[rgba(0,255,136,0.3)]
                  text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors disabled:opacity-40"
              >
                + MOCK
              </button>
              <button
                onClick={() => fireMock(true)}
                disabled={loading}
                className="text-[8px] uppercase tracking-wider px-2 py-0.5 border border-[rgba(255,51,102,0.3)]
                  text-[#ff3366] rounded hover:bg-[rgba(255,51,102,0.08)] transition-colors disabled:opacity-40"
              >
                + SUSPICIOUS
              </button>
              <button
                onClick={fireBatch}
                disabled={loading}
                className="text-[8px] uppercase tracking-wider px-2 py-0.5 border border-[rgba(255,170,0,0.3)]
                  text-[#ffaa00] rounded hover:bg-[rgba(255,170,0,0.08)] transition-colors disabled:opacity-40"
              >
                BATCH×5
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Evaluated', value: s?.total_evaluated ?? 0, color: '#00ff88' },
              { label: 'Approved',  value: s?.approved ?? 0,        color: '#00ff88' },
              { label: 'Blocked',   value: s?.hard_blocked ?? 0,    color: '#ff3366' },
              { label: 'Block Rate',value: `${s?.block_rate_pct ?? 0}%`, color: (s?.block_rate_pct ?? 0) > 20 ? '#ff3366' : '#ffaa00' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className="text-[8px] uppercase text-[rgba(0,255,136,0.35)] tracking-wider">{label}</div>
                <div className="text-sm font-bold font-mono" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Avg suspicion bar */}
          <div className="mt-2">
            <div className="flex justify-between text-[7px] font-mono text-[rgba(0,255,136,0.35)] mb-0.5">
              <span>AVG WEIGHTED SUSPICION</span>
              <span>{s?.avg_suspicion_pct ?? 0}%</span>
            </div>
            <div className="h-0.5 bg-[rgba(0,255,136,0.08)] rounded-full overflow-hidden">
              <motion.div
                animate={{ width: `${s?.avg_suspicion_pct ?? 0}%` }}
                transition={{ duration: 0.8 }}
                className="h-full rounded-full"
                style={{ background: (s?.avg_suspicion_pct ?? 0) > 28 ? '#ff3366' : '#00ff88' }}
              />
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div className="px-2 py-1 grid grid-cols-[16px_80px_56px_56px_56px_1fr_32px] gap-2
          text-[7px] uppercase tracking-wider text-[rgba(0,255,136,0.3)] shrink-0">
          <span />
          <span>Masked TX</span>
          <span>Status</span>
          <span>Bucket</span>
          <span>Type</span>
          <span>Votes</span>
          <span className="text-right">Sus%</span>
        </div>

        {/* Decisions list */}
        <div className="flex-1 overflow-y-auto px-1 space-y-0.5 min-h-0">
          <AnimatePresence mode="popLayout" initial={false}>
            {list.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-[9px] text-[rgba(0,255,136,0.25)] uppercase tracking-widest animate-pulse">
                  Fire a mock transaction to begin
                </div>
              </div>
            ) : (
              [...list].reverse().slice(0, 25).map(d => (
                <DecisionRow key={d.tx_id + d.ts} d={d} onClick={() => setSelected(d)} />
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1.5 border-t border-[rgba(0,255,136,0.08)] text-[7px]
          text-[rgba(0,255,136,0.25)] uppercase tracking-wider shrink-0">
          Click any row to inspect agent votes · HARD BLOCK threshold: 28% weighted suspicion
        </div>
      </div>
    </>
  )
}
