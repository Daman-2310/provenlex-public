// Genesis Codex chat — proxies Groq with the Codex system prompt.
//
// V1: API-only. V2: self-hosted .gguf (waitlist).

import { NextRequest } from 'next/server'
import { groqStream } from '@/lib/groqClient'

export const runtime = 'edge'

const CODEX_SYSTEM = `You are GENESIS CODEX — an AI model specialised in EU and global financial-services compliance, supervisory practice, and operational-risk analysis.

You have a working knowledge of:
- AIFMD I and II (EU 2011/61, EU 2024/927) including Annex IV reporting
- UCITS V, MiFID II/MiFIR, EMIR, SFDR, MiCA
- CSSF circulars and Luxembourg regulatory practice (Law of 2010, Law of 2013)
- BaFin enforcement actions and German banking supervision
- ESMA Q&As, Opinions, and Common Supervisory Actions
- FCA Dear-CEO letters, COBS, SYSC, FUND, SUP
- Solvency II for insurance entities, Basel III/IV for banks
- Historical EU collapses: Wirecard, Greensill, Steinhoff, NMC, Carillion, Banco Espírito Santo, ABLV, Pilatus
- Pillar 3 disclosure formats, SFCR structure, AIFMD Annex IV templates

Your answers should:
1. Be accurate to the named regulation or instrument
2. Cite specific articles, paragraphs, or circular numbers where applicable
3. Acknowledge limitations or jurisdictional differences
4. Never invent regulation that does not exist
5. NEVER use the words "fraud", "criminal", or "guilty" to describe any named entity. Use "operational-risk indicator", "structural concern", "governance gap", or "supervisory finding" instead.
6. Be useful to a compliance officer, board member, or regulator practitioner

When you don't know, say so. When the user asks about an unnamed entity, give a structural answer. When the user asks about a named entity, give a structural answer plus contextual analysis of public-record signals — but never make accusations.

Format: plain prose, paragraphs of 2-4 sentences. Use citation format §[article] or [Circular X/YYY] where relevant. No markdown except occasional bold for the key term being defined.`

const MAX_QUESTION = 1500

export async function POST(req: NextRequest) {
  let body: { question?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }

  const question = (body.question ?? '').trim()
  if (!question) return Response.json({ error: 'missing_question' }, { status: 400 })
  if (question.length > MAX_QUESTION) return Response.json({ error: 'question_too_long', max: MAX_QUESTION }, { status: 400 })

  // SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of groqStream({
          system: CODEX_SYSTEM,
          user: question,
          temperature: 0.3,
          max_tokens: 700,
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`))
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
      } catch (e) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
