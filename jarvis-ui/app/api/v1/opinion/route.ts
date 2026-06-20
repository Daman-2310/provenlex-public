// RETIRED 2026-06-12. Public API wrapper for the opinion generator (LLM-written
// legal-style memos via Groq). Retired with its upstream.

const GONE = {
  error: 'gone',
  message: 'Retired — ProvenLex does not generate legal opinions. No replacement.',
}

export async function GET() { return Response.json(GONE, { status: 410 }) }
export async function POST() { return Response.json(GONE, { status: 410 }) }
