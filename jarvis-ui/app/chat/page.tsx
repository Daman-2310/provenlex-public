'use client'

import { useState, useRef, useEffect } from 'react'
import { BASE } from '@/lib/api'
import { MessageSquare, Send, Shield, Globe } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

const SUGGESTED = [
  "What does DORA Article 28 require for cloud providers?",
  "When is the AIFMD II Annex IV reporting deadline?",
  "Does our RAIF need a liquidity management tool?",
  "Qu'est-ce que la CSSF exige pour la délégation AIFMD II?",
  "What's the difference between Article 8 and Article 9 SFDR?",
  "How do I file the DORA ICT register with CSSF?",
]

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello. I'm the Genesis Swarm compliance assistant. Ask me anything about DORA, AIFMD II, UCITS, CSSF regulations, or Luxembourg fund law. I answer in English or French.", ts: Date.now() }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [fundType, setFundType] = useState('AIF')
  const [lang, setLang] = useState('en')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(p => [...p, { role: 'user', content: msg, ts: Date.now() }])
    setLoading(true)
    // Add empty assistant placeholder to stream into
    const ts = Date.now()
    setMessages(p => [...p, { role: 'assistant', content: '', ts }])
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `[${fundType}][${lang}] ${msg}` }),
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const token = line.slice(6)
          if (token === '[DONE]') break
          if (token.startsWith('[')) continue
          const tok = token.replace(/\\n/g, '\n')
          setMessages(p => p.map(m => m.ts === ts ? { ...m, content: m.content + tok } : m))
        }
      }
    } catch {
      setMessages(p => p.map(m => m.ts === ts ? { ...m, content: 'Connection error — backend may be warming up. Try again in 30 seconds.' } : m))
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]"
        style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <MessageSquare className="w-4 h-4 text-[#00ff88]" />
          <span className="font-bold tracking-[0.2em] text-sm uppercase">Compliance Assistant</span>
          <span className="text-[8px] tracking-widest text-[rgba(255,255,255,0.3)] hidden sm:block">// DORA · AIFMD II · UCITS · CSSF</span>
        </div>
        <div className="flex items-center gap-2">
          {['AIF', 'UCITS', 'RAIF'].map(t => (
            <button key={t} onClick={() => setFundType(t)}
              className="text-[8px] px-2 py-1 rounded transition-all uppercase tracking-wider"
              style={{ background: fundType === t ? 'rgba(0,255,136,0.12)' : 'transparent',
                border: `1px solid ${fundType === t ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: fundType === t ? '#00ff88' : 'rgba(255,255,255,0.35)' }}>
              {t}
            </button>
          ))}
          <button onClick={() => setLang(l => l === 'en' ? 'fr' : 'en')}
            className="flex items-center gap-1 text-[8px] px-2 py-1 rounded border border-[rgba(0,170,255,0.3)] text-[#00aaff] transition-all hover:bg-[rgba(0,170,255,0.08)]">
            <Globe className="w-2.5 h-2.5" />{lang === 'en' ? 'EN' : 'FR'}
          </button>
          <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded ml-1">← Back</a>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 space-y-4 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%] p-3 rounded text-[11px] leading-relaxed"
              style={{
                background: m.role === 'user' ? 'rgba(0,255,136,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${m.role === 'user' ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.07)'}`,
                color: m.role === 'user' ? '#00ff88' : 'rgba(255,255,255,0.8)',
                whiteSpace: 'pre-wrap',
              }}>
              {m.role === 'assistant' && (
                <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-[rgba(255,255,255,0.05)]">
                  <Shield className="w-2.5 h-2.5 text-[#00ff88]" />
                  <span className="text-[7px] uppercase tracking-widest text-[rgba(0,255,136,0.5)]">Genesis Swarm · {fundType}</span>
                </div>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="p-3 rounded text-[9px] text-[rgba(0,255,136,0.5)] animate-pulse"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              Analysing regulatory knowledge base…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      {messages.length <= 1 && (
        <div className="max-w-3xl w-full mx-auto px-4 pb-3">
          <div className="text-[7px] uppercase tracking-widest text-[rgba(255,255,255,0.2)] mb-2">Suggested questions</div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map(q => (
              <button key={q} onClick={() => send(q)}
                className="text-[8px] px-3 py-1.5 rounded text-left transition-all hover:bg-[rgba(0,255,136,0.08)]"
                style={{ border: '1px solid rgba(0,255,136,0.15)', color: 'rgba(255,255,255,0.45)' }}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-0 border-t border-[rgba(0,255,136,0.08)] px-4 py-3"
        style={{ background: 'rgba(5,5,8,0.98)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-3xl mx-auto flex gap-3">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={lang === 'fr' ? "Posez une question sur la réglementation luxembourgeoise…" : "Ask about Luxembourg financial regulations…"}
            className="flex-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(0,255,136,0.2)] rounded px-4 py-2 text-[11px] text-[rgba(255,255,255,0.8)] placeholder:text-[rgba(255,255,255,0.2)] focus:outline-none focus:border-[rgba(0,255,136,0.5)]" />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            className="flex items-center gap-2 px-4 py-2 rounded font-bold text-[10px] uppercase tracking-wider transition-all"
            style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.4)', color: '#00ff88', opacity: (!input.trim() || loading) ? 0.4 : 1 }}>
            <Send className="w-3 h-3" />
          </button>
        </div>
        <div className="text-[7px] text-center text-[rgba(255,255,255,0.12)] mt-1 uppercase tracking-widest max-w-3xl mx-auto">
          For guidance only · Consult a qualified compliance officer for binding advice
        </div>
      </div>
    </div>
  )
}
