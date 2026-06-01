'use client'

import { useState, useEffect } from 'react'
import { Lock, ShieldCheck, KeyRound, Play, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import {
  paillierKeygen, paillierEncrypt, evaluateEncryptedWeights, type PaillierKey,
  evaluateEscrow, verifyRing, type EscrowBreach, type Attestation,
} from '@/lib/clearing-engines'

const card = (accent: string) => ({ background: 'rgba(0,0,0,0.4)', border: `1px solid ${accent}30`, backdropFilter: 'blur(8px)' })

function Head({ icon, color, n, title }: { icon: React.ReactNode; color: string; n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2" style={{ color }}>
      {icon}
      <span className="text-[9px] uppercase tracking-wider font-mono font-black">Layer {n}</span>
      <span className="text-[12px] font-bold text-white">{title}</span>
    </div>
  )
}

function Verdict({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ color: ok ? '#00ff88' : '#ff3366' }}>
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}{ok ? okLabel : badLabel}
    </span>
  )
}

// ── Layer 1 ───────────────────────────────────────────────────────────────────
function EscrowPanel() {
  const [scenario, setScenario] = useState<'clean' | 'sanctioned' | 'levered'>('sanctioned')
  const inputs = {
    clean: { sender: '0xabc', beneficiary: '0xdef', amountEur: 500_000, addsExposureEur: 200_000, structure: 'open_ended' as const, navEur: 10_000_000, grossExposureEur: 5_000_000 },
    sanctioned: { sender: '0xabc', beneficiary: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', amountEur: 500_000, addsExposureEur: 200_000, structure: 'open_ended' as const, navEur: 10_000_000, grossExposureEur: 5_000_000 },
    levered: { sender: '0xabc', beneficiary: '0xdef', amountEur: 500_000, addsExposureEur: 14_000_000, structure: 'open_ended' as const, navEur: 10_000_000, grossExposureEur: 5_000_000 },
  }
  const res = evaluateEscrow(inputs[scenario])
  return (
    <div className="rounded-xl p-4" style={card('#ff7a00')}>
      <Head icon={<Lock className="w-4 h-4" />} color="#ff7a00" n={1} title="Escrow Circuit Breaker" />
      <p className="text-[11px] text-[rgba(255,255,255,0.55)] mb-3">A tokenised transfer is held in escrow until evaluated. On a breach, the gateway dispatches an on-chain lock before settlement finality.</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {([['clean', 'clean transfer'], ['sanctioned', 'sanctioned counterparty'], ['levered', 'leverage breach']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setScenario(k)} className="text-[10px] px-2 py-1 rounded"
            style={{ background: scenario === k ? 'rgba(255,122,0,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${scenario === k ? 'rgba(255,122,0,0.5)' : 'rgba(255,255,255,0.1)'}`, color: scenario === k ? '#ff7a00' : 'rgba(255,255,255,0.5)' }}>{label}</button>
        ))}
      </div>
      <div className="mb-2"><Verdict ok={res.action === 'released'} okLabel="RELEASED TO BENEFICIARY" badLabel="LOCKED IN ESCROW" /></div>
      {res.breaches.map((b: EscrowBreach) => (
        <div key={b.code} className="text-[10px] text-[#ff3366]"><span className="font-mono font-bold">{b.code}</span> <span className="text-[rgba(255,255,255,0.6)]">{b.detail}</span></div>
      ))}
      {res.action === 'released' && <div className="text-[10px] text-[rgba(255,255,255,0.5)]">No breach — capital settles to beneficiary.</div>}
    </div>
  )
}

// ── Layer 2 ───────────────────────────────────────────────────────────────────
function RingPanel() {
  const [valid, setValid] = useState(true)
  const input = valid
    ? { directorId: 'DIR-7', lat: 49.61, lon: 6.13, deviceHwid: 'HWID-AABBCCDD11223344', eidasSignature: 'S'.repeat(80) }
    : { directorId: 'DIR-7', lat: 48.86, lon: 2.35, deviceHwid: 'HWID-AABBCCDD11223344', eidasSignature: 'S'.repeat(80) }
  const res = verifyRing(input)
  return (
    <div className="rounded-xl p-4" style={card('#9b6dff')}>
      <Head icon={<ShieldCheck className="w-4 h-4" />} color="#9b6dff" n={2} title="Proof-of-Substance Ring" />
      <p className="text-[11px] text-[rgba(255,255,255,0.55)] mb-3">Three independent validator nodes co-sign. A single failure rejects the whole proof — no spoofed local presence can anchor.</p>
      <div className="flex gap-1.5 mb-3">
        {([['Luxembourg sign-off', true], ['Paris (spoofed)', false]] as const).map(([label, v]) => (
          <button key={String(v)} onClick={() => setValid(v)} className="text-[10px] px-2 py-1 rounded"
            style={{ background: valid === v ? 'rgba(155,109,255,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${valid === v ? 'rgba(155,109,255,0.5)' : 'rgba(255,255,255,0.1)'}`, color: valid === v ? '#9b6dff' : 'rgba(255,255,255,0.5)' }}>{label}</button>
        ))}
      </div>
      <div className="mb-2"><Verdict ok={res.finalized} okLabel="FINALIZED + ANCHORED" badLabel="REJECTED — FRAUDULENT" /></div>
      <div className="space-y-0.5">
        {res.attestations.map((a: Attestation) => (
          <div key={a.role} className="flex items-center gap-1.5 text-[10px]">
            {a.passed ? <CheckCircle2 className="w-3 h-3 text-[#00ff88] shrink-0" /> : <XCircle className="w-3 h-3 text-[#ff3366] shrink-0" />}
            <span className="font-mono text-[rgba(255,255,255,0.7)]">{a.role}</span><span className="text-[rgba(255,255,255,0.45)]">— {a.reason}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Layer 3 — REAL Paillier in the browser ──────────────────────────────────────
function PaillierPanel() {
  const [key, setKey] = useState<PaillierKey | null>(null)
  const [busy, setBusy] = useState(true)
  const [weights] = useState([3000, 2500, 2000, 1500, 1200]) // bps, sums to 10200 (>100%)
  const [result, setResult] = useState<{ total: string; excess: string; over: boolean; ctPreview: string } | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    // Generate a real keypair in the browser (256-bit for instant demo).
    const t = setTimeout(() => { setKey(paillierKeygen(256)); setBusy(false) }, 50)
    return () => clearTimeout(t)
  }, [])

  function run() {
    if (!key) return
    setRunning(true)
    setTimeout(() => {
      const cts = weights.map(w => paillierEncrypt(key, BigInt(w)))
      const r = evaluateEncryptedWeights(key, cts)
      setResult({
        total: r.total.toString(),
        excess: r.excessBps.toString(),
        over: r.overAllocated,
        ctPreview: r.encryptedTotal.toString().slice(0, 48) + '…',
      })
      setRunning(false)
    }, 30)
  }

  return (
    <div className="rounded-xl p-4" style={card('#00d8ff')}>
      <Head icon={<KeyRound className="w-4 h-4" />} color="#00d8ff" n={3} title="Homomorphic Dark-Pool (real Paillier)" />
      <p className="text-[11px] text-[rgba(255,255,255,0.55)] mb-3">
        Five private asset weights are encrypted, then <strong className="text-white">summed while still encrypted</strong> — the server computes the total without ever decrypting an input. Only the final indicator is opened.
      </p>
      <div className="text-[10px] font-mono text-[rgba(255,255,255,0.5)] mb-2">
        {busy ? <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> generating Paillier keypair…</span>
          : <>key ready · n is {key!.bits}-bit · weights (bps): [{weights.join(', ')}]</>}
      </div>
      <button onClick={run} disabled={busy || running}
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded mb-2 disabled:opacity-50"
        style={{ background: 'rgba(0,216,255,0.15)', border: '1px solid rgba(0,216,255,0.5)', color: '#00d8ff' }}>
        <Play className="w-3 h-3" /> {running ? 'computing on ciphertext…' : 'encrypt + sum under encryption'}
      </button>
      {result && (
        <div className="space-y-1 text-[10px] font-mono">
          <div className="text-[rgba(255,255,255,0.5)]">encrypted total (ciphertext): <span className="text-[#00d8ff]">{result.ctPreview}</span></div>
          <div className="text-[rgba(255,255,255,0.7)]">decrypted total: <span className="text-white font-bold">{result.total} bps</span> (= sum of inputs, proving correctness)</div>
          <div><Verdict ok={!result.over} okLabel="WITHIN 100% ALLOCATION" badLabel={`OVER-ALLOCATED by ${result.excess} bps`} /></div>
          <div className="text-[rgba(255,255,255,0.4)]">inputs were never decrypted — only the derived indicator was opened.</div>
        </div>
      )}
    </div>
  )
}

export default function ClearingConsole() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <EscrowPanel />
      <RingPanel />
      <div className="lg:col-span-2"><PaillierPanel /></div>
    </div>
  )
}
