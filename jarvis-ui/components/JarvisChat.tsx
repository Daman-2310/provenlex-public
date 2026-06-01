'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquare, Send, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'

interface Message {
  role: 'user' | 'jarvis'
  text: string
  ts: number
  streaming?: boolean
}

const QUICK_QUERIES = [
  'EXPLAIN LAST ANOMALY',
  'QUORUM HEALTH STATUS',
  'TOP THREATS SUMMARY',
  'RECENT BYPASSES',
]

// Browser SpeechRecognition is vendor-prefixed
type SpeechRec = {
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  continuous: boolean
  interimResults: boolean
  lang: string
}
type SpeechRecCtor = new () => SpeechRec

async function streamJarvisChat(
  query: string,
  onToken: (token: string) => void,
  signal: AbortSignal,
): Promise<void> {
  // Use local Next.js edge route (Groq-backed) — relative URL works on any host
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: query }),
    signal,
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
      if (token === '[DONE]') return
      if (token.startsWith('[JARVIS ERROR:') || token.startsWith('[ERROR:')) continue
      onToken(token.replace(/\\n/g, '\n'))
    }
  }
}

export default function JarvisChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'jarvis',
      text: 'JARVIS ONLINE — voice + text active. Tap the mic to speak, or type below.',
      ts: 0,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [transcript, setTranscript] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const recRef = useRef<SpeechRec | null>(null)
  const ttsBufferRef = useRef<string>('') // accumulate streamed text for TTS

  // Detect voice support
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor }
    const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    setVoiceSupported(!!ctor && typeof window.speechSynthesis !== 'undefined')
  }, [])

  // Greeting timestamp
  useEffect(() => {
    setMessages(prev => prev.map(m => m.ts === 0 ? { ...m, ts: Date.now() / 1000 } : m))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Speak text via browser TTS
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !text.trim()) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 1.08
      u.pitch = 0.95
      u.volume = 1
      // Prefer English UK/US voices if available
      const voices = window.speechSynthesis.getVoices()
      const pref = voices.find(v => /en-(GB|US)/i.test(v.lang) && /Google|Samantha|Daniel/i.test(v.name)) ?? voices.find(v => /en-/i.test(v.lang))
      if (pref) u.voice = pref
      window.speechSynthesis.speak(u)
    } catch { /* ignore */ }
  }, [voiceEnabled])

  const send = useCallback(async (text?: string) => {
    const query = (text ?? input).trim()
    if (!query || loading) return
    setInput('')
    setTranscript('')
    ttsBufferRef.current = ''

    setMessages(prev => [...prev, { role: 'user', text: query, ts: Date.now() / 1000 }])
    setLoading(true)

    const jarvisIdx = Date.now()
    setMessages(prev => [...prev, { role: 'jarvis', text: '', ts: jarvisIdx / 1000, streaming: true }])

    abortRef.current = new AbortController()
    try {
      await streamJarvisChat(
        query,
        (token) => {
          ttsBufferRef.current += token
          setMessages(prev =>
            prev.map(m =>
              m.role === 'jarvis' && m.ts === jarvisIdx / 1000
                ? { ...m, text: m.text + token }
                : m
            )
          )
        },
        abortRef.current.signal,
      )
      // Stream done — speak the full answer
      if (voiceEnabled && ttsBufferRef.current.trim()) {
        speak(ttsBufferRef.current)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setMessages(prev =>
        prev.map(m =>
          m.role === 'jarvis' && m.ts === jarvisIdx / 1000
            ? { ...m, text: 'JARVIS UNREACHABLE — check API connection.' }
            : m
        )
      )
    } finally {
      setMessages(prev =>
        prev.map(m =>
          m.role === 'jarvis' && m.ts === jarvisIdx / 1000
            ? { ...m, streaming: false }
            : m
        )
      )
      setLoading(false)
    }
  }, [input, loading, voiceEnabled, speak])

  // Toggle voice listening
  const toggleListen = useCallback(() => {
    if (!voiceSupported) return
    if (listening) {
      recRef.current?.stop()
      setListening(false)
      return
    }
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = 'en-GB'
    rec.continuous = false
    rec.interimResults = true
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1]
      const text = last[0].transcript
      setTranscript(text)
      if (last.isFinal) {
        setListening(false)
        // Auto-send when phrase is finalised
        setTimeout(() => send(text), 100)
      }
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }, [voiceSupported, listening, send])

  // Toggle TTS — when turning on, also enable autoplay by speaking an empty utterance
  const toggleVoice = useCallback(() => {
    setVoiceEnabled(v => {
      const next = !v
      if (next && typeof window !== 'undefined') {
        // Prime TTS — Safari/Chrome require user gesture to start audio
        window.speechSynthesis.cancel()
        const ping = new SpeechSynthesisUtterance('Voice activated.')
        ping.volume = 0.0001  // near-silent prime
        window.speechSynthesis.speak(ping)
      } else if (!next) {
        window.speechSynthesis.cancel()
      }
      return next
    })
  }, [])

  const fmtTs = (ts: number) =>
    ts === 0 ? '' : new Date(ts * 1000).toLocaleTimeString('en-GB', { hour12: false })

  return (
    <div className="font-mono flex flex-col h-full rounded-lg p-4"
      style={{
        background: 'rgba(5,5,12,0.95)',
        border: '1px solid rgba(0,255,136,0.18)',
        boxShadow: '0 0 40px rgba(0,255,136,0.03) inset',
      }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-3"
        style={{ borderBottom: '1px solid rgba(0,255,136,0.1)' }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
          <div>
            <div className="text-[10px] font-black text-[#00ff88] tracking-[0.15em] uppercase">Jarvis AI</div>
            <div className="text-[7px] text-[rgba(0,255,136,0.4)] uppercase tracking-wider">
              Groq llama-3.3 · {voiceSupported ? 'Voice + Text' : 'Text only'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {voiceSupported && (
            <button onClick={toggleVoice}
              title={voiceEnabled ? 'Disable AI voice output' : 'Enable AI voice output'}
              className="p-1.5 rounded transition-all"
              style={{
                background: voiceEnabled ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${voiceEnabled ? 'rgba(0,255,136,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: voiceEnabled ? '#00ff88' : 'rgba(255,255,255,0.5)',
                boxShadow: voiceEnabled ? '0 0 12px rgba(0,255,136,0.3)' : 'none',
              }}>
              {voiceEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            </button>
          )}
          <MessageSquare className="w-3.5 h-3.5 text-[rgba(0,255,136,0.3)]" />
        </div>
      </div>

      {/* Quick queries */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUICK_QUERIES.map(q => (
          <button key={q} onClick={() => send(q)} disabled={loading}
            className="text-[8px] px-2.5 py-1 rounded uppercase tracking-wider transition-all disabled:opacity-40"
            style={{ border: '1px solid rgba(0,255,136,0.2)', color: 'rgba(0,255,136,0.55)', background: 'rgba(0,255,136,0.03)' }}>
            › {q}
          </button>
        ))}
      </div>

      {/* Live voice transcript banner */}
      {listening && (
        <div className="mb-2 px-3 py-2 rounded flex items-center gap-3"
          style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.35)', boxShadow: '0 0 20px rgba(255,51,102,0.1)' }}>
          <div className="relative w-3 h-3 shrink-0">
            <div className="absolute inset-0 rounded-full bg-[#ff3366]"
              style={{ animation: 'pulse 0.7s ease-in-out infinite', boxShadow: '0 0 10px #ff3366' }} />
            <div className="absolute inset-0 rounded-full border border-[#ff3366]"
              style={{ animation: 'ping 1.4s ease-in-out infinite' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[8px] uppercase tracking-[0.2em] font-black text-[#ff3366]">Listening…</div>
            <div className="text-[11px] text-white truncate">{transcript || 'speak now'}</div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1 custom-scroll min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div suppressHydrationWarning className={`text-[9px] uppercase tracking-wider ${
              msg.role === 'user' ? 'text-[rgba(74,158,255,0.6)]' : 'text-[rgba(0,255,136,0.5)]'
            }`}>
              {msg.role === 'user' ? 'OPERATOR' : 'JARVIS'} // {fmtTs(msg.ts)}
            </div>
            <div className={`max-w-[90%] rounded px-3 py-2 text-[11px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[rgba(74,158,255,0.1)] border border-[rgba(74,158,255,0.2)] text-[#4a9eff]'
                : 'bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.15)] text-[#00ff88]'
            }`}>
              {msg.text || (msg.streaming ? '' : '—')}
              {msg.streaming && <span className="inline-block w-1.5 h-3 bg-[#00ff88] ml-0.5 animate-pulse" />}
            </div>
          </div>
        ))}
        {loading && !messages.some(m => m.streaming) && (
          <div className="flex items-center gap-2 text-[rgba(0,255,136,0.5)] text-[11px]">
            <span className="animate-pulse">▋</span>
            <span>JARVIS THINKING…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <input type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder={listening ? 'Listening to your voice…' : 'Ask Jarvis anything about the swarm…'}
          disabled={loading || listening}
          className="flex-1 bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] text-[#00ff88] placeholder-[rgba(0,255,136,0.25)] text-[11px] px-3 py-2 rounded font-mono outline-none focus:border-[#00ff88] transition-colors disabled:opacity-50 uppercase tracking-wide"
        />
        {voiceSupported && (
          <button onClick={toggleListen} disabled={loading}
            title={listening ? 'Stop listening' : 'Tap to speak to Jarvis'}
            className="px-3 py-2 rounded transition-all disabled:opacity-40"
            style={{
              background: listening ? 'rgba(255,51,102,0.15)' : 'rgba(0,255,136,0.1)',
              border: `1px solid ${listening ? 'rgba(255,51,102,0.5)' : 'rgba(0,255,136,0.3)'}`,
              color: listening ? '#ff3366' : '#00ff88',
              boxShadow: listening ? '0 0 16px rgba(255,51,102,0.4)' : 'none',
            }}>
            {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
        )}
        <button onClick={() => send()} disabled={loading || !input.trim()}
          className="px-3 py-2 bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
