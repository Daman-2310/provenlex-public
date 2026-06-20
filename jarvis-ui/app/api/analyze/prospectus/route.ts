// RETIRED 2026-06-12. This endpoint extracted uploaded prospectus text and sent up
// to 15,000 characters to a third-party LLM (Groq), leaking uploaded content and
// contradicting ProvenLex's core guarantee ("no LLM, nothing leaves your
// browser"). Use the deterministic, client-side scanner at /scan. No replacement.

const GONE = {
  error: 'gone',
  message: 'Retired — this endpoint sent uploaded prospectus text to a third-party LLM. Use the deterministic client-side scanner at /scan (nothing is uploaded).',
}

export async function GET() { return Response.json(GONE, { status: 410 }) }
export async function POST() { return Response.json(GONE, { status: 410 }) }
