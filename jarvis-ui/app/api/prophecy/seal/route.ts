import { NextRequest } from 'next/server'
import { merkleRoot, sha256Hex, shortId } from '@/lib/merkle'
import { groqChat } from '@/lib/groqClient'
import { kv } from '@/lib/kv'

export const runtime = 'edge'

interface Prophecy {
  id: string
  subject: string
  lei?: string
  sealed_at: string
  reveal_at: string
  pre_crime_index: number
  genesis_score: number
  trajectory: 'RISING' | 'FALLING' | 'HOLDING'
  pattern_match?: string
  forecast: string
  signals: { name: string; severity: number; note: string }[]
  merkle_root: string
  signature: string
  status: 'SEALED' | 'REVEALED' | 'VINDICATED' | 'MISSED'
}

const SYSTEM = `You are the GENESIS PROPHECY ENGINE — an AI analytical model that issues cryptographically-sealed operational-risk forecasts on financial entities. You analyze structural-risk patterns inspired by historical archetypes (Wirecard, Archegos, FTX, Greensill, Madoff) AS PATTERNS, never as factual accusations against the subject. Output is an operational-risk forecast, NOT a legal verdict. NEVER use the words "fraud", "criminal", or "guilty" — use "operational-risk indicator", "structural concern", or "governance gap" instead. Return ONLY raw JSON, no markdown.`

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { subject?: string; lei?: string; horizon_months?: number }
    const subject = (body.subject ?? '').trim()
    if (!subject) return Response.json({ error: 'subject required' }, { status: 400 })
    const lei = body.lei?.trim().toUpperCase()
    const horizonMonths = Math.max(3, Math.min(36, body.horizon_months ?? 18))

    const prompt = `Issue an operational-risk forecast for: "${subject}"${lei ? ` (LEI ${lei})` : ''}.

Horizon: ${horizonMonths} months from today.

Return this JSON exactly:
{
  "pre_crime_index": <integer 0-100, AI-assessed operational-risk indicator>,
  "genesis_score": <integer 0-100, compliance-posture indicator, INVERSE of pre_crime_index roughly>,
  "trajectory": "<RISING|FALLING|HOLDING>",
  "pattern_match": "<wirecard|archegos|ftx|greensill|madoff|none>",
  "forecast": "<2-3 sentence operational-risk forecast — what structural concerns would warrant monitoring>",
  "signals": [
    {"name": "<signal name>", "severity": <0-100>, "note": "<one sentence>"},
    {"name": "<signal name>", "severity": <0-100>, "note": "<one sentence>"},
    {"name": "<signal name>", "severity": <0-100>, "note": "<one sentence>"}
  ]
}

Score honestly. Most entities are LOW risk (10-40). Reserve 70+ for genuine structural concerns. Reserve 85+ only for unusually elevated indicators. The forecast describes what would warrant supervisory attention — NOT a claim that wrongdoing has occurred.`

    const raw = await groqChat({
      system: SYSTEM,
      user: prompt,
      json: true,
      max_tokens: 800,
      temperature: 0.3,
    })

    type Forecast = {
      pre_crime_index: number
      genesis_score: number
      trajectory: 'RISING' | 'FALLING' | 'HOLDING'
      pattern_match?: string
      forecast: string
      signals: { name: string; severity: number; note: string }[]
    }
    const analysis = JSON.parse(raw) as Forecast

    const sealedAt = new Date().toISOString()
    const revealAt = new Date(Date.now() + horizonMonths * 30 * 86400_000).toISOString()

    const merkleParts = [
      `subject::${subject}`,
      `lei::${lei ?? ''}`,
      `sealed_at::${sealedAt}`,
      `reveal_at::${revealAt}`,
      `pre_crime_index::${analysis.pre_crime_index}`,
      `genesis_score::${analysis.genesis_score}`,
      `trajectory::${analysis.trajectory}`,
      `pattern::${analysis.pattern_match ?? 'none'}`,
      `forecast::${analysis.forecast}`,
      ...analysis.signals.map(s => `signal::${s.name}::${s.severity}::${s.note}`),
    ]
    const root = await merkleRoot(merkleParts)
    const signature = await sha256Hex(JSON.stringify(analysis) + sealedAt + subject)
    const id = shortId(root)

    const prophecy: Prophecy = {
      id,
      subject,
      lei: lei || undefined,
      sealed_at: sealedAt,
      reveal_at: revealAt,
      pre_crime_index: analysis.pre_crime_index,
      genesis_score: analysis.genesis_score,
      trajectory: analysis.trajectory,
      pattern_match: analysis.pattern_match && analysis.pattern_match !== 'none' ? analysis.pattern_match : undefined,
      forecast: analysis.forecast,
      signals: analysis.signals.slice(0, 5),
      merkle_root: root,
      signature,
      status: 'SEALED',
    }

    await kv.set(`prophecy:${id}`, prophecy, { ex: 60 * 60 * 24 * 365 * 5 })
    await kv.lpush('prophecy:index', { id, subject, sealed_at: sealedAt, pre_crime_index: analysis.pre_crime_index, pattern: prophecy.pattern_match })

    return Response.json({ ok: true, prophecy })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
