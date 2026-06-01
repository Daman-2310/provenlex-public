import { NextRequest } from 'next/server'

// Node.js runtime — required for pdf-parse
export const runtime = 'nodejs'
export const maxDuration = 30

const SYSTEM = `You are a Luxembourg financial compliance analyst. You receive raw text extracted from a fund prospectus and must return ONLY valid JSON (no markdown, no code fences, no preamble). Analyse the prospectus against AIFMD II, SFDR, DORA, UCITS V, CSSF requirements.`

const PROMPT_TPL = (text: string) => `Analyse the following fund prospectus text and return this exact JSON shape:

{
  "fundName": "<extracted name or 'Unknown'>",
  "fundType": "<UCITS|AIFM|RAIF|SIF|SICAV|SICAR|FCP|Unknown>",
  "domicile": "<2-letter ISO country or 'Unknown'>",
  "estimatedAUM": "<string with currency, e.g. '€2.4B' or 'Unknown'>",
  "sfdrClassification": "<Article 6|Article 8|Article 9|Unknown>",
  "investmentStrategy": "<1 sentence>",
  "riskScore": <integer 0-100 — 0=low risk, 100=critical>,
  "complianceScore": <integer 0-100 — 100=fully compliant>,
  "verdict": "<one sentence — overall regulatory posture>",
  "strengths": ["<3 short bullets>"],
  "risks": ["<3 short bullets>"],
  "gaps": [
    {"requirement": "DORA Art. 28 — ICT vendor register", "status": "<met|partial|missing>", "note": "<10 word note>"},
    {"requirement": "AIFMD II Art. 24 — leverage reporting", "status": "<met|partial|missing>", "note": "<10 word note>"},
    {"requirement": "SFDR Art. 8/9 — ESG disclosure", "status": "<met|partial|missing>", "note": "<10 word note>"},
    {"requirement": "CSSF Circular 22/795 — liquidity stress", "status": "<met|partial|missing>", "note": "<10 word note>"},
    {"requirement": "AIFMD II Art. 30b — depositary", "status": "<met|partial|missing>", "note": "<10 word note>"},
    {"requirement": "DORA RTS — incident reporting SLA", "status": "<met|partial|missing>", "note": "<10 word note>"}
  ],
  "regulatoryFlags": ["<short tags like 'DORA gap', 'SFDR Art.8 pending'>"]
}

PROSPECTUS TEXT (first 15000 chars):
${text.slice(0, 15000)}`

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'GROQ_API_KEY not configured on server' }, { status: 503 })
  }

  // Parse multipart form
  let pdfBuffer: Buffer
  let filename = 'document.pdf'
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return Response.json({ error: 'no file field in form data' }, { status: 400 })
    if (file.size > 8 * 1024 * 1024) return Response.json({ error: 'PDF too large (max 8MB)' }, { status: 413 })
    if (!file.name.toLowerCase().endsWith('.pdf')) return Response.json({ error: 'only PDF files accepted' }, { status: 400 })
    filename = file.name
    const arrayBuf = await file.arrayBuffer()
    pdfBuffer = Buffer.from(arrayBuf)
  } catch (e) {
    return Response.json({ error: 'failed to parse form', detail: String(e) }, { status: 400 })
  }

  // Extract text from PDF
  let text: string
  let pageCount: number
  try {
    // Dynamic import keeps cold start minimal
    const pdfParse = (await import('pdf-parse')).default
    const parsed = await pdfParse(pdfBuffer)
    text = parsed.text ?? ''
    pageCount = parsed.numpages ?? 0
    if (text.trim().length < 200) {
      return Response.json({
        error: 'PDF text too short — possibly scanned/image-only PDF',
        extractedChars: text.length,
        pageCount,
      }, { status: 422 })
    }
  } catch (e) {
    return Response.json({ error: 'pdf parse failed', detail: String(e) }, { status: 500 })
  }

  // Send to Groq for compliance analysis
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: PROMPT_TPL(text) },
        ],
        stream: false,
        max_tokens: 1500,
        temperature: 0.15,
        response_format: { type: 'json_object' },
      }),
    })
    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => '')
      return Response.json({ error: `Groq ${groqRes.status}`, detail: errText.slice(0, 200) }, { status: 502 })
    }
    type GroqOut = { choices?: Array<{ message?: { content?: string } }> }
    const groq = (await groqRes.json()) as GroqOut
    const raw = groq.choices?.[0]?.message?.content ?? '{}'
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const analysis = JSON.parse(clean)
    return Response.json({
      filename,
      pageCount,
      extractedChars: text.length,
      analysis,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    return Response.json({ error: 'analysis failed', detail: String(e) }, { status: 500 })
  }
}
