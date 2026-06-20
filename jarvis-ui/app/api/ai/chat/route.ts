import { NextRequest } from 'next/server'

export const runtime = 'edge'

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC, LOCAL responder. NO third-party LLM, NO data egress.
//
// This endpoint previously streamed user-typed text to Groq (a third-party LLM),
// which leaked whatever a user typed to an external AI provider and contradicted
// the product's core promise ("no LLM in the decision path, nothing leaves your
// browser"). It has been rewritten to answer locally from a fixed knowledge map.
// Nothing entered here is sent to any external service.
//
// Honesty rule: this is NOT an AI. It is a deterministic lookup. It does not
// generate compliance verdicts — the deterministic scan engine does that. For an
// actual verdict, the user is routed to /scan.
// ─────────────────────────────────────────────────────────────────────────────

const DISCLAIMER = 'Information only, not legal advice.'

// Local, factual pointers for the regimes the deterministic engine actually checks.
const KB: { match: RegExp; answer: string }[] = [
  {
    match: /\bleverage\b|\bart(?:icle)?\.?\s*24\b|\baifmd\b/i,
    answer:
      'AIFMD II leverage is checked deterministically: commitment-method exposure is flagged above 175% (or 300% where the prospectus permits), per Art. 24. The scan extracts the stated limit and compares it arithmetically — no model, no inference.',
  },
  {
    match: /\bucits\b|5\/?10\/?40|single[-\s]?issuer/i,
    answer:
      'UCITS limits are checked deterministically: 10% single-issuer cap and the 5/10/40 concentration rule (positions over 5% must not in aggregate exceed 40%). These run as arithmetic over extracted figures, only when the document is detected as UCITS.',
  },
  {
    match: /\bdora\b|ict|vendor register/i,
    answer:
      'DORA (Art. 28 ICT third-party register; in force 17 Jan 2025, with the register obligation tracked toward the 2027 milestone) is a checklist item — ProvenLex flags presence/absence of required disclosures, it does not opine on adequacy.',
  },
  {
    match: /\bsfdr\b|art(?:icle)?\.?\s*[689]\b|disclosure/i,
    answer:
      'SFDR is handled as a classification check (Art. 6 / 8 / 9). ProvenLex surfaces which disclosures the prospectus claims and whether the mandatory statements are present — it does not grade sustainability substance.',
  },
  {
    match: /sanction|ofac|sdn|screen/i,
    answer:
      'Sanctions screening matches names against published OFAC/EU/UN lists. It is a deterministic list match, not a judgement — a hit means "appears on the list", which a human must then verify.',
  },
]

function respond(userMsg: string): string {
  const hit = KB.find(k => k.match.test(userMsg))
  const body = hit
    ? hit.answer
    : 'This console is a deterministic lookup, not an AI assistant — it does not generate compliance opinions. To get an actual verdict on a document, paste it into the deterministic scan at /scan (runs in your browser, no upload, no LLM).'
  return `${body}\n\n— ProvenLex · deterministic engine · no LLM, nothing sent externally. ${DISCLAIMER}`
}

export async function POST(req: NextRequest) {
  let userMsg = ''
  try {
    const body = await req.json()
    userMsg = String(body.command ?? body.message ?? '').trim()
  } catch {
    /* ignore — empty query is fine */
  }

  const text = respond(userMsg)
  const encoder = new TextEncoder()

  // Same SSE shape the frontends parse: `data: <text>\n\n` then `data: [DONE]\n\n`,
  // with literal newlines escaped so a single SSE event isn't split.
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${text.replace(/\n/g, '\\n')}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
