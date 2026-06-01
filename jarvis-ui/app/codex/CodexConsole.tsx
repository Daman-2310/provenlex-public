'use client'

import { useState, useRef, useEffect } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'

const SAMPLE_QUESTIONS = [
  'Summarise the key obligations under AIFMD II Article 24.',
  'When does CSSF require a depositary special audit?',
  'What triggered the Wirecard collapse from a supervisory perspective?',
  'Explain SFDR Article 8 vs Article 9 in two sentences.',
  'What were the warning signs in Greensill before March 2021?',
]

export default function CodexConsole() {
  const [question, setQuestion] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const respRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (respRef.current) respRef.current.scrollTop = respRef.current.scrollHeight
  }, [response])

  async function ask() {
    if (!question.trim() || loading) return
    setLoading(true); setError(null); setResponse('')
    try {
      const res = await fetch('/api/codex/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => '')
        setError(`HTTP ${res.status} · ${t.slice(0, 200)}`)
        setLoading(false)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') { setLoading(false); return }
          try {
            const j = JSON.parse(payload)
            if (j.delta) setResponse(r => r + j.delta)
            else if (j.error) setError(j.error)
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      setError(`Network error: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,216,255,0.3)', backdropFilter: 'blur(10px)' }}>

      <div className="px-4 py-3" style={{ background: 'rgba(0,216,255,0.06)', borderBottom: '1px solid rgba(0,216,255,0.15)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-3.5 h-3.5 text-[#00d8ff]" />
          <span className="text-[10px] uppercase tracking-wider font-bold text-[#00d8ff]">Genesis Codex · live model</span>
          <span className="ml-auto text-[9px] text-[rgba(255,255,255,0.4)] font-mono">streaming · Server-Sent Events</span>
        </div>
      </div>

      {/* Response area */}
      <div ref={respRef} className="px-4 py-4 min-h-[200px] max-h-[400px] overflow-y-auto"
        style={{ background: 'rgba(0,0,0,0.3)' }}>
        {response ? (
          <div className="text-[13px] text-[rgba(255,255,255,0.88)] leading-relaxed whitespace-pre-wrap">{response}</div>
        ) : (
          <div className="text-[12px] text-[rgba(255,255,255,0.4)] italic">
            Ask a compliance question. Press Cmd+Enter or click Send.
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 mt-2 text-[11px] text-[#00d8ff]">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>thinking…</span>
          </div>
        )}
        {error && (
          <div className="mt-3 rounded p-2 text-[11px]"
            style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366' }}>
            {error}
          </div>
        )}
      </div>

      {/* Sample chips */}
      {!response && !loading && (
        <div className="px-4 py-2 flex items-center gap-2 flex-wrap text-[9px]"
          style={{ background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(0,216,255,0.08)' }}>
          <span className="uppercase tracking-wider text-[rgba(255,255,255,0.35)]">try</span>
          {SAMPLE_QUESTIONS.map(q => (
            <button key={q} onClick={() => setQuestion(q)}
              className="px-2 py-0.5 rounded text-[#00d8ff] hover:bg-[rgba(0,216,255,0.08)] transition-all">
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(0,216,255,0.15)' }}>
        <textarea value={question} onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask() } }}
          placeholder="Ask Genesis Codex about EU compliance, AIFMD/UCITS/SFDR/Solvency II, historical EU collapses…"
          rows={2}
          className="flex-1 bg-black/40 outline-none text-white text-[13px] px-3 py-2 rounded border border-[rgba(0,216,255,0.2)] focus:border-[rgba(0,216,255,0.6)] resize-y" />
        <button onClick={ask} disabled={loading || !question.trim()}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-4 py-2 rounded transition-all disabled:opacity-50"
          style={{ background: 'rgba(0,216,255,0.15)', border: '1px solid rgba(0,216,255,0.5)', color: '#00d8ff' }}>
          {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> Streaming</> : <><Send className="w-3 h-3" /> Send</>}
        </button>
      </div>
    </div>
  )
}
