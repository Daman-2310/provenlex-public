'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Gavel, Scale, ShieldCheck, AlertTriangle, Crown } from 'lucide-react'
import LegalDisclaimer from '@/components/LegalDisclaimer'
import CosmicBackground from '@/components/CosmicBackground'

type Role = 'prosecutor' | 'defender' | 'justice'
type Phase = 'idle' | 'argument' | 'verdict' | 'closed'

interface RoleState {
  text: string
  status: 'idle' | 'speaking' | 'done' | 'error'
}

const ROLE_CFG = {
  prosecutor: { label: 'THE PROSECUTION', color: '#ff3366', Icon: AlertTriangle, side: 'left' },
  defender:   { label: 'THE DEFENSE',     color: '#00ff88', Icon: ShieldCheck,   side: 'right' },
  justice:    { label: 'CHIEF JUSTICE',   color: '#9b6dff', Icon: Crown,         side: 'center' },
} as const

export default function CourtPage() {
  const [subject, setSubject] = useState('')
  const [ctx, setCtx] = useState('')
  const [confederate, setConfederate] = useState(false)
  const [models, setModels] = useState<Record<Role, string>>({ prosecutor: '', defender: '', justice: '' })
  const [phase, setPhase] = useState<Phase>('idle')
  const [roles, setRoles] = useState<Record<Role, RoleState>>({
    prosecutor: { text: '', status: 'idle' },
    defender:   { text: '', status: 'idle' },
    justice:    { text: '', status: 'idle' },
  })
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => { abortRef.current?.abort() }, [])

  async function deliberate() {
    if (!subject.trim()) return
    setPhase('argument')
    setError('')
    setModels({ prosecutor: '', defender: '', justice: '' })
    setRoles({
      prosecutor: { text: '', status: 'speaking' },
      defender:   { text: '', status: 'speaking' },
      justice:    { text: '', status: 'idle' },
    })

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch('/api/court/deliberate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), context: ctx.trim() || undefined, confederate }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        setError(`server ${res.status}`)
        setPhase('closed')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        const events = buf.split('\n\n')
        buf = events.pop() ?? ''

        for (const ev of events) {
          if (!ev.trim()) continue
          const lines = ev.split('\n')
          const eventName = lines.find(l => l.startsWith('event:'))?.slice(6).trim() ?? 'message'
          const dataLine = lines.find(l => l.startsWith('data:'))?.slice(5).trim() ?? '{}'
          let payload: Record<string, unknown> = {}
          try { payload = JSON.parse(dataLine) } catch { /* */ }

          if (eventName === 'chunk') {
            const role = payload.role as Role
            const delta = (payload.delta ?? '') as string
            setRoles(prev => ({ ...prev, [role]: { ...prev[role], text: prev[role].text + delta, status: 'speaking' } }))
          } else if (eventName === 'done') {
            const role = payload.role as Role
            setRoles(prev => ({ ...prev, [role]: { ...prev[role], status: 'done' } }))
          } else if (eventName === 'model') {
            const role = payload.role as Role
            const model = String(payload.model ?? '')
            setModels(prev => ({ ...prev, [role]: model }))
          } else if (eventName === 'error') {
            const role = payload.role as Role | undefined
            if (role) setRoles(prev => ({ ...prev, [role]: { ...prev[role], status: 'error' } }))
          } else if (eventName === 'phase') {
            if (payload.phase === 'verdict') {
              setPhase('verdict')
              setRoles(prev => ({ ...prev, justice: { ...prev.justice, status: 'speaking' } }))
            }
          } else if (eventName === 'close') {
            setPhase('closed')
          }
        }
      }
    } catch (e) {
      setError(String(e))
    }
    setPhase(prev => prev === 'argument' || prev === 'verdict' ? 'closed' : prev)
  }

  function reset() {
    abortRef.current?.abort()
    setRoles({
      prosecutor: { text: '', status: 'idle' },
      defender:   { text: '', status: 'idle' },
      justice:    { text: '', status: 'idle' },
    })
    setPhase('idle')
    setError('')
  }

  const verdict = extractVerdict(roles.justice.text)

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="intense" accent="#9b6dff" />
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Gavel className="w-4 h-4" style={{ color: '#9b6dff' }} />
          <span className="text-sm font-bold tracking-[0.18em]" style={{ color: '#9b6dff' }}>CONSTITUTIONAL COURT</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">3 AI judges · live deliberation</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* HERO */}
        <div className="text-center mb-8">
          <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.05 }}>
            <span style={{ background: 'linear-gradient(90deg, #ff3366 0%, #9b6dff 50%, #00ff88 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Three AI Judges.
            </span>
            <br />
            <span className="text-white">One Verdict.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-sm max-w-2xl mx-auto leading-relaxed">
            The Prosecutor argues the harshest interpretation. The Defender marshals every protection. The Chief Justice renders verdict with dissents.
          </p>
        </div>

        {/* INPUT */}
        <div className="rounded-2xl p-5 mb-8"
          style={{ background: 'rgba(155,109,255,0.04)', border: '1px solid rgba(155,109,255,0.25)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#9b6dff] font-black mb-3">Subject before the court</div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_2fr_auto] gap-3">
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Fund, company, or entity name"
              className="px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(155,109,255,0.3)] focus:border-[#9b6dff] outline-none"
              onKeyDown={e => { if (e.key === 'Enter' && phase !== 'argument' && phase !== 'verdict') void deliberate() }}
            />
            <input
              value={ctx}
              onChange={e => setCtx(e.target.value)}
              placeholder="Additional context (optional)"
              className="px-4 py-3 rounded-lg text-sm bg-[rgba(0,0,0,0.4)] text-white border border-[rgba(155,109,255,0.3)] focus:border-[#9b6dff] outline-none"
            />
            {phase === 'argument' || phase === 'verdict' ? (
              <button onClick={reset}
                className="px-6 py-3 rounded-lg text-sm font-black uppercase tracking-[0.15em]"
                style={{ background: 'rgba(255,51,102,0.1)', color: '#ff3366', border: '1px solid rgba(255,51,102,0.4)' }}>
                Stop
              </button>
            ) : (
              <button onClick={() => void deliberate()} disabled={!subject.trim()}
                className="px-6 py-3 rounded-lg text-sm font-black uppercase tracking-[0.15em] disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #9b6dff 0%, #4a9eff 100%)', color: '#000', boxShadow: '0 0 24px rgba(155,109,255,0.4)' }}>
                Convene
              </button>
            )}
          </div>
          {error && <div className="text-[#ff3366] text-[11px] mt-3">{error}</div>}

          {/* Confederate Court toggle */}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confederate}
                onChange={e => setConfederate(e.target.checked)}
                className="appearance-none w-4 h-4 rounded border border-[rgba(155,109,255,0.5)] checked:bg-[#9b6dff] checked:border-[#9b6dff] cursor-pointer transition-colors"
                style={{
                  backgroundImage: confederate ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\' fill=\'%23000\'%3E%3Cpath d=\'M13.4 4.6L6 12 2.6 8.6l1.4-1.4L6 9.2l6-6z\'/%3E%3C/svg%3E")' : 'none',
                  backgroundSize: 'contain',
                }}
              />
              <span className="text-[10px] uppercase tracking-[0.18em] font-black text-[#9b6dff]">
                CONFEDERATE MODE
              </span>
              <span className="text-[10px] text-[rgba(255,255,255,0.5)]">
                — Chief Justice uses Claude · Prosecution &amp; Defense remain on Groq llama-3.3-70b
              </span>
            </label>
          </div>
        </div>

        {/* COURTROOM */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <RolePanel role="prosecutor" state={roles.prosecutor} model={models.prosecutor} />
          <RolePanel role="defender" state={roles.defender} model={models.defender} />
        </div>

        {/* JUSTICE BENCH */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-px h-12 bg-gradient-to-b from-transparent via-[#9b6dff] to-transparent opacity-50" />
          </div>
          <div className="pt-6">
            <RolePanel role="justice" state={roles.justice} verdict={verdict} model={models.justice} />
          </div>
        </div>

        <div className="mt-10">
          <LegalDisclaimer variant="full" />
        </div>

      </div>
    </div>
  )
}

function RolePanel({ role, state, verdict, model }: { role: Role; state: RoleState; verdict?: string | null; model?: string }) {
  const cfg = ROLE_CFG[role]
  const isJustice = role === 'justice'
  return (
    <div className="rounded-2xl p-5 min-h-[200px]"
      style={{
        background: `linear-gradient(135deg, ${cfg.color}08 0%, rgba(0,0,0,0) 100%)`,
        border: `1px solid ${cfg.color}30`,
        boxShadow: state.status === 'speaking' ? `0 0 24px ${cfg.color}25` : `0 0 12px ${cfg.color}08`,
      }}>
      <div className="flex items-center gap-2 mb-3">
        <cfg.Icon className="w-4 h-4" style={{ color: cfg.color }} />
        <span className="text-[10px] uppercase tracking-[0.2em] font-black" style={{ color: cfg.color }}>{cfg.label}</span>
        {model && (
          <span className="text-[7px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded-full"
            style={{
              background: model === 'anthropic' ? 'rgba(238,118,87,0.12)' : 'rgba(255,255,255,0.04)',
              color: model === 'anthropic' ? '#ee7657' : 'rgba(255,255,255,0.55)',
              border: `1px solid ${model === 'anthropic' ? 'rgba(238,118,87,0.35)' : 'rgba(255,255,255,0.1)'}`,
            }}>
            {model === 'anthropic' ? 'CLAUDE' : 'GROQ'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {state.status === 'speaking' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color, animation: 'pulse 1s ease-in-out infinite' }} />
              <span className="text-[8px] uppercase tracking-wider font-black" style={{ color: cfg.color }}>SPEAKING</span>
            </>
          )}
          {state.status === 'done' && (
            <span className="text-[8px] uppercase tracking-wider font-black text-[rgba(255,255,255,0.4)]">ARGUMENT CLOSED</span>
          )}
          {state.status === 'idle' && (
            <span className="text-[8px] uppercase tracking-wider font-black text-[rgba(255,255,255,0.3)]">AWAITING</span>
          )}
          {state.status === 'error' && (
            <span className="text-[8px] uppercase tracking-wider font-black text-[#ff3366]">ERROR</span>
          )}
        </div>
      </div>

      {isJustice && verdict && (
        <div className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ background: `${verdictColor(verdict)}15`, border: `1px solid ${verdictColor(verdict)}50` }}>
          <Scale className="w-3 h-3" style={{ color: verdictColor(verdict) }} />
          <span className="text-[11px] uppercase tracking-[0.2em] font-black" style={{ color: verdictColor(verdict) }}>{verdict}</span>
        </div>
      )}

      <div className="text-[13px] leading-relaxed whitespace-pre-wrap"
        style={{ color: state.status === 'idle' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.85)' }}>
        {state.text || (state.status === 'idle' ? 'Waiting to be called…' : '')}
      </div>
    </div>
  )
}

function extractVerdict(text: string): string | null {
  const m = text.match(/\b(CRITICAL|CONCERNED|MONITORED|CLEARED)\b/i)
  return m ? m[1].toUpperCase() : null
}

function verdictColor(v: string): string {
  switch (v) {
    case 'CRITICAL':  return '#ff3366'
    case 'CONCERNED': return '#ffaa00'
    case 'MONITORED': return '#4a9eff'
    case 'CLEARED':   return '#00ff88'
    default:          return '#9b6dff'
  }
}
