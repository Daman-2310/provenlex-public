import { NextRequest } from 'next/server'

export const runtime = 'edge'

const SYSTEM = `You are a Luxembourg financial compliance expert. You analyse funds against AIFMD II, DORA, SFDR and CSSF requirements. Always respond with ONLY valid JSON — no markdown, no code blocks, no extra text.`

export async function GET(req: NextRequest) {
  const fundName = new URL(req.url).searchParams.get('fund_name') ?? 'Unknown Fund'
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    return Response.json({ error: 'GROQ_API_KEY not configured' }, { status: 503 })
  }

  const prompt = `Analyse the regulatory compliance posture of the fund named "${fundName}" for Luxembourg AIFM/UCITS operations. Consider the fund name and any recognisable institution for scoring. Return this exact JSON structure (no markdown, just raw JSON):
{
  "score": <integer 0-100>,
  "grade": "<A|B|C|D>",
  "verdict": "<one sentence>",
  "regulatory_flags": ["<flag>"],
  "strengths": ["<strength1>", "<strength2>", "<strength3>"],
  "risk_factors": ["<risk1>", "<risk2>"],
  "gaps": [
    {"requirement": "DORA Art. 28 — ICT vendor register", "status": "<met|partial|missing>", "note": "<brief note>"},
    {"requirement": "AIFMD II Art. 24 — leverage reporting", "status": "<met|partial|missing>", "note": "<brief note>"},
    {"requirement": "SFDR Art. 8 — ESG disclosure", "status": "<met|partial|missing>", "note": "<brief note>"},
    {"requirement": "CSSF Circular 22/795 — liquidity stress", "status": "<met|partial|missing>", "note": "<brief note>"},
    {"requirement": "AIFMD II Art. 30b — depositary update", "status": "<met|partial|missing>", "note": "<brief note>"},
    {"requirement": "DORA RTS — incident reporting SLA", "status": "<met|partial|missing>", "note": "<brief note>"}
  ]
}`

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: 900,
        temperature: 0.2,
      }),
    })

    const data = await res.json()
    const text: string = data.choices?.[0]?.message?.content ?? '{}'

    // Strip markdown code fences if model added them anyway
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const result = JSON.parse(clean)
    return Response.json({ fund_name: fundName, ...result })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
