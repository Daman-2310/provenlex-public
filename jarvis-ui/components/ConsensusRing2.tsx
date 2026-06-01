'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import { usePolling } from '@/lib/usePolling'
import {
  fetchTrust, fetchConsensusLatestRound, fetchQuarantine,
  quarantineNode, restoreNode,
  type ConsensusRound, type ConsensusVote,
} from '@/lib/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const BOT_ORDER = [
  'YACHT_GUARDIAN','ORBITAL_BOT','NAV_DETECTOR','SOVEREIGN_BOT','SANCTIONS_BOT',
  'FX_BOT','COMPLIANCE_BOT','SHADOW_BOT','CARGO_BOT','FUEL_BOT','SUCCESSION_BOT',
]

const BOT_LABELS: Record<string, string> = {
  YACHT_GUARDIAN: 'YCHT', ORBITAL_BOT: 'ORBT', NAV_DETECTOR: 'NAV',
  SOVEREIGN_BOT: 'SOVR', SANCTIONS_BOT: 'SANC', FX_BOT: 'FX',
  COMPLIANCE_BOT: 'CMPL', SHADOW_BOT: 'SHDW', CARGO_BOT: 'CRGO',
  FUEL_BOT: 'FUEL', SUCCESSION_BOT: 'SUCC',
}

// Weights mirrored from swarm_consensus.py
const NODE_WEIGHTS: Record<string, number> = {
  YACHT_GUARDIAN: 2.5, ORBITAL_BOT: 2.5, NAV_DETECTOR: 2.0, SOVEREIGN_BOT: 2.0,
  SANCTIONS_BOT: 2.0, FX_BOT: 1.8, COMPLIANCE_BOT: 1.8, SHADOW_BOT: 1.5,
  CARGO_BOT: 1.2, FUEL_BOT: 1.0, SUCCESSION_BOT: 1.0,
}

const W = 420, H = 380
const CX = W / 2, CY = H / 2
const R  = 138    // node ring radius
const NR = 13     // node circle radius
const QUORUM = 8

function nodePos(i: number) {
  const angle = (2 * Math.PI * i) / BOT_ORDER.length - Math.PI / 2
  return { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle), angle }
}

function trustColor(score: number) {
  if (score >= 0.8) return '#00ff88'
  if (score >= 0.6) return '#ffaa00'
  return '#ff3366'
}

function weightToOpacity(w: number) {
  return 0.3 + (w / 2.5) * 0.5
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  chaosMode: boolean
  onChaosToggle: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConsensusRing2({ chaosMode, onChaosToggle }: Props) {
  const { data: trust }   = usePolling(fetchTrust, 4000)
  const { data: roundRaw } = usePolling(fetchConsensusLatestRound, 3000)
  const { data: qData }   = usePolling(fetchQuarantine, 3000)

  const round = roundRaw as ConsensusRound | null
  const quarantined = (qData as { quarantined: string | null })?.quarantined ?? null

  // Animation state
  const [propagating, setPropagating] = useState(false)
  const [revealedVotes, setRevealedVotes] = useState<Set<string>>(new Set())
  const [quorumFlash, setQuorumFlash]   = useState(false)
  const lastRoundId = useRef<string>('')

  // Trigger evidence propagation animation on new round
  useEffect(() => {
    if (!round || round.round_id === lastRoundId.current) return
    lastRoundId.current = round.round_id
    setRevealedVotes(new Set())
    setPropagating(true)

    // Stagger vote reveals by latency order
    const sorted = [...(round.votes ?? [])].sort((a, b) => a.latency_ms - b.latency_ms)
    sorted.forEach((vote, idx) => {
      setTimeout(() => {
        setRevealedVotes(prev => new Set(Array.from(prev).concat(vote.node_type)))
      }, 120 + idx * 90)
    })

    // Flash quorum indicator when reached
    const totalDelay = 120 + sorted.length * 90 + 200
    setTimeout(() => {
      if (round.quorum_reached) setQuorumFlash(true)
      setPropagating(false)
    }, totalDelay)
    setTimeout(() => setQuorumFlash(false), totalDelay + 1200)
  }, [round?.round_id])

  // Vote lookup map
  const voteMap: Record<string, ConsensusVote> = {}
  round?.votes?.forEach(v => { voteMap[v.node_type] = v })

  const trustScores = (trust as unknown as { scores?: Record<string, { trust_score: number }> })?.scores ?? {}
  const health      = (trust as unknown as { quorum_health?: { trusted_count: number; total: number; healthy: boolean; avg_trust: number; min_trust: number } })?.quorum_health

  const initiatorIdx = round ? BOT_ORDER.indexOf(round.initiator_bot) : -1

  return (
    <div className="bg-[#0d0d1a] border border-[rgba(0,255,136,0.2)] rounded p-3 font-mono h-full flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[#00ff88] tracking-widest font-bold text-xs uppercase">
          BFT Consensus Ring 2.0
        </span>
        <div className="flex items-center gap-2">
          {round && (
            <span className="text-[9px] text-[rgba(0,255,136,0.5)] uppercase">
              RND #{round.round_id}
            </span>
          )}
          <span className={`text-[10px] uppercase px-2 py-0.5 rounded border ${
            health?.healthy
              ? 'text-[#00ff88] border-[rgba(0,255,136,0.3)]'
              : 'text-[#ff3366] border-[rgba(255,51,102,0.3)] animate-pulse'
          }`}>
            {health?.healthy ? '● HEALTHY' : 'DEGRADED'}
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative flex-1 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', maxWidth: W, height: 'auto' }}
        >
          {/* Outer ring */}
          <motion.circle
            cx={CX} cy={CY} r={R + 18}
            fill="none"
            stroke={quorumFlash ? '#00ff88' : 'rgba(0,255,136,0.06)'}
            strokeWidth={quorumFlash ? 2 : 1}
            animate={quorumFlash ? { opacity: [1, 0.3, 1, 0.3, 1] } : { opacity: 1 }}
            transition={{ duration: 0.8 }}
          />

          {/* Background connection lines between high-trust nodes */}
          {BOT_ORDER.map((botA, i) => BOT_ORDER.map((botB, j) => {
            if (j <= i) return null
            const scoreA = trustScores[botA]?.trust_score ?? 1
            const scoreB = trustScores[botB]?.trust_score ?? 1
            if (scoreA < 0.7 || scoreB < 0.7) return null
            const pA = nodePos(i), pB = nodePos(j)
            return (
              <line key={`${i}-${j}`}
                x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y}
                stroke="rgba(0,255,136,0.05)" strokeWidth={0.5}
              />
            )
          }))}

          {/* Evidence propagation lines — animate from initiator to each voter */}
          <AnimatePresence>
            {propagating && initiatorIdx >= 0 && round?.votes?.map((vote) => {
              const voterIdx = BOT_ORDER.indexOf(vote.node_type)
              if (voterIdx < 0 || voterIdx === initiatorIdx) return null
              const from = nodePos(initiatorIdx)
              const to   = nodePos(voterIdx)
              const color = vote.vote ? '#00ff88' : 'rgba(255,51,102,0.7)'
              return (
                <motion.line
                  key={`prop-${vote.node_type}`}
                  x1={from.x} y1={from.y}
                  x2={to.x}   y2={to.y}
                  stroke={color}
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.9 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, delay: vote.latency_ms / 1000 }}
                />
              )
            })}
          </AnimatePresence>

          {/* Nodes */}
          {BOT_ORDER.map((bot, i) => {
            const pos       = nodePos(i)
            const trust_s   = trustScores[bot]?.trust_score ?? 1.0
            const color     = trustColor(trust_s)
            const vote      = voteMap[bot]
            const revealed  = revealedVotes.has(bot)
            const isInit    = round?.initiator_bot === bot
            const isQuaran  = quarantined === bot
            const weight    = NODE_WEIGHTS[bot] ?? 1.0

            // Node fill based on vote state
            const nodeFill = isQuaran
              ? 'rgba(255,51,102,0.15)'
              : revealed && vote?.vote
              ? 'rgba(0,255,136,0.12)'
              : revealed && !vote?.vote
              ? 'rgba(255,51,102,0.08)'
              : '#0d0d1a'

            const nodeStroke = isQuaran
              ? '#ff3366'
              : isInit
              ? '#ffaa00'
              : color

            return (
              <g key={bot}>
                {/* Glow ring */}
                <motion.circle
                  cx={pos.x} cy={pos.y} r={NR * 2.2}
                  fill={`${nodeStroke}18`}
                  animate={isInit && propagating
                    ? { r: [NR * 2.2, NR * 3.2, NR * 2.2], opacity: [0.4, 0.8, 0.4] }
                    : { r: NR * 2.2, opacity: weightToOpacity(weight) * 0.4 }
                  }
                  transition={{ duration: 0.6, repeat: propagating && isInit ? Infinity : 0 }}
                />

                {/* Node circle */}
                <motion.circle
                  cx={pos.x} cy={pos.y} r={NR}
                  fill={nodeFill}
                  stroke={nodeStroke}
                  strokeWidth={isInit || isQuaran ? 2 : 1.5}
                  animate={isQuaran
                    ? { x: [0, -1.5, 1.5, -1, 1, 0], opacity: [1, 0.7, 1, 0.7, 1] }
                    : revealed
                    ? { scale: [1, 1.15, 1] }
                    : { scale: 1 }
                  }
                  transition={{ duration: 0.3 }}
                />

                {/* Label */}
                <text
                  x={pos.x} y={pos.y + 0.5}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={7} fontWeight="bold"
                  fontFamily='"JetBrains Mono", monospace'
                  fill={isQuaran ? '#ff3366' : nodeStroke}
                >
                  {BOT_LABELS[bot]}
                </text>

                {/* Trust % outside ring */}
                <text
                  x={CX + (R + 24) * Math.cos(pos.angle)}
                  y={CY + (R + 24) * Math.sin(pos.angle)}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={6} fontFamily='"JetBrains Mono", monospace'
                  fill="rgba(0,255,136,0.5)"
                >
                  {Math.round(trust_s * 100)}%
                </text>

                {/* Weight badge (top-right of node) */}
                {weight >= 2.0 && (
                  <text
                    x={pos.x + 10} y={pos.y - 10}
                    fontSize={5.5} fontFamily='"JetBrains Mono", monospace'
                    fill="#ffaa00" opacity={0.9}
                  >
                    {weight}×
                  </text>
                )}

                {/* Vote indicator when revealed */}
                {revealed && vote && (
                  <motion.text
                    x={pos.x} y={pos.y - NR - 6}
                    textAnchor="middle"
                    fontSize={8} fontFamily='"JetBrains Mono", monospace'
                    fill={vote.vote ? '#00ff88' : '#ff3366'}
                    initial={{ opacity: 0, y: pos.y - NR - 2 }}
                    animate={{ opacity: 1, y: pos.y - NR - 6 }}
                    transition={{ duration: 0.2 }}
                  >
                    {vote.vote ? '' : ''}
                  </motion.text>
                )}

                {/* QUARANTINED badge */}
                {isQuaran && (
                  <motion.text
                    x={pos.x} y={pos.y + NR + 10}
                    textAnchor="middle" fontSize={5}
                    fontFamily='"JetBrains Mono", monospace'
                    fill="#ff3366"
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  >
                    QUARANTINED
                  </motion.text>
                )}
              </g>
            )
          })}

          {/* Center quorum display */}
          <motion.circle
            cx={CX} cy={CY} r={46}
            fill="#08080f"
            stroke={quorumFlash ? '#00ff88' : round?.quorum_reached ? 'rgba(0,255,136,0.4)' : 'rgba(255,51,102,0.3)'}
            strokeWidth={quorumFlash ? 2.5 : 1.5}
            animate={quorumFlash ? { stroke: ['#00ff88', '#00cc66', '#00ff88'] } : {}}
            transition={{ duration: 0.4 }}
          />

          {/* Quorum fraction */}
          <text
            x={CX} y={CY - 8}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={18} fontWeight="bold"
            fontFamily='"JetBrains Mono", monospace'
            fill={round?.quorum_reached ? '#00ff88' : '#ff3366'}
          >
            {round ? `${round.yes_count}/${BOT_ORDER.length}` : `${health?.trusted_count ?? 11}/${health?.total ?? 11}`}
          </text>

          <text
            x={CX} y={CY + 10}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={6} fontFamily='"JetBrains Mono", monospace'
            fill="rgba(0,255,136,0.5)"
          >
            QUORUM {QUORUM}/11
          </text>

          {round && (
            <text
              x={CX} y={CY + 22}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={5.5} fontFamily='"JetBrains Mono", monospace'
              fill={round.quorum_reached ? 'rgba(0,255,136,0.7)' : 'rgba(255,51,102,0.7)'}
            >
              {round.quorum_reached ? '● COMMITTED' : '○ NO COMMIT'}
            </text>
          )}
        </svg>
      </div>

      {/* Stats strip */}
      {round && (
        <div className="mt-1 grid grid-cols-4 gap-1 text-[9px] border-t border-[rgba(0,255,136,0.1)] pt-2">
          <div className="text-center">
            <div className="text-[rgba(0,255,136,0.4)] uppercase">Weighted</div>
            <div className="text-[#00ff88] font-bold">{(round.weighted_score * 100).toFixed(0)}%</div>
          </div>
          <div className="text-center">
            <div className="text-[rgba(0,255,136,0.4)] uppercase">Latency</div>
            <div className="text-[#4a9eff] font-bold">{(round.commit_latency_ms ?? 0).toFixed(0)}ms</div>
          </div>
          <div className="text-center">
            <div className="text-[rgba(0,255,136,0.4)] uppercase">Verdict</div>
            <div className={`font-bold ${round.final_verdict ? 'text-[#ff3366]' : 'text-[#00ff88]'}`}>
              {round.final_verdict ? 'ANOMALY' : 'CLEAN'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[rgba(0,255,136,0.4)] uppercase">Avg Trust</div>
            <div className="text-[#00ff88] font-bold">{Math.round((health?.avg_trust ?? 1) * 100)}%</div>
          </div>
        </div>
      )}

      {/* Chaos mode controls */}
      <div className="mt-2 pt-2 border-t border-[rgba(0,255,136,0.1)] flex items-center justify-between">
        <button
          onClick={onChaosToggle}
          className={`text-[9px] uppercase px-3 py-1 rounded border transition-all ${
            chaosMode
              ? 'border-[rgba(255,51,102,0.6)] text-[#ff3366] bg-[rgba(255,51,102,0.08)] animate-pulse'
              : 'border-[rgba(255,170,0,0.4)] text-[#ffaa00]'
          }`}
        >
          {chaosMode ? 'CHAOS ACTIVE' : 'CHAOS MODE'}
        </button>
        {quarantined && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#ff3366] uppercase">
              {quarantined.replace(/_/g,' ')} QUARANTINED
            </span>
            <button
              onClick={() => restoreNode()}
              className="text-[8px] uppercase px-2 py-0.5 border border-[rgba(0,255,136,0.3)] text-[rgba(0,255,136,0.6)] rounded"
            >
              Restore
            </button>
          </div>
        )}
        {round && (
          <span className="text-[8px] text-[rgba(0,255,136,0.3)] uppercase">
            root: {round.merkle_root?.slice(0, 10) ?? ''}…
          </span>
        )}
      </div>
    </div>
  )
}
