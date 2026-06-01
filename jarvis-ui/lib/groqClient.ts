// Thin Groq wrapper — used by court, eye, prophecy, fund scoring.

interface GroqMessage { role: 'system' | 'user' | 'assistant'; content: string }

interface GroqOpts {
  system: string
  user: string
  model?: string
  temperature?: number
  max_tokens?: number
  json?: boolean
}

export async function groqChat(opts: GroqOpts): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not configured')

  const messages: GroqMessage[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ]

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: opts.model ?? 'llama-3.3-70b-versatile',
      messages,
      stream: false,
      max_tokens: opts.max_tokens ?? 900,
      temperature: opts.temperature ?? 0.4,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Groq ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content ?? ''
  return opts.json ? raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim() : raw
}

// Streaming variant — yields chunks for SSE
export async function* groqStream(opts: GroqOpts): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not configured')

  const messages: GroqMessage[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ]

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: opts.model ?? 'llama-3.3-70b-versatile',
      messages,
      stream: true,
      max_tokens: opts.max_tokens ?? 900,
      temperature: opts.temperature ?? 0.4,
    }),
  })

  if (!res.ok || !res.body) {
    throw new Error(`Groq stream ${res.status}`)
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
      if (payload === '[DONE]') return
      try {
        const j = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
        const delta = j.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch { /* ignore parse errors on keepalives */ }
    }
  }
}
