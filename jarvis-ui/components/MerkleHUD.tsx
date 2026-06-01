'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchMerkle } from '@/lib/api'

interface MerkleLeaf {
  hash:       string
  ts:         number
  event_type?: string
}

interface MerkleData {
  root:   string | null
  depth:  number
  leaves: MerkleLeaf[]
}

const EVENT_COLORS: Record<string, string> = {
  CONSENSUS_ROUND:  '#00ff88',
  ANOMALY_DETECTED: '#ff3366',
  HEALING_EVENT:    '#00aaff',
  GATEWAY_BLOCK:    '#ff3366',
  THREAT_DETECTED:  '#ffaa00',
  AUDIT_ENTRY:      'rgba(0,255,136,0.5)',
}

function hashColor(hash: string): string {
  const val = parseInt(hash.slice(0, 4), 16)
  const hue = val % 360
  return `hsl(${hue}, 80%, 60%)`
}

export default function MerkleHUD() {
  const [merkle, setMerkle] = useState<MerkleData | null>(null)
  const [prevRoot, setPrevRoot] = useState<string | null>(null)
  const [rootChanged, setRootChanged] = useState(false)
  const [ticker, setTicker] = useState<MerkleLeaf[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll every 2s
  useEffect(() => {
    const poll = async () => {
      const data = await fetchMerkle() as MerkleData | null
      if (!data) return
      setMerkle(prev => {
        if (prev?.root !== data.root) {
          setPrevRoot(prev?.root ?? null)
          setRootChanged(true)
          setTimeout(() => setRootChanged(false), 1200)
          // Prepend new leaves to ticker
          const newLeaves = data.leaves.slice(0, 5)
          setTicker(t => [...newLeaves, ...t].slice(0, 40))
        }
        return data
      })
    }
    poll()
    intervalRef.current = setInterval(poll, 2000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const leaves = merkle?.leaves ?? []
  const root   = merkle?.root ?? null

  return (
    <div className="bg-[#0d0d1a] border border-[rgba(0,255,136,0.15)] rounded p-3 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
          <span className="text-[10px] uppercase tracking-widest text-[rgba(0,255,136,0.6)]">
            Merkle HUD // Live SHA-256 Verification
          </span>
        </div>
        <div className="flex gap-2 text-[9px] font-mono">
          <span className="text-[rgba(0,255,136,0.4)]">
            DEPTH: <span className="text-[#00ff88]">{merkle?.depth ?? 0}</span>
          </span>
          <span className="text-[rgba(0,255,136,0.4)]">
            LEAVES: <span className="text-[#00ff88]">{leaves.length}</span>
          </span>
        </div>
      </div>

      {/* Root display */}
      <motion.div
        animate={rootChanged ? { scale: [1, 1.03, 1], opacity: [1, 0.6, 1] } : {}}
        transition={{ duration: 0.5 }}
        className={`rounded border px-3 py-2 font-mono text-[10px] transition-colors duration-300
          ${rootChanged
            ? 'border-[rgba(0,255,136,0.6)] bg-[rgba(0,255,136,0.08)]'
            : 'border-[rgba(0,255,136,0.2)] bg-[rgba(0,255,136,0.02)]'
          }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[rgba(0,255,136,0.4)] uppercase tracking-wider text-[9px]">
            Merkle Root
          </span>
          {rootChanged && (
            <motion.span
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-[#00ff88] text-[8px] uppercase tracking-wider"
            >
              ↑ UPDATED
            </motion.span>
          )}
        </div>
        <div className="mt-0.5 text-[#00ff88] text-[11px] tracking-wide break-all leading-tight">
          {root ? (
            <>
              <span className="text-[rgba(0,255,136,0.5)]">{root.slice(0, 16)}</span>
              <span className="text-[#00ff88]">{root.slice(16, 32)}</span>
              <span className="text-[rgba(0,255,136,0.5)]">{root.slice(32, 48)}</span>
              <span className="text-[rgba(0,255,136,0.3)]">{root.slice(48)}</span>
            </>
          ) : (
            <span className="text-[rgba(0,255,136,0.3)] animate-pulse">PENDING…</span>
          )}
        </div>
        {prevRoot && rootChanged && (
          <div className="mt-1 text-[8px] text-[rgba(255,51,102,0.5)] tracking-wide break-all line-through">
            {prevRoot.slice(0, 32)}…
          </div>
        )}
      </motion.div>

      {/* Rolling leaf ticker */}
      <div className="overflow-hidden" style={{ height: 120 }}>
        <div className="text-[8px] uppercase text-[rgba(0,255,136,0.3)] tracking-wider mb-1">
          Live audit stream
        </div>
        <div className="space-y-0.5 overflow-y-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            {ticker.slice(0, 8).map((leaf, i) => (
              <motion.div
                key={leaf.hash + leaf.ts}
                initial={{ opacity: 0, x: -12, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
                className="flex items-center gap-2 font-mono text-[8px] py-0.5"
              >
                {/* Color dot */}
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: leaf.event_type ? EVENT_COLORS[leaf.event_type] ?? hashColor(leaf.hash) : hashColor(leaf.hash) }}
                />
                {/* Hash */}
                <span className="text-[rgba(0,255,136,0.6)] shrink-0 w-28 overflow-hidden text-ellipsis whitespace-nowrap">
                  {(leaf.hash ?? '').slice(0, 14)}…
                </span>
                {/* Event type */}
                <span
                  className="uppercase tracking-wider shrink-0 text-[7px]"
                  style={{ color: leaf.event_type ? EVENT_COLORS[leaf.event_type] ?? 'rgba(0,255,136,0.5)' : 'rgba(0,255,136,0.3)' }}
                >
                  {leaf.event_type ?? 'ENTRY'}
                </span>
                {/* Timestamp */}
                <span className="text-[rgba(0,255,136,0.25)] ml-auto shrink-0">
                  {new Date(leaf.ts * 1000).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Hash chain mini-visualiser */}
      <div className="flex items-center gap-1 overflow-hidden">
        {leaves.slice(-12).map((leaf, i) => (
          <motion.div
            key={leaf.hash}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-1 shrink-0"
          >
            <div
              className="w-4 h-4 rounded text-[5px] font-mono flex items-center justify-center border"
              style={{
                background: `${hashColor(leaf.hash)}18`,
                borderColor: `${hashColor(leaf.hash)}60`,
                color: hashColor(leaf.hash),
              }}
              title={leaf.hash}
            >
              {(leaf.hash ?? '').slice(0, 3)}
            </div>
            {i < leaves.slice(-12).length - 1 && (
              <span className="text-[rgba(0,255,136,0.2)] text-[8px]">→</span>
            )}
          </motion.div>
        ))}
        {leaves.length === 0 && (
          <span className="text-[8px] text-[rgba(0,255,136,0.2)] animate-pulse uppercase tracking-wider">
            Building chain…
          </span>
        )}
      </div>
    </div>
  )
}
