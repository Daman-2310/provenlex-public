// RETIRED 2026-06-12. This endpoint generated LLM-written legal-style opinion PDFs
// (sent question + fund context to Groq). No replacement — ProvenLex does not
// produce legal opinions.

const GONE = {
  error: 'gone',
  message: 'Retired — ProvenLex does not generate legal opinions. The deterministic scanner at /scan flags breaches; a qualified adviser interprets them.',
}

export async function GET() { return Response.json(GONE, { status: 410 }) }
export async function POST() { return Response.json(GONE, { status: 410 }) }
