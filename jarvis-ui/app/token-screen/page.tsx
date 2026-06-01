'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Coins, Search, Loader2, AlertOctagon, CheckCircle2, ExternalLink, Shield } from 'lucide-react'

interface Finding { severity: 'critical' | 'warning' | 'info' | 'pass'; check: string; detail: string }
interface TokenAnalysis {
  address: string
  chain: string
  explorer?: string
  detectedStandard: string
  name?: string
  symbol?: string
  decimals?: number
  totalSupply?: string
  isPaused?: boolean
  hasTransferRestrictions: boolean
  complianceScore: number
  findings: Finding[]
  regulatoryFlags: string[]
  recommendation: string
}

const EXAMPLES = [
  { label: 'USDC',   addr: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', chain: 'ethereum' },
  { label: 'USDT',   addr: '0xdac17f958d2ee523a2206206994597c13d831ec7', chain: 'ethereum' },
  { label: 'PYUSD',  addr: '0x6c3ea9036406852006290770bedfcaba0e23a0e8', chain: 'ethereum' },
  { label: 'wstETH', addr: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', chain: 'ethereum' },
]

const severityColor: Record<Finding['severity'], string> = {
  critical: '#ff3366', warning: '#ffaa00', info: '#4a9eff', pass: '#00ff88',
}
const severityIcon: Record<Finding['severity'], string> = {
  critical: '!!', warning: '!', info: 'i', pass: '',
}

export default function TokenScreenPage() {
  const [address, setAddress] = useState('')
  const [chain, setChain] = useState('ethereum')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TokenAnalysis | null>(null)

  const screen = useCallback(async () => {
    const a = address.trim().toLowerCase()
    if (!/^0x[a-f0-9]{40}$/.test(a)) { setError('Invalid address — must be 0x followed by 40 hex chars'); return }
    setBusy(true); setError(null); setResult(null)
    try {
      const r = await fetch(`/api/real/token-screen?address=${a}&chain=${chain}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error ?? 'Failed'); return }
      setResult(d)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }, [address, chain])

  const scoreColor = result ? (result.complianceScore >= 80 ? '#00ff88' : result.complianceScore >= 60 ? '#ffaa00' : '#ff3366') : '#00ff88'

  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 flex items-center justify-between"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Coins className="w-4 h-4 text-[#ffaa00]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ffaa00]">RWA TOKEN COMPLIANCE</span>
        </div>
        <span className="hidden md:block text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">
          ERC-20 · ERC-3643 (T-REX) · ERC-1400
        </span>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.3)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffaa00]"
              style={{ animation: 'pulse 1.2s ease-in-out infinite', boxShadow: '0 0 8px #ffaa00' }} />
            <span className="text-[10px] font-black tracking-[0.25em] uppercase text-[#ffaa00]">LUXEMBOURG = #1 RWA HUB</span>
          </div>
          <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', lineHeight: 1 }}>
            <span className="text-white">Compliance for</span>
            <br />
            <span style={{ background: 'linear-gradient(90deg, #ffaa00 0%, #ff6b3d 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              tokenized assets.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            Paste any token contract. Genesis Swarm reads it on-chain, detects the standard
            (ERC-20 / ERC-3643 / T-REX), checks pause state + identity registry + compliance module,
            scores it against AIFMD II transferability and OFAC enforcement.
            <span className="text-white"> No competitor has this.</span>
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl p-6 mb-6"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,170,0,0.2)' }}>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input value={address} onChange={e => setAddress(e.target.value)}
              placeholder="0x6c3ea9036406852006290770bedfcaba0e23a0e8"
              className="flex-1 bg-[rgba(0,0,0,0.4)] rounded px-3 py-2.5 text-[12px] font-mono text-white placeholder:text-[rgba(255,255,255,0.3)] focus:outline-none"
              style={{ border: '1px solid rgba(255,170,0,0.3)' }} />
            <select value={chain} onChange={e => setChain(e.target.value)}
              className="bg-[rgba(0,0,0,0.4)] rounded px-3 py-2.5 text-[12px] text-white focus:outline-none"
              style={{ border: '1px solid rgba(255,170,0,0.3)' }}>
              <option value="ethereum">Ethereum</option>
              <option value="polygon">Polygon</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="base">Base</option>
            </select>
            <button onClick={screen} disabled={busy || !address.trim()}
              className="px-5 py-2.5 rounded text-[11px] uppercase tracking-wider font-black disabled:opacity-50 flex items-center gap-1.5"
              style={{
                background: 'linear-gradient(135deg, #ffaa00 0%, #ff6b3d 100%)',
                color: '#000',
                boxShadow: '0 0 16px rgba(255,170,0,0.4)',
              }}>
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              Screen
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[9px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mr-1 py-0.5">Try:</span>
            {EXAMPLES.map(ex => (
              <button key={ex.label} onClick={() => { setAddress(ex.addr); setChain(ex.chain) }}
                className="text-[9px] px-2 py-0.5 rounded uppercase tracking-wider"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,170,0,0.25)', color: 'rgba(255,170,0,0.85)' }}>
                {ex.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded text-[11px]"
              style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366' }}>
              <AlertOctagon className="w-3.5 h-3.5" /> {error}
            </div>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className="space-y-4">
            {/* Identity header */}
            <div className="rounded-2xl p-6"
              style={{ background: 'linear-gradient(135deg, rgba(255,170,0,0.04) 0%, rgba(255,107,61,0.03) 100%)', border: '1px solid rgba(255,170,0,0.3)' }}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-2xl font-black text-white">{result.name ?? 'Unknown token'}</h2>
                    {result.symbol && <span className="text-[14px] font-mono text-[rgba(255,255,255,0.5)]">${result.symbol}</span>}
                  </div>
                  <div className="font-mono text-[11px] text-[rgba(255,170,0,0.85)] truncate">{result.address}</div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.5)]">
                    <span>{result.chain}</span>
                    <span className="text-[#ffaa00] font-bold">{result.detectedStandard}</span>
                    {result.isPaused === true && <span className="text-[#ff3366] font-bold">⏸ PAUSED</span>}
                    {result.explorer && (
                      <a href={result.explorer} target="_blank" rel="noopener noreferrer"
                        className="text-[#4a9eff] hover:underline flex items-center gap-1">
                        explorer <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-black tabular-nums leading-none"
                    style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', color: scoreColor, textShadow: `0 0 24px ${scoreColor}88` }}>
                    {result.complianceScore}
                  </div>
                  <div className="text-[9px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mt-1">/ 100 compliance</div>
                </div>
              </div>
              {result.regulatoryFlags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.regulatoryFlags.map((f, i) => (
                    <span key={i} className="text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider"
                      style={{ background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.35)', color: '#ffaa00' }}>
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Findings */}
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.55)] font-black mb-3">FINDINGS</div>
              <div className="space-y-2">
                {result.findings.map((f, i) => (
                  <div key={i} className="rounded-lg p-3 flex items-start gap-3"
                    style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${severityColor[f.severity]}30` }}>
                    <span className="font-black text-[11px] w-6 h-6 rounded flex items-center justify-center shrink-0"
                      style={{ background: `${severityColor[f.severity]}15`, color: severityColor[f.severity], border: `1px solid ${severityColor[f.severity]}55` }}>
                      {severityIcon[f.severity]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[12px] font-bold text-white">{f.check}</span>
                        <span className="text-[8px] uppercase tracking-widest font-black px-1.5 rounded" style={{ color: severityColor[f.severity], border: `1px solid ${severityColor[f.severity]}55` }}>{f.severity}</span>
                      </div>
                      <div className="text-[11px] text-[rgba(255,255,255,0.6)] leading-relaxed">{f.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendation */}
            <div className="rounded-2xl p-5"
              style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.3)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-[#00ff88]" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-black text-[#00ff88]">RECOMMENDATION</span>
              </div>
              <p className="text-[14px] text-white leading-relaxed">{result.recommendation}</p>
            </div>
          </div>
        )}

        {/* Trust pillars */}
        {!result && !busy && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-8">
            {[
              { t: 'ERC-3643 native', d: 'T-REX standard for regulated security tokens. Detects identity registry + compliance module + pause mechanism.' },
              { t: 'On-chain probe', d: 'Direct RPC calls (no Etherscan key). Ethereum / Polygon / Arbitrum / Base supported.' },
              { t: 'AIFMD II aware', d: 'Scores against Article 24 transferability + on-chain OFAC enforcement readiness.' },
            ].map(s => (
              <div key={s.t} className="rounded-lg p-4"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <CheckCircle2 className="w-4 h-4 text-[#ffaa00] mb-2" />
                <div className="text-[13px] font-black text-white mb-1">{s.t}</div>
                <div className="text-[11px] text-[rgba(255,255,255,0.5)] leading-relaxed">{s.d}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
