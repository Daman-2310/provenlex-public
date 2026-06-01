'use client'
import { useState, useRef } from 'react'
import { BASE } from '@/lib/api'
import { Shield, Printer, Zap, CheckCircle, Copy, ExternalLink } from 'lucide-react'

const CERT_TYPES = ['Full Compliance Assessment','DORA ICT Readiness','AIFMD II Self-Assessment','SFDR Disclosure Verification','Fund Health Certification']
const FUND_TYPES = ['AIFM','UCITS ManCo','RAIF','SIF','Family Office']

interface Certificate {
  certificate_id: string; fund_name: string; fund_type: string; cert_type: string
  issued_at: string; valid_until: string; issuer: string
  sha3_hash: string; hmac_signature: string; merkle_root: string
  compliance_score: number; frameworks: string[]; verification_url: string
  seal: string
}

export default function CertificatePage() {
  const [form, setForm] = useState({ fund_name: '', fund_type: 'AIFM', cert_type: 'Full Compliance Assessment', aum_eur_m: '' })
  const [cert, setCert] = useState<Certificate | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const certRef = useRef<HTMLDivElement>(null)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = !!(form.fund_name && form.aum_eur_m)

  async function generate() {
    if (!valid) return
    setLoading(true); setError(''); setCert(null)
    try {
      const res = await fetch(`${BASE}/api/v1/certificate/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, aum_eur_m: parseFloat(form.aum_eur_m) })
      })
      if (!res.ok) throw new Error()
      setCert(await res.json())
    } catch { setError('Generation failed — please try again.') }
    finally { setLoading(false) }
  }

  function copyHash() {
    if (cert) { navigator.clipboard.writeText(cert.sha3_hash); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  const inputCls = 'w-full bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.2)] rounded px-3 py-2.5 text-[#00ff88] text-sm font-mono placeholder-[rgba(0,255,136,0.25)] focus:outline-none focus:border-[rgba(0,255,136,0.6)] transition-all'
  const labelCls = 'block text-[9px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] mb-1.5'

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono overflow-x-hidden">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]" style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <a href="/operator" className="font-bold tracking-[0.2em] text-sm uppercase hover:opacity-80 transition-opacity">Genesis Swarm</a>
          <span className="text-[rgba(0,255,136,0.4)] text-[10px] tracking-widest hidden sm:block">// Proof of Compliance Certificate</span>
        </div>
        <div className="flex items-center gap-2">
          {cert && <button onClick={() => window.print()} className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(255,255,255,0.2)] text-[rgba(255,255,255,0.6)] rounded hover:bg-[rgba(255,255,255,0.06)] transition-colors"><Printer className="w-3 h-3" /> Print</button>}
          <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">← Dashboard</a>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {!cert && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="text-[9px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.5)]">SHA3-512 · NIST FIPS 202 · Cryptographically Signed</div>
              <h1 className="text-3xl font-bold tracking-tight">Proof of Compliance Certificate</h1>
              <p className="text-[rgba(255,255,255,0.4)] text-sm leading-relaxed max-w-2xl">Generate a cryptographically verifiable compliance certificate for your fund. SHA3-512 signed, timestamped, Merkle-anchored. Shareable with CSSF or investors. Verifiable by anyone with the certificate ID.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
              {[{ icon: Shield, label: 'SHA3-512', sub: 'Post-quantum' }, { icon: CheckCircle, label: 'Timestamped', sub: 'ISO 8601 UTC' }, { icon: Shield, label: 'Merkle root', sub: 'Chain-anchored' }, { icon: ExternalLink, label: 'Verifiable', sub: 'Public key' }].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="p-3 rounded text-center" style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.12)' }}>
                  <Icon className="w-4 h-4 text-[#00ff88] mx-auto mb-1" />
                  <div className="text-[9px] font-bold text-[#00ff88]">{label}</div>
                  <div className="text-[8px] text-[rgba(255,255,255,0.3)]">{sub}</div>
                </div>
              ))}
            </div>
            <div className="p-6 rounded space-y-4" style={{ background: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.15)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className={labelCls}>Fund name *</label><input className={inputCls} placeholder="Luxembourg Capital Management S.A." value={form.fund_name} onChange={set('fund_name')} /></div>
                <div><label className={labelCls}>Fund type</label><select className={inputCls + ' cursor-pointer'} value={form.fund_type} onChange={set('fund_type')}>{FUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className={labelCls}>AUM (€M) *</label><input className={inputCls} type="number" placeholder="500" value={form.aum_eur_m} onChange={set('aum_eur_m')} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Certificate type</label><select className={inputCls + ' cursor-pointer'} value={form.cert_type} onChange={set('cert_type')}>{CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              </div>
              {error && <div className="text-[9px] text-[#ff3366] p-3 rounded" style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)' }}>{error}</div>}
              <button onClick={generate} disabled={!valid || loading} className="w-full flex items-center justify-center gap-2 py-3.5 rounded font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50"
                style={{ background: valid ? 'rgba(0,255,136,0.12)' : 'rgba(0,255,136,0.04)', border: `1px solid ${valid ? 'rgba(0,255,136,0.6)' : 'rgba(0,255,136,0.2)'}`, color: '#00ff88', boxShadow: valid ? '0 0 20px rgba(0,255,136,0.15)' : 'none' }}>
                {loading ? <><Shield className="w-4 h-4 animate-pulse" /> Generating certificate…</> : <><Shield className="w-4 h-4" /> Generate certificate</>}
              </button>
            </div>
          </div>
        )}

        {cert && (
          <div className="space-y-6" ref={certRef}>
            {/* The certificate */}
            <div className="relative p-8 rounded-lg overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(0,255,136,0.06) 0%, rgba(0,0,0,0.6) 50%, rgba(0,170,255,0.06) 100%)', border: '2px solid rgba(0,255,136,0.4)', boxShadow: '0 0 60px rgba(0,255,136,0.1), inset 0 0 60px rgba(0,0,0,0.4)' }}>
              {/* Corner ornaments */}
              <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-[rgba(0,255,136,0.4)]" />
              <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-[rgba(0,255,136,0.4)]" />
              <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-[rgba(0,255,136,0.4)]" />
              <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-[rgba(0,255,136,0.4)]" />

              <div className="text-center space-y-4">
                <div>
                  <div className="text-[8px] uppercase tracking-[0.4em] text-[rgba(0,255,136,0.5)] mb-2">Genesis Swarm · Luxembourg RegTech Platform</div>
                  <div className="text-[8px] uppercase tracking-[0.3em] text-[rgba(0,255,136,0.4)]">Certificate of Compliance</div>
                </div>

                <div className="py-4 border-y border-[rgba(0,255,136,0.15)]">
                  <div className="text-[rgba(255,255,255,0.4)] text-xs mb-2">This certifies that</div>
                  <div className="text-3xl font-black text-[#00ff88] tracking-tight" style={{ textShadow: '0 0 30px rgba(0,255,136,0.5)' }}>{cert.fund_name}</div>
                  <div className="text-[rgba(255,255,255,0.5)] text-sm mt-1">{cert.fund_type}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-[rgba(255,255,255,0.4)] text-xs">has successfully completed</div>
                  <div className="text-[#ffaa00] font-bold text-lg tracking-wide">{cert.cert_type}</div>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    {cert.frameworks.map(f => (
                      <span key={f} className="text-[7px] uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.25)', color: '#00ff88' }}>{f}</span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 py-4 border-y border-[rgba(0,255,136,0.1)]">
                  <div><div className="text-2xl font-black text-[#00ff88]">{cert.compliance_score}</div><div className="text-[7px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">Score /100</div></div>
                  <div><div className="text-xs font-bold text-[rgba(255,255,255,0.7)]">{new Date(cert.issued_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div><div className="text-[7px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">Issued</div></div>
                  <div><div className="text-xs font-bold text-[rgba(255,255,255,0.7)]">{new Date(cert.valid_until).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div><div className="text-[7px] uppercase tracking-wider text-[rgba(255,255,255,0.3)]">Valid until</div></div>
                </div>

                <div className="space-y-2 text-left">
                  <div className="text-[8px] uppercase tracking-widest text-[rgba(0,255,136,0.4)] text-center mb-3">Cryptographic Proof</div>
                  {[
                    { label: 'Certificate ID', value: cert.certificate_id },
                    { label: 'SHA3-512 Hash', value: cert.sha3_hash.substring(0,48) + '…' },
                    { label: 'HMAC Signature', value: cert.hmac_signature.substring(0,48) + '…' },
                    { label: 'Merkle Root', value: cert.merkle_root.substring(0,48) + '…' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center gap-3 p-2 rounded" style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.08)' }}>
                      <span className="text-[7px] uppercase tracking-wider text-[rgba(0,255,136,0.4)] w-28 shrink-0">{label}</span>
                      <span className="text-[8px] font-mono text-[rgba(255,255,255,0.5)] truncate">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-2 pt-2">
                  <div className="w-20 h-20 rounded border-2 border-[rgba(0,255,136,0.3)] flex items-center justify-center" style={{ background: 'rgba(0,255,136,0.05)' }}>
                    <div className="text-center space-y-0.5">
                      <div className="text-[5px] font-mono text-[rgba(0,255,136,0.6)] leading-tight">genesis-swarm</div>
                      <div className="text-[5px] font-mono text-[rgba(0,255,136,0.5)] leading-tight">{cert.certificate_id.substring(0,10)}</div>
                      <Shield className="w-5 h-5 text-[#00ff88] mx-auto" />
                      <div className="text-[5px] font-mono text-[rgba(0,255,136,0.4)] leading-tight">VERIFY AT</div>
                      <div className="text-[4px] font-mono text-[rgba(0,255,136,0.5)] leading-tight">genesis-swarm-rgq5</div>
                    </div>
                  </div>
                  <div className="text-left space-y-1">
                    <div className="text-[7px] text-[rgba(255,255,255,0.3)] uppercase tracking-wider">Issued by</div>
                    <div className="text-[9px] font-bold text-[#00ff88]">Genesis Swarm AI</div>
                    <div className="text-[7px] text-[rgba(255,255,255,0.3)]">SHA3-512 · NIST FIPS 202</div>
                    <div className="text-[7px] text-[rgba(255,255,255,0.3)]">Post-Quantum Cryptography</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 print:hidden">
              <button onClick={copyHash} className="flex items-center gap-2 px-4 py-2.5 rounded text-sm font-bold uppercase tracking-wider transition-all" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>
                {copied ? <><CheckCircle className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy hash</>}
              </button>
              <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 rounded text-sm font-bold uppercase tracking-wider transition-all" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}><Printer className="w-4 h-4" /> Save as PDF</button>
              <button onClick={() => setCert(null)} className="flex items-center gap-2 px-4 py-2.5 rounded text-sm font-bold uppercase tracking-wider transition-all" style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)', color: 'rgba(0,255,136,0.6)' }}>← New certificate</button>
            </div>
          </div>
        )}
      </div>
      <style>{`@media print { @page { size: A4; margin: 1cm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .print\\:hidden { display: none !important; } }`}</style>
    </div>
  )
}
