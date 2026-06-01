// Lightweight Anthropic API client for the Confederate Court.
// Uses direct HTTP — no SDK install required.

const API_URL = 'https://api.anthropic.com/v1/messages'

interface AnthropicMessage { role: 'user' | 'assistant'; content: string }

interface ChatOpts {
  system: string
  user: string
  model?: string
  max_tokens?: number
  temperature?: number
}

export function anthropicAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export async function* anthropicStream(opts: ChatOpts): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const messages: AnthropicMessage[] = [{ role: 'user', content: opts.user }]

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model ?? 'claude-opus-4-7',
      system: opts.system,
      messages,
      max_tokens: opts.max_tokens ?? 600,
      stream: true,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    }),
  })

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 200)}`)
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
      if (!payload || payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload) as { type?: string; delta?: { type?: string; text?: string } }
        if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && j.delta.text) {
          yield j.delta.text
        }
      } catch { /* ignore */ }
    }
  }
}
