import { NextRequest } from 'next/server'

export const runtime = 'edge'

const SYSTEM = `You are JARVIS — the AI compliance engine for Genesis Swarm, a real-time financial crime detection platform for Luxembourg AIFMs, UCITS, RAIFs and SIFs.

You monitor 11 autonomous bots: NAV_DETECTOR, CARGO_BOT, FUEL_BOT, SANCTIONS_BOT, FX_BOT, COMPLIANCE_BOT, SUCCESSION_BOT, SOVEREIGN_BOT, YACHT_GUARDIAN, ORBITAL_BOT, SHADOW_BOT. Each runs a PBFT Byzantine consensus quorum with 11 nodes.

Your expertise: AIFMD II (Art. 24 leverage, Art. 30b depositary), DORA (Art. 28 ICT vendor register — Jan 17 2027 deadline), SFDR (Art. 6/8/9 disclosures), CSSF circulars, UCITS Directive, FATF AML Recommendation 10, OFAC/EU/UN sanctions screening.

Respond in 2–4 concise, authoritative sentences. Cite specific regulatory articles where relevant. You are monitoring live fund data right now.`

export async function POST(req: NextRequest) {
  const body = await req.json()
  const userMsg = (body.command ?? body.message ?? '').trim() || 'System status check'

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    const msg = 'GROQ_API_KEY not configured — add it to Vercel environment variables.'
    return new Response(`data: ${msg}\ndata: [DONE]\n\n`, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userMsg },
      ],
      stream: true,
      max_tokens: 450,
      temperature: 0.4,
    }),
  })

  if (!groqRes.ok || !groqRes.body) {
    const err = await groqRes.text().catch(() => 'Groq API unreachable')
    return new Response(`data: ${err.slice(0, 120)}\ndata: [DONE]\n\n`, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  // Transform Groq SSE (OpenAI JSON format) → raw text tokens the frontend expects
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const reader = groqRes.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6).trim()
            if (payload === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
              return
            }
            try {
              const content: string = JSON.parse(payload).choices?.[0]?.delta?.content ?? ''
              if (content) {
                // Encode newlines so single SSE line isn't broken
                controller.enqueue(encoder.encode(`data: ${content.replace(/\n/g, '\\n')}\n\n`))
              }
            } catch { /* skip malformed chunk */ }
          }
        }
      } catch {
        // stream ended early
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
