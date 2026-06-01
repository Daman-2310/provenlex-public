'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight, BadgeEuro, CheckCircle2, Clapperboard, FileDown,
  Gauge, Play, RotateCcw, ShieldCheck, TimerReset,
} from 'lucide-react'
import {
  BASE, fetchBoardroomScript, resetBoardroomMode, startBoardroomMode,
  type BoardroomScript, type BoardroomSession,
} from '@/lib/api'

function formatDuration(ms: number) {
  return `${Math.round(ms / 1000)}s`
}

export default function BoardroomMode() {
  const [script, setScript] = useState<BoardroomScript | null>(null)
  const [session, setSession] = useState<BoardroomSession | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchBoardroomScript().then(setScript)
  }, [])

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  const activeScript = session?.script ?? script
  const elapsedMs = startedAt ? now - startedAt : 0
  const totalMs = activeScript?.total_duration_ms ?? 1
  const progress = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100))

  const activeIndex = useMemo(() => {
    if (!activeScript || !startedAt) return -1
    let cursor = 0
    for (let i = 0; i < activeScript.steps.length; i += 1) {
      cursor += activeScript.steps[i].duration_ms
      if (elapsedMs <= cursor) return i
    }
    return activeScript.steps.length - 1
  }, [activeScript, elapsedMs, startedAt])

  async function handleStart() {
    setLoading(true)
    const result = await startBoardroomMode()
    setLoading(false)
    if (result) {
      setSession(result)
      setStartedAt(Date.now())
    }
  }

  async function handleReset() {
    await resetBoardroomMode()
    setSession(null)
    setStartedAt(null)
  }

  return (
    <section className="terminal-border bg-genesis-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-[rgba(0,255,136,0.12)] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold text-[#00ff88] uppercase tracking-[0.16em] flex items-center gap-2">
            <Clapperboard className="w-3.5 h-3.5" />
            Boardroom Mode
          </div>
          <div className="text-xs text-[rgba(0,255,136,0.52)] mt-1">
            A guided 90-second investor run-through: crisis, quorum, proof, case, report.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session && (
            <a
              href={session.report_url?.startsWith('http') ? session.report_url : `${BASE}${session.report_url}`}
              target="_blank"
              className="flex items-center gap-1 text-[9px] uppercase tracking-wider px-2 py-1 border border-[rgba(74,158,255,0.35)] text-[#4a9eff] rounded hover:bg-[rgba(74,158,255,0.08)] transition-colors"
            >
              <FileDown className="w-3 h-3" /> Report
            </a>
          )}
          <button
            onClick={session ? handleReset : handleStart}
            disabled={loading}
            className={`flex items-center gap-1 text-[9px] uppercase tracking-wider px-3 py-1.5 rounded border transition-colors ${
              session
                ? 'border-[rgba(255,170,0,0.45)] text-[#ffaa00] hover:bg-[rgba(255,170,0,0.08)]'
                : 'border-[rgba(255,51,102,0.5)] text-[#ff3366] hover:bg-[rgba(255,51,102,0.1)]'
            }`}
          >
            {session ? <RotateCcw className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {loading ? 'Starting...' : session ? 'Reset' : 'Start Demo'}
          </button>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-4 border border-[rgba(255,51,102,0.18)] bg-[rgba(255,51,102,0.055)] rounded p-4">
          <div className="text-[9px] uppercase tracking-wider text-[rgba(255,51,102,0.62)]">Presenter Clock</div>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-4xl font-bold text-[#ff3366] tabular-nums">
              {Math.round(elapsedMs / 1000)}
            </span>
            <span className="text-xs text-[rgba(255,51,102,0.55)] mb-1">
              / {formatDuration(totalMs)}
            </span>
          </div>
          <div className="mt-3 h-1.5 bg-[rgba(255,51,102,0.12)] rounded overflow-hidden">
            <div className="h-full bg-[#ff3366] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="border border-[rgba(0,255,136,0.14)] rounded p-2">
              <Gauge className="w-4 h-4 text-[#00ff88] mb-1" />
              <div className="text-[8px] uppercase text-[rgba(0,255,136,0.4)]">Scenario</div>
              <div className="text-[11px] text-[#00ff88]">Wirecard Analog</div>
            </div>
            <div className="border border-[rgba(0,255,136,0.14)] rounded p-2">
              <BadgeEuro className="w-4 h-4 text-[#00ff88] mb-1" />
              <div className="text-[8px] uppercase text-[rgba(0,255,136,0.4)]">At Risk</div>
              <div className="text-[11px] text-[#00ff88]">
                {session ? `€${(session.crisis.total_at_risk_eur_m / 1000).toFixed(1)}B` : 'armed'}
              </div>
            </div>
          </div>
          {session && (
            <div className="mt-3 text-[10px] text-[rgba(0,255,136,0.58)] leading-5">
              Session #{session.session_id} opened case #{session.case_id}. Keep the screen moving; every proof point has a live artifact behind it.
            </div>
          )}
        </div>

        <div className="xl:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-2">
          {(activeScript?.steps ?? []).map((step, index) => {
            const active = index === activeIndex
            const complete = startedAt !== null && index < activeIndex
            return (
              <div
                key={step.step_id}
                className={`rounded border p-3 transition-all ${
                  active
                    ? 'border-[rgba(255,51,102,0.55)] bg-[rgba(255,51,102,0.08)]'
                    : complete
                      ? 'border-[rgba(0,255,136,0.28)] bg-[rgba(0,255,136,0.05)]'
                      : 'border-[rgba(0,255,136,0.1)] bg-[#050508]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[8px] uppercase tracking-wider text-[rgba(0,255,136,0.38)]">
                      Step {index + 1} · {formatDuration(step.duration_ms)}
                    </div>
                    <div className={`mt-1 text-[12px] font-bold ${active ? 'text-[#ff3366]' : 'text-[#00ff88]'}`}>
                      {step.title}
                    </div>
                  </div>
                  {complete ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00ff88] shrink-0" />
                  ) : active ? (
                    <TimerReset className="w-4 h-4 text-[#ff3366] shrink-0 animate-pulse" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-[rgba(0,255,136,0.35)] shrink-0" />
                  )}
                </div>
                <div className="mt-2 text-[10px] leading-5 text-[rgba(0,255,136,0.58)]">{step.narration}</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-[#4a9eff]">{step.metric}</span>
                  {step.step_id === 'report' && session && (
                    <a href={session.proof_url?.startsWith('http') ? session.proof_url : `${BASE}${session.proof_url}`} className="text-[9px] text-[#00ff88] flex items-center gap-1">
                      Proof <ArrowUpRight className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
