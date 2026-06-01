'use client'

import { useEffect, useState } from 'react'
import { Loader2, Lock, CheckCircle2, Copy, Eye, AlertCircle, Download } from 'lucide-react'

interface SealedTip {
  hash: string
  entity: string
  timestamp: string
  status: 'sealed' | 'revealed'
  revealed_at: string | null
  tip?: string
  salt?: string
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function randomSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

type Mode = 'seal' | 'reveal' | 'ledger'

export default function WhistleblowerInterface() {
  const [mode, setMode] = useState<Mode>('seal')
  const [ledger, setLedger] = useState<SealedTip[]>([])
  const [loadingLedger, setLoadingLedger] = useState(false)

  useEffect(() => {
    if (mode !== 'ledger') return
    setLoadingLedger(true)
    fetch('/api/whistleblower/list').then(r => r.json()).then(j => setLedger(j.records ?? [])).finally(() => setLoadingLedger(false))
  }, [mode])

  return (
    <div>
      {/* Mode tabs */}
      <div className="flex gap-2 mb-4">
        {(['seal', 'reveal', 'ledger'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className="text-[10px] uppercase tracking-wider font-bold px-4 py-2 rounded transition-all"
            style={{
              background: mode === m ? 'rgba(255,51,136,0.15)' : 'rgba(0,0,0,0.3)',
              border: `1px solid ${mode === m ? 'rgba(255,51,136,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: mode === m ? '#ff3388' : 'rgba(255,255,255,0.5)',
            }}>
            {m === 'seal' ? 'Seal a tip' : m === 'reveal' ? 'Reveal a tip' : 'Public ledger'}
          </button>
        ))}
      </div>

      {mode === 'seal' && <SealForm />}
      {mode === 'reveal' && <RevealForm />}
      {mode === 'ledger' && <LedgerView records={ledger} loading={loadingLedger} />}
    </div>
  )
}

function SealForm() {
  const [entity, setEntity] = useState('')
  const [tip, setTip] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ hash: string; salt: string; timestamp: string; entity: string; tip: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function seal() {
    if (!entity.trim() || !tip.trim()) { setError('Both entity and tip are required.'); return }
    if (tip.length < 20) { setError('Tip must be at least 20 characters to seal meaningfully.'); return }
    setLoading(true); setError(null); setResult(null)
    try {
      const salt = randomSalt()
      const timestamp = new Date().toISOString()
      const hash = await sha256Hex(`${entity.trim()}|${tip.trim()}|${timestamp}|${salt}`)
      const res = await fetch('/api/whistleblower/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, entity: entity.trim(), timestamp }),
      })
      const json = await res.json()
      if (!res.ok) { setError(`${json.error}${json.detail ? ' · ' + json.detail : ''}`); return }
      setResult({ hash, salt, timestamp, entity: entity.trim(), tip: tip.trim() })
    } catch (e) {
      setError(`Crypto error: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  function copyField(field: string, value: string) {
    navigator.clipboard.writeText(value)
    setCopied(field)
    setTimeout(() => setCopied(null), 1500)
  }

  function downloadReceipt() {
    if (!result) return
    const receipt = {
      hash: result.hash,
      entity: result.entity,
      timestamp: result.timestamp,
      tip: result.tip,
      salt: result.salt,
      reveal_instructions: 'To reveal, POST to /api/whistleblower/reveal with: hash, entity, tip, salt, timestamp.',
      warning: 'KEEP THIS FILE SECURE. Without the salt + tip + timestamp you cannot reveal.',
    }
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `genesis-tip-${result.hash.slice(0, 12)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (result) {
    return (
      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,136,0.3)', backdropFilter: 'blur(10px)' }}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-[#00ff88]" />
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] font-black text-[#00ff88]">Tip sealed</div>
            <div className="text-[10px] text-[rgba(255,255,255,0.55)]">Your tip is committed publicly. Save the salt + tip text — you&apos;ll need both to reveal.</div>
          </div>
        </div>

        <ReceiptRow label="Hash (public)"   value={result.hash}      copied={copied === 'hash'}      onCopy={() => copyField('hash', result.hash)} />
        <ReceiptRow label="Entity"          value={result.entity}    copied={copied === 'entity'}    onCopy={() => copyField('entity', result.entity)} />
        <ReceiptRow label="Timestamp"       value={result.timestamp} copied={copied === 'timestamp'} onCopy={() => copyField('timestamp', result.timestamp)} />
        <ReceiptRow label="Salt (KEEP)"     value={result.salt}      copied={copied === 'salt'}      onCopy={() => copyField('salt', result.salt)}      sensitive />
        <ReceiptRow label="Tip text (KEEP)" value={result.tip}       copied={copied === 'tip'}       onCopy={() => copyField('tip', result.tip)}        sensitive multiline />

        <div className="flex gap-2 pt-2">
          <button onClick={downloadReceipt}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-3 py-2 rounded"
            style={{ background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.5)', color: '#00ff88' }}>
            <Download className="w-3 h-3" /> Download receipt
          </button>
          <button onClick={() => setResult(null)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-3 py-2 rounded"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}>
            Seal another
          </button>
        </div>

        <div className="rounded p-3 text-[10px] text-[rgba(255,255,255,0.55)] leading-relaxed"
          style={{ background: 'rgba(255,170,0,0.04)', border: '1px solid rgba(255,170,0,0.2)' }}>
          <strong className="text-[#ffaa00] uppercase tracking-wider">Important:</strong>{' '}
          Without the salt and tip text we cannot help you reveal later. The whole point of this design is that we
          mathematically cannot read your tip — that also means we cannot recover it for you.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,51,136,0.25)', backdropFilter: 'blur(10px)' }}>
      <div>
        <label className="block text-[10px] uppercase tracking-wider font-bold text-[#ff3388] mb-2">Entity</label>
        <input type="text" value={entity} onChange={e => setEntity(e.target.value)}
          placeholder="e.g. Deutsche Bank AG, or Acme Capital Partners S.A."
          className="w-full bg-black/40 outline-none text-white text-[14px] px-3 py-2.5 rounded font-mono border border-[rgba(255,51,136,0.2)] focus:border-[rgba(255,51,136,0.6)]" />
        <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1.5">Use the full legal name. This is recorded in the public ledger.</div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider font-bold text-[#ff3388] mb-2">Tip (sealed locally · never sent to our servers)</label>
        <textarea value={tip} onChange={e => setTip(e.target.value)}
          rows={6}
          placeholder="Describe what you observed. Internal control failure, fictitious counterparty, NAV manipulation, undisclosed related-party transactions, etc. Be specific — vague tips can't be vindicated."
          className="w-full bg-black/40 outline-none text-white text-[13px] px-3 py-2.5 rounded font-mono border border-[rgba(255,51,136,0.2)] focus:border-[rgba(255,51,136,0.6)] leading-relaxed resize-y" />
        <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1.5">{tip.length} chars · min 20</div>
      </div>

      {error && (
        <div className="rounded p-2.5 flex items-start gap-2 text-[11px]"
          style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366' }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <button onClick={seal} disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
        style={{ background: 'rgba(255,51,136,0.15)', border: '1px solid rgba(255,51,136,0.6)', color: '#ff3388', boxShadow: '0 0 20px rgba(255,51,136,0.15)' }}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sealing locally…</> : <><Lock className="w-4 h-4" /> Seal commitment</>}
      </button>
    </div>
  )
}

function RevealForm() {
  const [hash, setHash] = useState('')
  const [entity, setEntity] = useState('')
  const [tip, setTip] = useState('')
  const [salt, setSalt] = useState('')
  const [timestamp, setTimestamp] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SealedTip | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reveal() {
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/whistleblower/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, entity, tip, salt, timestamp }),
      })
      const json = await res.json()
      if (!res.ok) { setError(`${json.error}${json.detail ? ' · ' + json.detail : ''}`); return }
      setResult(json.record)
    } catch (e) {
      setError(`Network error: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  function importReceipt(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result))
        setHash(json.hash ?? '')
        setEntity(json.entity ?? '')
        setTimestamp(json.timestamp ?? '')
        setTip(json.tip ?? '')
        setSalt(json.salt ?? '')
      } catch {
        setError('Could not parse receipt JSON.')
      }
    }
    reader.readAsText(file)
  }

  if (result) {
    return (
      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,136,0.3)', backdropFilter: 'blur(10px)' }}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-[#00ff88]" />
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] font-black text-[#00ff88]">Tip revealed publicly</div>
            <div className="text-[10px] text-[rgba(255,255,255,0.55)]">Hash equation verified · contents now visible in the public ledger.</div>
          </div>
        </div>
        <div className="rounded p-3" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.2)' }}>
          <div className="text-[10px] uppercase tracking-wider text-[#00ff88] mb-1 font-bold">{result.entity}</div>
          <div className="text-[13px] text-white leading-relaxed whitespace-pre-wrap">{result.tip}</div>
          <div className="text-[9px] text-[rgba(255,255,255,0.4)] mt-2">
            Sealed {new Date(result.timestamp).toLocaleString()} · Revealed {result.revealed_at && new Date(result.revealed_at).toLocaleString()}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,51,136,0.25)', backdropFilter: 'blur(10px)' }}>
      <div>
        <label className="block text-[10px] uppercase tracking-wider font-bold text-[#ff3388] mb-2">Import receipt JSON (fastest)</label>
        <input type="file" accept="application/json" onChange={importReceipt}
          className="block w-full text-[11px] text-[rgba(255,255,255,0.6)] file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-[10px] file:uppercase file:tracking-wider file:font-bold file:bg-[rgba(255,51,136,0.15)] file:text-[#ff3388]" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Hash (sealed)" value={hash} onChange={setHash} mono />
        <Field label="Entity"        value={entity} onChange={setEntity} />
        <Field label="Timestamp"     value={timestamp} onChange={setTimestamp} mono />
        <Field label="Salt"          value={salt} onChange={setSalt} mono />
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-wider font-bold text-[#ff3388] mb-2">Tip text</label>
        <textarea value={tip} onChange={e => setTip(e.target.value)} rows={4}
          className="w-full bg-black/40 outline-none text-white text-[13px] px-3 py-2.5 rounded font-mono border border-[rgba(255,51,136,0.2)] focus:border-[rgba(255,51,136,0.6)]" />
      </div>

      {error && (
        <div className="rounded p-2.5 flex items-start gap-2 text-[11px]"
          style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366' }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <button onClick={reveal} disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
        style={{ background: 'rgba(255,51,136,0.15)', border: '1px solid rgba(255,51,136,0.6)', color: '#ff3388' }}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying hash…</> : <><Eye className="w-4 h-4" /> Reveal publicly</>}
      </button>
    </div>
  )
}

function LedgerView({ records, loading }: { records: SealedTip[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-2xl p-12 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,51,136,0.2)' }}>
        <Loader2 className="w-6 h-6 text-[#ff3388] animate-spin" />
      </div>
    )
  }
  if (records.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,51,136,0.2)' }}>
        <div className="text-[13px] text-[rgba(255,255,255,0.6)] mb-1">No sealed tips yet.</div>
        <div className="text-[11px] text-[rgba(255,255,255,0.4)]">Be the first to commit. The ledger appears here as tips arrive.</div>
      </div>
    )
  }
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,51,136,0.2)', backdropFilter: 'blur(10px)' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,51,136,0.15)', background: 'rgba(0,0,0,0.3)' }}>
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-black tracking-[0.18em] uppercase text-[#ff3388]">Public Ledger</div>
          <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.45)]">
            {records.length} total · {records.filter(r => r.status === 'sealed').length} sealed · {records.filter(r => r.status === 'revealed').length} revealed
          </div>
        </div>
      </div>
      <div className="max-h-[480px] overflow-y-auto">
        {records.map(r => (
          <div key={r.hash} className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${
                r.status === 'revealed' ? 'bg-[rgba(0,255,136,0.12)] text-[#00ff88]' : 'bg-[rgba(255,51,136,0.12)] text-[#ff3388]'
              }`}>
                {r.status}
              </span>
              <span className="text-[12px] font-bold text-white">{r.entity}</span>
              <span className="ml-auto text-[9px] text-[rgba(255,255,255,0.4)]">{new Date(r.timestamp).toLocaleString()}</span>
            </div>
            <div className="font-mono text-[9px] text-[rgba(255,255,255,0.4)] truncate">{r.hash}</div>
            {r.tip && (
              <div className="mt-2 text-[12px] text-[rgba(255,255,255,0.8)] whitespace-pre-wrap leading-relaxed">{r.tip}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ReceiptRow({ label, value, copied, onCopy, sensitive, multiline }: { label: string; value: string; copied: boolean; onCopy: () => void; sensitive?: boolean; multiline?: boolean }) {
  return (
    <div className="rounded p-2.5" style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${sensitive ? 'rgba(255,170,0,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[9px] uppercase tracking-wider font-bold ${sensitive ? 'text-[#ffaa00]' : 'text-[rgba(255,255,255,0.55)]'}`}>{label}</span>
        <button onClick={onCopy} className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.5)] hover:text-white flex items-center gap-1">
          {copied ? <><CheckCircle2 className="w-3 h-3" /> copied</> : <><Copy className="w-3 h-3" /> copy</>}
        </button>
      </div>
      <div className={`font-mono text-[11px] text-white ${multiline ? 'whitespace-pre-wrap' : 'break-all'}`}>{value}</div>
    </div>
  )
}

function Field({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider font-bold text-[#ff3388] mb-1.5">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        className={`w-full bg-black/40 outline-none text-white text-[12px] px-3 py-2 rounded border border-[rgba(255,51,136,0.2)] focus:border-[rgba(255,51,136,0.6)] ${mono ? 'font-mono' : ''}`} />
    </div>
  )
}
