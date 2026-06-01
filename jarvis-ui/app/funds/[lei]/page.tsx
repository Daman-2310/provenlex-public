import Link from 'next/link'
import { ArrowLeft, Globe2, Building, ShieldCheck, AlertOctagon, FileText, Hash, MapPin, Calendar, ExternalLink } from 'lucide-react'
import { headers } from 'next/headers'
import type { Metadata } from 'next'

interface GleifRecord {
  lei: string
  legalName?: string
  jurisdiction?: string
  status?: string
  legalForm?: string
  category?: string
  headquarters?: { country?: string; city?: string; region?: string; addressLines?: string[]; postalCode?: string }
  legalAddress?: { country?: string; city?: string; region?: string }
  registration?: { initialRegistrationDate?: string; lastUpdateDate?: string; nextRenewalDate?: string; status?: string; managingLou?: string }
  registeredAt?: string
}

interface FundScore {
  score?: number
  grade?: string
  verdict?: string
  regulatory_flags?: string[]
  strengths?: string[]
  risk_factors?: string[]
  gaps?: Array<{ requirement: string; status: string; note: string }>
}

async function baseUrl(): Promise<string> {
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
}

async function fetchGleif(lei: string): Promise<GleifRecord | null> {
  try {
    const b = await baseUrl()
    const r = await fetch(`${b}/api/real/gleif?lei=${encodeURIComponent(lei)}`, { next: { revalidate: 86400 } })
    if (!r.ok) return null
    return (await r.json()) as GleifRecord
  } catch { return null }
}

async function fetchScore(name: string): Promise<FundScore | null> {
  try {
    const b = await baseUrl()
    const r = await fetch(`${b}/api/fund-score?fund_name=${encodeURIComponent(name)}`, { next: { revalidate: 3600 } })
    if (!r.ok) return null
    return (await r.json()) as FundScore
  } catch { return null }
}

export async function generateMetadata({ params }: { params: Promise<{ lei: string }> }): Promise<Metadata> {
  const { lei } = await params
  const upper = lei.toUpperCase()
  const g = await fetchGleif(upper).catch(() => null)
  const name = g?.legalName ?? upper
  return {
    title: `${name} · Genesis Swarm`,
    description: `Public operational-risk dossier for ${name} (LEI ${upper}) — AI-scored compliance posture, GLEIF-anchored identity, regulatory framework coverage.`,
    openGraph: {
      title: `${name} — Genesis Operational-Risk Dossier`,
      description: `LEI ${upper} · ${g?.jurisdiction ?? 'global'} · AI compliance score and forensic analysis`,
      type: 'article',
    },
  }
}

export default async function FundPage({ params }: { params: Promise<{ lei: string }> }) {
  const { lei: rawLei } = await params
  const lei = rawLei.toUpperCase()

  if (!/^[A-Z0-9]{20}$/.test(lei)) {
    return <NotFound lei={rawLei} />
  }

  const gleif = await fetchGleif(lei)
  if (!gleif?.legalName) return <NotFound lei={lei} />

  const score = await fetchScore(gleif.legalName)
  const scoreColor = (score?.score ?? 0) >= 80 ? '#00ff88' : (score?.score ?? 0) >= 60 ? '#ffaa00' : '#ff3366'
  const gradeColor: Record<string, string> = { A: '#00ff88', B: '#4a9eff', C: '#ffaa00', D: '#ff3366' }

  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/funds" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> All funds
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Globe2 className="w-4 h-4 text-[#4a9eff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#4a9eff]">GENESIS DOSSIER</span>
          <span className="ml-auto text-[9px] font-mono text-[rgba(255,255,255,0.4)]">{lei}</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* IDENTITY */}
        <div className="rounded-2xl p-6 mb-6"
          style={{ background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.25)' }}>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(74,158,255,0.1)', border: '1px solid rgba(74,158,255,0.4)' }}>
              <Building className="w-7 h-7 text-[#4a9eff]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.4)] mb-1 font-bold">Legal entity</div>
              <h1 className="text-3xl md:text-4xl font-black mb-2 leading-tight">{gleif.legalName}</h1>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                {gleif.jurisdiction && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                    style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88' }}>
                    <MapPin className="w-3 h-3" /> {gleif.jurisdiction}
                  </span>
                )}
                {gleif.legalForm && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                    style={{ background: 'rgba(74,158,255,0.06)', border: '1px solid rgba(74,158,255,0.3)', color: '#4a9eff' }}>
                    <FileText className="w-3 h-3" /> {gleif.legalForm}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                  <Hash className="w-3 h-3" /> {gleif.status ?? '—'}
                </span>
                {gleif.category && (
                  <span className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.5)]">{gleif.category}</span>
                )}
              </div>
              <div className="text-[10px] font-mono text-[rgba(255,255,255,0.4)] mt-2">LEI {lei}</div>
            </div>
          </div>
        </div>

        {/* SCORE CARD */}
        {score?.score !== undefined ? (
          <div className="rounded-2xl p-6 mb-6"
            style={{
              background: `linear-gradient(135deg, ${scoreColor}08 0%, rgba(0,0,0,0) 100%)`,
              border: `1px solid ${scoreColor}30`,
              boxShadow: `0 0 32px ${scoreColor}10`,
            }}>
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6">
              <div className="text-center shrink-0">
                <div className="text-[8px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] mb-2 font-bold">Genesis Score</div>
                <div className="font-black tabular-nums leading-none"
                  style={{ fontSize: 'clamp(3.5rem, 8vw, 5.5rem)', color: scoreColor, textShadow: `0 0 30px ${scoreColor}80` }}>
                  {score.score}
                </div>
                <div className="text-[10px] uppercase font-mono text-[rgba(255,255,255,0.4)]">/ 100</div>
                {score.grade && (
                  <div className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full"
                    style={{ background: `${gradeColor[score.grade] ?? '#888'}15`, border: `1px solid ${gradeColor[score.grade] ?? '#888'}50` }}>
                    <span className="text-[16px] font-black" style={{ color: gradeColor[score.grade] ?? '#888' }}>{score.grade}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.4)] mb-2 font-bold">AI verdict</div>
                <p className="text-[15px] leading-relaxed text-[rgba(255,255,255,0.9)] mb-4">{score.verdict}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(score.strengths ?? []).length > 0 && (
                    <div className="rounded p-3"
                      style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)' }}>
                      <div className="text-[9px] text-[#00ff88] uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Strengths
                      </div>
                      <ul className="space-y-1">
                        {score.strengths!.map((s, i) => (
                          <li key={i} className="text-[11px] text-[rgba(255,255,255,0.75)] leading-relaxed">
                            <span className="text-[#00ff88] mr-1">+</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(score.risk_factors ?? []).length > 0 && (
                    <div className="rounded p-3"
                      style={{ background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.2)' }}>
                      <div className="text-[9px] text-[#ff3366] uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1">
                        <AlertOctagon className="w-3 h-3" /> Risk factors
                      </div>
                      <ul className="space-y-1">
                        {score.risk_factors!.map((r, i) => (
                          <li key={i} className="text-[11px] text-[rgba(255,255,255,0.75)] leading-relaxed">
                            <span className="text-[#ff3366] mr-1">!</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl p-6 mb-6 text-center"
            style={{ background: 'rgba(255,170,0,0.04)', border: '1px solid rgba(255,170,0,0.2)' }}>
            <div className="text-[12px] text-[#ffaa00] uppercase tracking-wider font-bold">Score unavailable — AI engine offline or rate-limited</div>
          </div>
        )}

        {/* COMPLIANCE GAPS */}
        {score?.gaps && score.gaps.length > 0 && (
          <div className="rounded-2xl p-6 mb-6"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[rgba(255,255,255,0.4)] font-black mb-4">Regulatory framework coverage</div>
            <div className="space-y-2">
              {score.gaps.map((g, i) => {
                const c = g.status === 'met' ? '#00ff88' : g.status === 'partial' ? '#ffaa00' : '#ff3366'
                return (
                  <div key={i} className="rounded p-3"
                    style={{ background: `${c}05`, border: `1px solid ${c}25` }}>
                    <div className="flex items-start gap-3">
                      <span className="text-[8px] uppercase tracking-wider font-black px-2 py-0.5 rounded shrink-0 mt-0.5"
                        style={{ background: `${c}15`, color: c, border: `1px solid ${c}40` }}>
                        {g.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold text-white">{g.requirement}</div>
                        <div className="text-[11px] text-[rgba(255,255,255,0.6)] mt-0.5">{g.note}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ADDRESS + REGISTRATION */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {gleif.headquarters && (
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.4)] mb-3 font-bold flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Headquarters
              </div>
              <div className="text-[12px] leading-relaxed text-[rgba(255,255,255,0.85)]">
                {gleif.headquarters.addressLines?.map((l, i) => <div key={i}>{l}</div>)}
                <div className="mt-1">{[gleif.headquarters.city, gleif.headquarters.region, gleif.headquarters.postalCode].filter(Boolean).join(', ')}</div>
                <div className="font-bold mt-1">{gleif.headquarters.country}</div>
              </div>
            </div>
          )}
          {gleif.registration && (
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.4)] mb-3 font-bold flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> Registration timeline
              </div>
              <div className="space-y-1 text-[11px]">
                <KV k="First registered" v={gleif.registration.initialRegistrationDate?.slice(0, 10) ?? '—'} />
                <KV k="Last updated" v={gleif.registration.lastUpdateDate?.slice(0, 10) ?? '—'} />
                <KV k="Next renewal" v={gleif.registration.nextRenewalDate?.slice(0, 10) ?? '—'} />
                <KV k="Status" v={gleif.registration.status ?? '—'} />
                <KV k="Managing LOU" v={gleif.registration.managingLou ?? '—'} />
              </div>
            </div>
          )}
        </div>

        {/* ACTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
          <Link href={`/prophecy?subject=${encodeURIComponent(gleif.legalName)}&lei=${lei}`}
            className="rounded-lg p-4 transition-all hover:scale-[1.02]"
            style={{ background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#9b6dff] font-bold mb-1">Seal a prophecy →</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.7)]">Forecast collapse probability cryptographically</div>
          </Link>
          <Link href={`/court?subject=${encodeURIComponent(gleif.legalName)}`}
            className="rounded-lg p-4 transition-all hover:scale-[1.02]"
            style={{ background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.3)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#4a9eff] font-bold mb-1">Convene the Court →</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.7)]">3 AI judges deliberate on this entity</div>
          </Link>
          <Link href={`/eye?subject=${encodeURIComponent(gleif.legalName)}`}
            className="rounded-lg p-4 transition-all hover:scale-[1.02]"
            style={{ background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[#ff3366] font-bold mb-1">Open The Eye →</div>
            <div className="text-[12px] text-[rgba(255,255,255,0.7)]">Live surveillance scan with permanent log</div>
          </Link>
        </div>

        {/* SOURCES */}
        <div className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)] flex items-center gap-3">
          <span>Sources:</span>
          <a href={`https://search.gleif.org/#/record/${lei}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-[#4a9eff]">
            GLEIF.org <ExternalLink className="w-2.5 h-2.5" />
          </a>
          <span>·</span>
          <span>Genesis Compliance Engine (Groq llama-3.3-70b)</span>
        </div>

      </div>
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-[rgba(255,255,255,0.4)] uppercase tracking-wider w-28 shrink-0">{k}</span>
      <span className="text-[rgba(255,255,255,0.85)] truncate">{v}</span>
    </div>
  )
}

function NotFound({ lei }: { lei: string }) {
  return (
    <div className="min-h-screen text-white flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <div className="text-center">
        <Globe2 className="w-12 h-12 text-[#4a9eff] mx-auto mb-4 opacity-50" />
        <div className="text-[16px] font-black mb-2">No record found</div>
        <div className="text-[11px] text-[rgba(255,255,255,0.5)] mb-6">
          LEI <span className="font-mono text-[#4a9eff]">{lei}</span> not in GLEIF registry
        </div>
        <Link href="/funds" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider font-black"
          style={{ background: 'rgba(74,158,255,0.1)', color: '#4a9eff', border: '1px solid rgba(74,158,255,0.4)' }}>
          ← Search all entities
        </Link>
      </div>
    </div>
  )
}
