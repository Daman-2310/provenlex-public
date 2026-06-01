import { NextRequest } from 'next/server'
import { groqStream } from '@/lib/groqClient'
import { anthropicStream, anthropicAvailable } from '@/lib/anthropic'

export const runtime = 'edge'

const PROSECUTOR = `You are THE PROSECUTION in the Genesis Constitutional Court — an adversarial AI deliberator built to argue the strongest case that the subject entity exhibits material operational-risk indicators. You cite historical archetypes (Wirecard, Archegos, FTX, Greensill, Madoff patterns) as analytical references, not factual accusations. NEVER use the words "guilty", "fraud", or "criminal" — frame everything as operational-risk indicators, structural concerns, or governance gaps. Court-formal prose. 4-6 sentences max. No markdown.`

const DEFENDER = `You are THE DEFENSE in the Genesis Constitutional Court — an AI deliberator whose duty is to argue the strongest plausible response to the operational-risk concerns raised against the entity. You marshal extenuating context, regulatory good-faith, and structural protections. Court-formal prose. 4-6 sentences max. No markdown.`

const CHIEF_JUSTICE = `You are THE CHIEF JUSTICE of the Genesis Constitutional Court — you have heard the Prosecution and the Defense. Render the final assessment of operational-risk posture using EXACTLY one of: CRITICAL (material structural concern), CONCERNED (notable risk indicators), MONITORED (watchful), or CLEARED (acceptable posture). NEVER use the words "guilty", "fraud", or "criminal" — this is an operational-risk assessment, not a legal verdict. Then a 3-4 sentence majority opinion explaining the assessment. Include one sentence of minority opinion if relevant. Court-formal prose. No markdown.`

function sse(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, event: string, data: unknown) {
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
}

type Role = 'prosecutor' | 'defender' | 'justice'
type ModelId = 'groq' | 'anthropic'

async function streamRole(
  role: Role,
  model: ModelId,
  system: string,
  user: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
) {
  try {
    let full = ''
    sse(controller, encoder, 'model', { role, model })
    const generator = model === 'anthropic'
      ? anthropicStream({ system, user, max_tokens: 600 })
      : groqStream({ system, user, max_tokens: 600, temperature: 0.6 })
    for await (const chunk of generator) {
      full += chunk
      sse(controller, encoder, 'chunk', { role, delta: chunk })
    }
    sse(controller, encoder, 'done', { role, full })
    return full
  } catch (e) {
    sse(controller, encoder, 'error', { role, error: String(e) })
    return ''
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { subject?: string; context?: string; confederate?: boolean }
  const subject = (body.subject ?? '').trim()
  if (!subject) return Response.json({ error: 'subject required' }, { status: 400 })
  const ctx = (body.context ?? '').trim()

  // Confederate mode: use Anthropic for the Chief Justice (gravitas), Groq for the
  // adversarial Prosecution + Defense. Falls back to Groq for all if Anthropic key missing.
  const confederate = body.confederate === true && anthropicAvailable()

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      sse(controller, encoder, 'open', { subject, confederate })

      // Phase 1: Prosecutor + Defender run in parallel (always Groq for speed)
      const userPros = `Subject before the court: ${subject}.${ctx ? ` Additional context: ${ctx}` : ''}\n\nDeliver your prosecution.`
      const userDef  = `Subject before the court: ${subject}.${ctx ? ` Additional context: ${ctx}` : ''}\n\nDeliver your defense.`

      const [prosText, defText] = await Promise.all([
        streamRole('prosecutor', 'groq', PROSECUTOR, userPros, controller, encoder),
        streamRole('defender',   'groq', DEFENDER,   userDef,  controller, encoder),
      ])

      // Phase 2: Chief Justice deliberates AFTER reading both
      sse(controller, encoder, 'phase', { phase: 'verdict' })
      const userJust = `Subject before the court: ${subject}.

THE PROSECUTION argued:
${prosText}

THE DEFENSE argued:
${defText}

Render the operational-risk assessment.`

      await streamRole('justice', confederate ? 'anthropic' : 'groq', CHIEF_JUSTICE, userJust, controller, encoder)

      sse(controller, encoder, 'close', { ts: new Date().toISOString() })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
