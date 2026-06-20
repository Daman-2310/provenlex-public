'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Vault, ShieldCheck, ShieldAlert, Download, Trash2, FileCheck2,
  Lock, RefreshCw, Fingerprint,
} from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import {
  loadRecords, buildManifest, verifyVault, clearVault,
  type VaultRecord, type VaultManifest, type VaultMode,
} from '@/lib/vault'

const ACCENT = '#10D982'

export default function VaultPage() {
  const [records, setRecords] = useState<VaultRecord[]>([])
  const [manifest, setManifest] = useState<VaultManifest | null>(null)
  const [integrity, setIntegrity] = useState<{ intact: boolean; brokenId: string | null } | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [sig, setSig] = useState<{ signature: string; publicKeyPem: string } | null>(null)
  const [signing, setSigning] = useState(false)
  const [mode, setMode] = useState<VaultMode>('local')

  const refresh = useCallback(async () => {
    const { records: recs, mode: m } = await loadRecords()
    setRecords(recs)
    setMode(m)
    setManifest(await buildManifest(recs))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const runVerify = async () => {
    setVerifying(true)
    const v = await verifyVault(records)
    setIntegrity({ intact: v.intact, brokenId: v.brokenId })
    setVerifying(false)
  }

  const exportManifest = async () => {
    const m = await buildManifest()
    const blob = new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `genesis-evidence-vault-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const signRoot = async () => {
    if (!manifest) return
    setSigning(true)
    try {
      const r = await fetch('/api/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: manifest.merkleRoot }) })
      const d = await r.json()
      if (d.signature) setSig({ signature: d.signature, publicKeyPem: d.publicKeyPem })
    } catch { /* offline */ } finally { setSigning(false) }
  }

  const wipe = () => { if (confirm('Clear all evidence records from this browser?')) { clearVault(); refresh(); setIntegrity(null); setSig(null) } }

  const verdictColor = (v: VaultRecord['verdict']) => v === 'compliant' ? '#10D982' : v === 'warning' ? '#F5A524' : '#F2566E'

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent={ACCENT} />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Vault className="w-4 h-4" style={{ color: ACCENT }} />
          <span className="text-sm font-bold tracking-[0.18em]" style={{ color: ACCENT }}>EVIDENCE VAULT</span>
          {mode === 'server' ? (
            <span className="text-[8px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded" style={{ color: '#10D982', background: 'rgba(16,217,130,0.1)', border: '1px solid rgba(16,217,130,0.4)' }}>
              ● persistent · your account
            </span>
          ) : (
            <Link href="/login" className="text-[8px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded hover:brightness-125" style={{ color: '#F5A524', background: 'rgba(245,165,36,0.1)', border: '1px solid rgba(245,165,36,0.4)' }}>
              ● local demo · sign in to persist →
            </Link>
          )}
          <Link href="/scan" className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] hover:text-white">+ run a scan →</Link>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'clamp(1.9rem, 5vw, 3.4rem)', lineHeight: 0.98 }}>
            <span className="text-white">Your audit insurance.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-sm max-w-2xl leading-relaxed">
            Every compliance check you run is sealed into an append-only ledger and rolled up into a single
            SHA-256 <span className="text-white">Merkle root</span>. When a regulator asks &ldquo;what did you screen, and when?&rdquo;,
            you export this — cryptographic proof of exactly what was checked, when, and that the record hasn&apos;t been altered since.
          </p>
        </div>

        {/* Root + actions */}
        <div className="rounded-2xl p-5 mb-6" style={{ background: 'rgba(16,217,130,0.04)', border: `1px solid ${ACCENT}30` }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="w-3.5 h-3.5" style={{ color: ACCENT }} />
                <span className="text-[10px] uppercase tracking-[0.2em] font-black" style={{ color: ACCENT }}>Vault Merkle root · {records.length} record{records.length === 1 ? '' : 's'}</span>
              </div>
              <div className="text-[11px] font-mono break-all text-[rgba(255,255,255,0.75)]">{manifest?.merkleRoot ?? '…'}</div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={runVerify} disabled={verifying || records.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[10px] uppercase tracking-[0.15em] font-bold transition-all disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}>
                <RefreshCw className={`w-3 h-3 ${verifying ? 'animate-spin' : ''}`} /> verify integrity
              </button>
              <button onClick={signRoot} disabled={signing || records.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[10px] uppercase tracking-[0.15em] font-bold transition-all disabled:opacity-40"
                style={{ background: 'rgba(91,141,239,0.12)', border: '1px solid rgba(91,141,239,0.45)', color: '#5B8DEF' }}>
                <Fingerprint className={`w-3 h-3 ${signing ? 'animate-pulse' : ''}`} /> sign root (Ed25519)
              </button>
              <button onClick={exportManifest} disabled={records.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[10px] uppercase tracking-[0.15em] font-black transition-all disabled:opacity-40"
                style={{ background: ACCENT, color: '#04130b' }}>
                <Download className="w-3 h-3" /> export manifest
              </button>
            </div>
          </div>
          {integrity && (
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: integrity.intact ? '#10D982' : '#F2566E' }}>
              {integrity.intact ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
              {integrity.intact ? 'Integrity verified — every record hash recomputes to the stored Merkle root.' : `Tampering detected at record ${integrity.brokenId}.`}
            </div>
          )}
          {sig && (
            <div className="mt-3 rounded-lg p-3" style={{ background: 'rgba(91,141,239,0.06)', border: '1px solid rgba(91,141,239,0.3)' }}>
              <div className="flex items-center gap-1.5 mb-1.5" style={{ color: '#5B8DEF' }}>
                <Fingerprint className="w-3.5 h-3.5" />
                <span className="text-[9px] uppercase tracking-[0.2em] font-black">Ed25519 signature over the root — real signature, not just a hash</span>
              </div>
              <div className="text-[10px] font-mono break-all text-[rgba(255,255,255,0.7)]">{sig.signature}</div>
              <details className="mt-1.5">
                <summary className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] cursor-pointer hover:text-white">public key (verify with standard Ed25519)</summary>
                <pre className="text-[8px] font-mono text-[rgba(255,255,255,0.5)] mt-1 whitespace-pre-wrap break-all">{sig.publicKeyPem.trim()}</pre>
              </details>
            </div>
          )}
          <div className="text-[9px] text-[rgba(255,255,255,0.4)] mt-2">
            This root is a SHA-256 Merkle rollup of every record — change any record and the root changes — and it can be signed with Ed25519 for tamper-evident, independently verifiable proof.
          </div>
        </div>

        {/* Records */}
        {records.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.12)' }}>
            <FileCheck2 className="w-8 h-8 mx-auto mb-3 text-[rgba(255,255,255,0.25)]" />
            <div className="text-[13px] text-[rgba(255,255,255,0.6)] mb-1">No records yet.</div>
            <div className="text-[11px] text-[rgba(255,255,255,0.4)]">Run a <Link href="/scan" className="underline hover:text-white" style={{ color: ACCENT }}>compliance scan</Link> and save it — it will appear here as sealed evidence.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map(r => (
              <div key={r.id} className="rounded-xl p-3.5 flex items-start gap-3" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="w-1.5 h-10 rounded-full shrink-0" style={{ background: verdictColor(r.verdict), boxShadow: `0 0 8px ${verdictColor(r.verdict)}` }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-bold text-white truncate">{r.subject}</span>
                    <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: verdictColor(r.verdict), background: `${verdictColor(r.verdict)}14`, border: `1px solid ${verdictColor(r.verdict)}44` }}>{r.verdict}</span>
                    <span className="text-[8px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">{r.kind}</span>
                  </div>
                  <div className="text-[11px] text-[rgba(255,255,255,0.55)] mt-0.5">{r.summary}</div>
                  <div className="text-[9px] font-mono text-[rgba(255,255,255,0.35)] mt-1">
                    {new Date(r.recordedAt).toLocaleString()} · leaf {r.leafHash.slice(0, 16)}…
                  </div>
                </div>
              </div>
            ))}
            <button onClick={wipe} className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-[rgba(242,86,110,0.55)] hover:text-[#F2566E] mt-3">
              <Trash2 className="w-3 h-3" /> clear vault (this browser)
            </button>
          </div>
        )}

        <section className="rounded-2xl p-6 mt-10" style={{ background: `${ACCENT}08`, border: `1px solid ${ACCENT}30` }}>
          <div className="text-[11px] uppercase tracking-[0.2em] font-black mb-3" style={{ color: ACCENT }}>Why this is the product</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed">
            A compliance officer&apos;s real fear isn&apos;t missing a breach — it&apos;s being unable to prove to CSSF that they did their job.
            This is the answer: an independent, cryptographically-sealed (SHA-256) record of every check, computed in your browser and exportable on demand.
            That reframes ProvenLex from &ldquo;AI that detects&rdquo; to <span className="text-white">audit insurance</span> — a line funds already budget for.
          </p>
        </section>
      </div>
    </div>
  )
}
