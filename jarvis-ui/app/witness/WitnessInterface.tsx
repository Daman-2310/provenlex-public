'use client'

import { useEffect, useState } from 'react'
import { Loader2, Stamp, CheckCircle2, AlertCircle, Search } from 'lucide-react'

interface Prophecy {
  prophecy_id: string
  entity: string
  jurisdiction: string
  category: string
  pre_crime_index: number
  trajectory: 'RISING' | 'FALLING' | 'HOLDING'
  pattern_match: string | null
}

interface WitnessRecord {
  attestation_id: string
  prophecy_id: string
  prophecy_entity: string
  signer_name: string
  fund_name: string
  role: string
  jurisdiction: string
  acknowledgement: string
  signed_at: string
}

type Mode = 'sign' | 'ledger'

const ROLES = [
  'Board Member',
  'Independent Director',
  'Chair',
  'Vice-Chair',
  'Risk Committee Chair',
  'Audit Committee Chair',
  'Compliance Committee Chair',
  'Senior Management Function (SMF)',
  'Conducting Officer (LU)',
  'Other',
]

const DEFAULT_ACK = 'I confirm that, in my capacity as named, I have reviewed the Genesis Swarm operational-risk indicators relating to this counterparty as of the timestamp below, and have considered them as part of our ongoing third-party risk monitoring.'

export default function WitnessInterface({ prophecies }: { prophecies: Prophecy[] }) {
  const [mode, setMode] = useState<Mode>('sign')

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(['sign', 'ledger'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className="text-[10px] uppercase tracking-wider font-bold px-4 py-2 rounded transition-all"
            style={{
              background: mode === m ? 'rgba(255,216,107,0.15)' : 'rgba(0,0,0,0.3)',
              border: `1px solid ${mode === m ? 'rgba(255,216,107,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: mode === m ? '#ffd86b' : 'rgba(255,255,255,0.5)',
            }}>
            {m === 'sign' ? 'Sign attestation' : 'Public ledger'}
          </button>
        ))}
      </div>

      {mode === 'sign' && <SignForm prophecies={prophecies} />}
      {mode === 'ledger' && <LedgerView />}
    </div>
  )
}

function SignForm({ prophecies }: { prophecies: Prophecy[] }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Prophecy | null>(null)
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [fundName, setFundName] = useState('')
  const [role, setRole] = useState(ROLES[0])
  const [jurisdiction, setJurisdiction] = useState('LU')
  const [ack, setAck] = useState(DEFAULT_ACK)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WitnessRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  const matches = query.trim()
    ? prophecies.filter(p =>
        p.entity.toLowerCase().includes(query.toLowerCase()) ||
        p.jurisdiction.toLowerCase() === query.toLowerCase()
      ).slice(0, 6)
    : []

  async function sign() {
    if (!selected) { setError('Select a prophecy first.'); return }
    if (!signerName || !fundName || !ack) { setError('Name, fund, and acknowledgement are required.'); return }
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/witness/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prophecy_id: selected.prophecy_id,
          signer_name: signerName,
          signer_email: signerEmail,
          fund_name: fundName,
          role,
          jurisdiction,
          acknowledgement: ack,
        }),
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

  if (result) {
    return (
      <div className="rounded-2xl p-5 space-y-4"
        style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,255,136,0.3)', backdropFilter: 'blur(10px)' }}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-[#00ff88]" />
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] font-black text-[#00ff88]">Attestation sealed</div>
            <div className="text-[10px] text-[rgba(255,255,255,0.55)]">Public timestamped record now in the ledger. Verifiable forever.</div>
          </div>
        </div>
        <div className="rounded p-3" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.2)' }}>
          <div className="text-[10px] uppercase tracking-wider text-[#ffd86b] font-bold mb-1">Attestation ID</div>
          <div className="font-mono text-[10px] text-white break-all">{result.attestation_id}</div>
        </div>
        <div className="rounded p-3" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-[10px] uppercase tracking-wider text-[#ffd86b] font-bold mb-1">{result.prophecy_entity}</div>
          <div className="text-[12px] text-white"><strong>{result.signer_name}</strong> · {result.role} · {result.fund_name}</div>
          <div className="text-[11px] text-[rgba(255,255,255,0.7)] mt-2 leading-relaxed">{result.acknowledgement}</div>
          <div className="text-[9px] text-[rgba(255,255,255,0.4)] mt-2">Signed {new Date(result.signed_at).toLocaleString()}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,216,107,0.25)', backdropFilter: 'blur(10px)' }}>

      {/* Prophecy picker */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider font-bold text-[#ffd86b] mb-2">1. Prophecy you&apos;re witnessing</label>
        {selected ? (
          <div className="rounded p-3 flex items-center justify-between gap-3" style={{ background: 'rgba(255,216,107,0.06)', border: '1px solid rgba(255,216,107,0.3)' }}>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-white truncate">{selected.entity}</div>
              <div className="text-[10px] text-[rgba(255,255,255,0.5)] mt-0.5 flex items-center gap-2">
                <span>{selected.jurisdiction}</span>
                <span>·</span>
                <span>PCI {selected.pre_crime_index}</span>
                <span>·</span>
                <span>{selected.trajectory}</span>
              </div>
            </div>
            <button onClick={() => setSelected(null)}
              className="text-[10px] uppercase tracking-wider px-2 py-1 rounded font-bold"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}>
              change
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#ffd86b]" />
              <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search the Book by entity name…"
                className="w-full bg-black/40 outline-none text-white text-[13px] pl-10 pr-3 py-2.5 rounded font-mono border border-[rgba(255,216,107,0.2)] focus:border-[rgba(255,216,107,0.6)]" />
            </div>
            {matches.length > 0 && (
              <div className="mt-2 rounded overflow-hidden max-h-48 overflow-y-auto"
                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,216,107,0.15)' }}>
                {matches.map(p => (
                  <button key={p.prophecy_id} onClick={() => { setSelected(p); setQuery('') }}
                    className="w-full text-left px-3 py-2 transition-all hover:bg-[rgba(255,216,107,0.06)]"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[12px] font-bold text-white truncate">{p.entity}</div>
                    <div className="text-[10px] text-[rgba(255,255,255,0.5)] mt-0.5">
                      {p.jurisdiction} · PCI {p.pre_crime_index} · {p.trajectory}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Personal details */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider font-bold text-[#ffd86b] mb-2">2. Your identity (publicly recorded)</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name *"     value={signerName}  onChange={setSignerName} />
          <Field label="Email (optional, hashed)" value={signerEmail} onChange={setSignerEmail} type="email" placeholder="kept private — only hash is stored" />
          <Field label="Fund / firm *"   value={fundName}    onChange={setFundName} />
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold text-[#ffd86b] mb-1.5">Role *</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full bg-black/40 outline-none text-white text-[12px] px-3 py-2 rounded border border-[rgba(255,216,107,0.2)] focus:border-[rgba(255,216,107,0.6)]">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <Field label="Jurisdiction *" value={jurisdiction} onChange={v => setJurisdiction(v.toUpperCase())} mono placeholder="LU" />
        </div>
      </div>

      {/* Acknowledgement */}
      <div>
        <label className="block text-[10px] uppercase tracking-wider font-bold text-[#ffd86b] mb-2">3. Acknowledgement (your statement)</label>
        <textarea value={ack} onChange={e => setAck(e.target.value)} rows={4}
          className="w-full bg-black/40 outline-none text-white text-[13px] px-3 py-2.5 rounded border border-[rgba(255,216,107,0.2)] focus:border-[rgba(255,216,107,0.6)] leading-relaxed" />
        <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1.5">{ack.length} chars · min 30</div>
      </div>

      {error && (
        <div className="rounded p-2.5 flex items-start gap-2 text-[11px]"
          style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366' }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <button onClick={sign} disabled={loading || !selected}
        className="w-full flex items-center justify-center gap-2 py-3 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
        style={{ background: 'rgba(255,216,107,0.15)', border: '1px solid rgba(255,216,107,0.6)', color: '#ffd86b', boxShadow: '0 0 20px rgba(255,216,107,0.15)' }}>
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sealing attestation…</> : <><Stamp className="w-4 h-4" /> Sign as witness</>}
      </button>
    </div>
  )
}

function LedgerView() {
  const [records, setRecords] = useState<WitnessRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/witness/list').then(r => r.json()).then(j => setRecords(j.records ?? [])).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-2xl p-12 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,216,107,0.2)' }}>
        <Loader2 className="w-6 h-6 text-[#ffd86b] animate-spin" />
      </div>
    )
  }
  if (records.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,216,107,0.2)' }}>
        <div className="text-[13px] text-[rgba(255,255,255,0.6)] mb-1">No attestations yet.</div>
        <div className="text-[11px] text-[rgba(255,255,255,0.4)]">Be the first board member to sign. Public ledger appears here as signatures arrive.</div>
      </div>
    )
  }
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,216,107,0.2)', backdropFilter: 'blur(10px)' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,216,107,0.15)', background: 'rgba(0,0,0,0.3)' }}>
        <div className="text-[10px] font-black tracking-[0.18em] uppercase text-[#ffd86b]">Witness Ledger · {records.length} attestation{records.length === 1 ? '' : 's'}</div>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {records.map(r => (
          <div key={r.attestation_id} className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-baseline gap-2 mb-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-[rgba(255,216,107,0.12)] text-[#ffd86b]">
                {r.role}
              </span>
              <span className="text-[13px] font-bold text-white">{r.signer_name}</span>
              <span className="text-[10px] text-[rgba(255,255,255,0.55)]">{r.fund_name} · {r.jurisdiction}</span>
              <span className="ml-auto text-[9px] text-[rgba(255,255,255,0.4)]">{new Date(r.signed_at).toLocaleString()}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[#ffd86b] font-bold mt-1">witnessing → {r.prophecy_entity}</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.75)] mt-1.5 leading-relaxed whitespace-pre-wrap">{r.acknowledgement}</div>
            <div className="font-mono text-[9px] text-[rgba(255,255,255,0.3)] mt-2 truncate">attestation {r.attestation_id}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type, mono, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; mono?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider font-bold text-[#ffd86b] mb-1.5">{label}</label>
      <input type={type ?? 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full bg-black/40 outline-none text-white text-[12px] px-3 py-2 rounded border border-[rgba(255,216,107,0.2)] focus:border-[rgba(255,216,107,0.6)] ${mono ? 'font-mono' : ''}`} />
    </div>
  )
}
