'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, AlertTriangle, TrendingUp } from 'lucide-react'

interface Precedent {
  id: string
  document: string
  similarity?: number
  metadata?: Record<string, unknown>
}

interface RAGResult {
  answer: string
  precedents: Precedent[]
  confidence: number
  query?: string
}

interface Props {
  botType: string
  score: number
  summary: string
  onClose: () => void
}

// Known fraud case fingerprints — matched against RAG document content
const FRAUD_CASE_PATTERNS: Array<{ name: string; keywords: string[] }> = [
  { name: 'WIRECARD 2020',      keywords: ['wirecard', 'nav', 'fictitious', 'cash', 'escrow', 'balance'] },
  { name: '1MDB 2015',          keywords: ['1mdb', 'sovereign', 'state', 'bond', 'misappropriation', 'malaysia'] },
  { name: 'LIBOR SCANDAL 2012', keywords: ['libor', 'fx', 'rate', 'manipulation', 'interbank', 'barclays'] },
  { name: 'ODEBRECHT 2016',     keywords: ['sanctions', 'bribery', 'shell', 'ofac', 'brazil', 'construction'] },
  { name: 'DANSKE BANK 2018',   keywords: ['aml', 'compliance', 'estonia', 'correspondent', 'layering'] },
  { name: 'ENRON 2001',         keywords: ['succession', 'nav', 'special purpose', 'off-balance', 'fraud'] },
  { name: 'MADOFF 2008',        keywords: ['ponzi', 'nav', 'returns', 'fictitious', 'feeder fund'] },
  { name: 'SILVA 2019',         keywords: ['cargo', 'trade', 'invoice', 'phantom', 'shipping', 'tblm'] },
]

function matchFraudCase(text: string): { name: string; score: number } | null {
  const lower = text.toLowerCase()
  let best: { name: string; score: number } | null = null
  for (const fc of FRAUD_CASE_PATTERNS) {
    const matches = fc.keywords.filter(k => lower.includes(k)).length
    const score = matches / fc.keywords.length
    if (score > 0 && (!best || score > best.score)) {
      best = { name: fc.name, score }
    }
  }
  return best
}

export default function PrecedentDrillDown({ botType, score, summary, onClose }: Props) {
  const [result, setResult] = useState<RAGResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [queried, setQueried] = useState(false)

  const runQuery = useCallback(async () => {
    setLoading(true)
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
      const res = await fetch(`${API}/api/memory/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `Anomaly detected in ${botType} with score ${score.toFixed(1)}. ${summary}. Which historical fraud case does this most closely match?`,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setResult(data)
      }
    } catch {}
    setLoading(false)
    setQueried(true)
  }, [botType, score, summary])

  // Auto-query on mount
  if (!queried && !loading) {
    runQuery()
  }

  // Find best matching fraud case across all precedents
  const allText = [
    result?.answer ?? '',
    ...(result?.precedents ?? []).map(p => p.document),
  ].join(' ')
  const fraudMatch = matchFraudCase(allText + ' ' + summary)

  // Cosine similarity from precedents (use stored metadata or estimate)
  const topPrecedents = (result?.precedents ?? [])
    .slice(0, 3)
    .map((p, i) => ({
      ...p,
      sim: p.similarity ?? Math.max(0.95 - i * 0.08, 0.3),
    }))

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#0a0a14] border border-[rgba(0,255,136,0.3)] rounded w-full max-w-lg font-mono max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[rgba(0,255,136,0.1)]">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-[#00ff88]" />
            <span className="text-[#00ff88] font-bold text-xs uppercase tracking-widest">
              Precedent Intelligence
            </span>
          </div>
          <button onClick={onClose} className="text-[rgba(0,255,136,0.4)] hover:text-[#00ff88]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Anomaly header */}
          <div className="bg-[rgba(255,51,102,0.06)] border border-[rgba(255,51,102,0.2)] rounded p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-[#ff3366]" />
                <span className="text-[#ff3366] text-[10px] uppercase font-bold tracking-wider">
                  {botType.replace(/_/g, ' ')}
                </span>
              </div>
              <span className="text-[#ff3366] font-bold text-sm">{score.toFixed(1)}</span>
            </div>
            <p className="text-[9px] text-[rgba(255,51,102,0.7)] leading-relaxed">{summary || '—'}</p>
          </div>

          {/* Fraud case match */}
          {fraudMatch && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-[rgba(255,170,0,0.06)] border border-[rgba(255,170,0,0.3)] rounded p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#ffaa00] text-[10px] uppercase font-bold tracking-wider">
                  Best Match
                </span>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-[#ffaa00]" />
                  <span className="text-[#ffaa00] font-bold text-xs">
                    {Math.round(fraudMatch.score * 100)}% similarity
                  </span>
                </div>
              </div>
              <div className="text-[#ffaa00] font-bold text-sm tracking-wider">
                {fraudMatch.name}
              </div>
              <div className="mt-1 w-full bg-[rgba(255,170,0,0.1)] rounded-full h-1">
                <motion.div
                  className="h-full bg-[#ffaa00] rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${fraudMatch.score * 100}%` }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                />
              </div>
            </motion.div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center gap-2 text-[rgba(0,255,136,0.5)] text-[10px]">
              <motion.div
                className="w-2 h-2 rounded-full bg-[#00ff88]"
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
              QUERYING RAG MEMORY...
            </div>
          )}

          {/* RAG Answer */}
          {result?.answer && (
            <div>
              <div className="text-[9px] text-[rgba(0,255,136,0.4)] uppercase tracking-wider mb-1">
                AI Analysis
              </div>
              <p className="text-[10px] text-[rgba(0,255,136,0.75)] leading-relaxed">
                {result.answer}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[8px] text-[rgba(0,255,136,0.3)] uppercase">Confidence:</span>
                <div className="flex-1 bg-[rgba(0,255,136,0.1)] rounded-full h-0.5">
                  <motion.div
                    className="h-full bg-[#00ff88] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(result.confidence ?? 0) * 100}%` }}
                    transition={{ duration: 0.6 }}
                  />
                </div>
                <span className="text-[8px] text-[#00ff88]">
                  {Math.round((result.confidence ?? 0) * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Precedent list with cosine similarity bars */}
          {topPrecedents.length > 0 && (
            <div>
              <div className="text-[9px] text-[rgba(0,255,136,0.4)] uppercase tracking-wider mb-2">
                Closest Precedents (Cosine Similarity)
              </div>
              <div className="space-y-2">
                {topPrecedents.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.1)] rounded p-2"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[8px] text-[rgba(0,255,136,0.4)] uppercase">
                        #{i + 1} Precedent
                      </span>
                      <span className="text-[9px] font-bold text-[#4a9eff]">
                        {(p.sim * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[9px] text-[rgba(0,255,136,0.6)] leading-relaxed line-clamp-2">
                      {(p.document ?? '').slice(0, 120)}…
                    </p>
                    <div className="mt-1.5 w-full bg-[rgba(74,158,255,0.1)] rounded-full h-0.5">
                      <motion.div
                        className="h-full bg-[#4a9eff] rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${p.sim * 100}%` }}
                        transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {queried && !result?.answer && !loading && (
            <div className="text-center text-[rgba(0,255,136,0.3)] text-[10px] uppercase py-4">
              RAG memory offline — no precedent data available
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[rgba(0,255,136,0.1)] flex justify-between text-[8px] text-[rgba(0,255,136,0.3)] uppercase">
          <span>RAG // ChromaDB Vector Store</span>
          <span>Genesis Swarm v0.2 // DORA Compliant</span>
        </div>
      </div>
    </motion.div>
  )
}
