// RETIRED 2026-06-12. The Codex assistant streamed user messages to a third-party
// LLM (Groq). ProvenLex makes no LLM calls — "no LLM in the decision path,
// nothing uploaded" is the product's core guarantee. Removed. For compliance
// questions, use the deterministic, client-side prospectus scanner at /scan.

const GONE = {
  error: 'gone',
  message: 'Retired — the conversational assistant sent messages to a third-party LLM. Use the deterministic client-side scanner at /scan (no LLM, nothing uploaded).',
}

export async function GET() { return Response.json(GONE, { status: 410 }) }
export async function POST() { return Response.json(GONE, { status: 410 }) }
