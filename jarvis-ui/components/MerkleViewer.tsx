'use client'

import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, ShieldAlert, Link } from 'lucide-react'

interface MerkleLeaf {
  hash: string
  ts: number
  event_type?: string
  bot_type?: string
}

interface MerkleData {
  root: string | null
  depth: number
  leaves: MerkleLeaf[]
}

interface Props {
  merkle: MerkleData | null
}

export default function MerkleViewer({ merkle }: Props) {
  const [prevRoot, setPrevRoot] = useState<string | null>(null)
  const [newBlock, setNewBlock] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (merkle?.root && merkle.root !== prevRoot) {
      if (prevRoot !== null) {
        setNewBlock(true)
        setTimeout(() => setNewBlock(false), 1500)
      }
      setPrevRoot(merkle.root)
    }
  }, [merkle?.root])

  const fmt = (h: string) => h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '—'
  const fmtTs = (ts: number) => new Date(ts * 1000).toLocaleTimeString('en-GB', { hour12: false })

  return (
    <div className="bg-[#0d0d1a] border border-[rgba(0,255,136,0.2)] rounded p-4 font-mono text-xs h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link className="w-3.5 h-3.5 text-[#00ff88]" />
          <span className="text-[#00ff88] tracking-widest font-bold text-xs uppercase">
            Merkle Audit Chain
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[rgba(0,255,136,0.5)] uppercase text-[10px]">
            DEPTH: {merkle?.depth ?? 0}
          </span>
          {newBlock && (
            <span className="bg-[#00ff88] text-black px-1.5 py-0.5 text-[10px] font-bold animate-pulse rounded">
              NEW BLOCK
            </span>
          )}
        </div>
      </div>

      {/* Root hash */}
      <div className="mb-3 p-2 bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.15)] rounded">
        <div className="text-[rgba(0,255,136,0.5)] text-[10px] uppercase mb-1">Chain Root</div>
        <div className="text-[#00ff88] text-sm tracking-wider break-all">
          {merkle?.root ? `0x${merkle.root}` : '0x' + '0'.repeat(16)}
        </div>
      </div>

      {/* Integrity status */}
      <div className="flex items-center gap-2 mb-3">
        {merkle?.root ? (
          <>
            <ShieldCheck className="w-4 h-4 text-[#00ff88]" />
            <span className="text-[#00ff88] uppercase text-[10px] tracking-widest">
              Chain Integrity: Verified 
            </span>
          </>
        ) : (
          <>
            <ShieldAlert className="w-4 h-4 text-[#ff3366]" />
            <span className="text-[#ff3366] uppercase text-[10px] tracking-widest">
              Chain Integrity: Awaiting Data
            </span>
          </>
        )}
      </div>

      {/* Leaf list */}
      <div className="text-[rgba(0,255,136,0.5)] text-[10px] uppercase mb-2">
        Recent Audit Records ({merkle?.leaves?.length ?? 0})
      </div>
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scroll"
      >
        {(merkle?.leaves ?? []).slice(0, 20).map((leaf, i) => (
          <div
            key={leaf.hash ?? i}
            className={`
              flex items-center justify-between px-2 py-1 rounded
              border border-[rgba(0,255,136,0.08)]
              ${i === 0 && newBlock ? 'bg-[rgba(0,255,136,0.12)] border-[rgba(0,255,136,0.4)]' : 'bg-[rgba(0,255,136,0.03)]'}
              transition-all duration-500
            `}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[rgba(0,255,136,0.3)] shrink-0">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-[#4a9eff] font-mono text-[10px] truncate">
                {fmt(leaf.hash)}
              </span>
              {leaf.event_type && (
                <span className="text-[rgba(255,170,0,0.8)] text-[9px] uppercase shrink-0">
                  {leaf.event_type.replace(/_/g, ' ').slice(0, 14)}
                </span>
              )}
            </div>
            <span suppressHydrationWarning className="text-[rgba(0,255,136,0.4)] text-[10px] shrink-0 ml-2">
              {leaf.ts ? fmtTs(leaf.ts) : '--:--:--'}
            </span>
          </div>
        ))}
        {(!merkle?.leaves || merkle.leaves.length === 0) && (
          <div className="text-center text-[rgba(0,255,136,0.3)] py-8 text-[11px] uppercase tracking-widest">
            Awaiting Audit Records…
          </div>
        )}
      </div>
    </div>
  )
}
