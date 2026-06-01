import Link from 'next/link'
import { ArrowLeft, Sparkles, Lock, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react'
import { headers } from 'next/headers'

interface FullProphecy {
  id: string
  subject: string
  lei?: string
  sealed_at: string
  reveal_at: string
  pre_crime_index: number
  genesis_score: number
  trajectory: string
  pattern_match?: string
  forecast: string
  signals: { name: string; severity: number; note: string }[]
  merkle_root: string
  signature: string
  status: string
}

interface Verification {
  merkle_verified: boolean
  recomputed_root: string
  stored_root: string
}

async function fetchProphecy(id: string): Promise<{ prophecy: FullProphecy; verification: Verification } | null> {
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  try {
    const r = await fetch(`${proto}://${host}/api/prophecy/reveal?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json()) as { prophecy: FullProphecy; verification: Verification }
  } catch { return null }
}

export default async function ProphecyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await fetchProphecy(id)

  if (!data) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center"
        style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
        <div className="text-center">
          <Lock className="w-12 h-12 text-[#9b6dff] mx-auto mb-4 opacity-50" />
          <div className="text-[16px] font-black mb-2">Prophecy not found</div>
          <div className="text-[11px] text-[rgba(255,255,255,0.5)] mb-6">
            ID <span className="font-mono text-[#9b6dff]">{id}</span> doesn't match any sealed record (or it expired).
          </div>
          <Link href="/prophecy" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider font-black"
            style={{ background: 'rgba(155,109,255,0.1)', color: '#9b6dff', border: '1px solid rgba(155,109,255,0.4)' }}>
            ← Back to Prophecy Engine
          </Link>
        </div>
      </div>
    )
  }

  const { prophecy: p, verification: v } = data
  const indexColor = (idx: number) => idx >= 70 ? '#ff3366' : idx >= 40 ? '#ffaa00' : '#00ff88'
  const tColor = p.trajectory === 'RISING' ? '#ff3366' : p.trajectory === 'FALLING' ? '#00ff88' : '#ffaa00'
  const c = indexColor(p.pre_crime_index)

  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/prophecy" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Prophecy Engine
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Sparkles className="w-4 h-4" style={{ color: '#9b6dff' }} />
          <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">SEALED RECORD</span>
          <span className="ml-auto text-[9px] font-mono text-[rgba(255,255,255,0.4)]">{p.id}</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">

        <div className="text-center mb-10">
          <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.5)] mb-2">Subject</div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2">{p.subject}</h1>
          {p.lei && <div className="text-[11px] font-mono text-[rgba(255,255,255,0.45)] mb-2">LEI {p.lei}</div>}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mt-2"
            style={{ background: `${c}10`, border: `1px solid ${c}50` }}>
            <Lock className="w-3 h-3" style={{ color: c }} />
            <span className="text-[10px] uppercase tracking-[0.15em] font-black" style={{ color: c }}>{p.status} · {p.trajectory}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          <Stat label="Pre-Crime Index" value={p.pre_crime_index} color={c} suffix="/100" big />
          <Stat label="Genesis Score" value={p.genesis_score} color={indexColor(100 - p.genesis_score)} suffix="/100" />
          <Stat label="Trajectory" value={p.trajectory} color={tColor} text />
        </div>

        <div className="rounded-2xl p-6 mb-8"
          style={{ background: `${c}06`, border: `1px solid ${c}30` }}>
          <div className="text-[9px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-2 font-bold">Forecast</div>
          <div className="text-[15px] leading-relaxed">{p.forecast}</div>
        </div>

        {p.pattern_match && (
          <div className="rounded-lg p-4 mb-8"
            style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <div className="text-[9px] text-[#ff3366] uppercase tracking-[0.18em] font-bold mb-1">Historical pattern match</div>
            <div className="text-2xl font-black text-[#ff3366] uppercase tracking-wider">{p.pattern_match}</div>
          </div>
        )}

        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.4)] font-black mb-3">Signal contributions</div>
          <div className="space-y-2">
            {p.signals.map(s => (
              <div key={s.name} className="rounded p-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[12px] font-bold w-44 truncate">{s.name}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, s.severity)}%`,
                      background: `linear-gradient(90deg, ${indexColor(s.severity)}aa, ${indexColor(s.severity)})`,
                      boxShadow: `0 0 4px ${indexColor(s.severity)}`,
                    }} />
                  </div>
                  <span className="w-10 text-right font-black tabular-nums" style={{ color: indexColor(s.severity) }}>{s.severity}</span>
                </div>
                <div className="text-[10px] text-[rgba(255,255,255,0.55)] pl-0">{s.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Verification panel */}
        <div className="rounded-2xl p-6"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(155,109,255,0.3)' }}>
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-4 h-4 text-[#9b6dff]" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black">Cryptographic verification</span>
            {v.merkle_verified ? (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase font-black px-2 py-1 rounded-full"
                style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.4)' }}>
                <CheckCircle2 className="w-3 h-3" /> VERIFIED
              </span>
            ) : (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase font-black px-2 py-1 rounded-full"
                style={{ background: 'rgba(255,51,102,0.1)', color: '#ff3366', border: '1px solid rgba(255,51,102,0.4)' }}>
                <XCircle className="w-3 h-3" /> MISMATCH
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px] font-mono">
            <KV k="Sealed at (UTC)" v={new Date(p.sealed_at).toUTCString()} />
            <KV k="Reveal window" v={new Date(p.reveal_at).toUTCString()} />
            <KV k="Merkle root (stored)" v={'0x' + p.merkle_root} mono />
            <KV k="Merkle root (recomputed)" v={'0x' + v.recomputed_root} mono />
            <KV k="Signature" v={'0x' + p.signature} mono />
            <KV k="ID" v={p.id} mono />
          </div>
          <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)]">
            <div className="text-[10px] text-[rgba(255,255,255,0.55)] leading-relaxed">
              <strong className="text-[#9b6dff]">How verification works:</strong> the Merkle root is computed at seal time
              from the prediction's full payload (subject, scores, signals, timestamps). On reveal, we recompute the root
              from the same fields — a match proves the prediction's content has not been altered since the sealed_at timestamp.
              Verifiers can replay this independently using the public SHA-256 algorithm.
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

function Stat({ label, value, color, suffix, big, text }: { label: string; value: string | number; color: string; suffix?: string; big?: boolean; text?: boolean }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: `${color}06`, border: `1px solid ${color}30` }}>
      <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-1 font-bold">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={big ? 'text-4xl font-black tabular-nums' : text ? 'text-lg font-black uppercase tracking-wider' : 'text-2xl font-black tabular-nums'}
          style={{ color, textShadow: big ? `0 0 20px ${color}80` : undefined }}>
          {value}
        </span>
        {suffix && <span className="text-[9px] text-[rgba(255,255,255,0.4)] uppercase">{suffix}</span>}
      </div>
    </div>
  )
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-[rgba(255,255,255,0.4)] uppercase tracking-wider shrink-0 w-28">{k}</span>
      <span className={`truncate ${mono ? 'text-[#9b6dff]' : 'text-[rgba(255,255,255,0.85)]'}`}>{v}</span>
    </div>
  )
}
