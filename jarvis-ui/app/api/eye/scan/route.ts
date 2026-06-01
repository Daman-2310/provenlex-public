import { NextRequest } from 'next/server'
import { groqStream, groqChat } from '@/lib/groqClient'
import { sha256Hex, shortId, merkleRoot } from '@/lib/merkle'
import { kv } from '@/lib/kv'

export const runtime = 'edge'

interface ScanArtifact {
  id: string
  subject: string
  scanned_at: string
  ofac_hits: number
  gleif_match?: { lei: string; legalName: string; jurisdiction?: string }
  sentiment_score: number
  risk_level: 'LOW' | 'MODERATE' | 'ELEVATED' | 'CRITICAL'
  swarm_findings: string[]
  verdict: string
  merkle_root: string
}

function sse(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, event: string, data: unknown) {
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
}

async function probeOfac(subject: string): Promise<{ count: number; sample: string[] }> {
  try {
    const proto = process.env.VERCEL_URL ? 'https' : 'http'
    const host = process.env.VERCEL_URL ?? 'localhost:3000'
    const r = await fetch(`${proto}://${host}/api/real/sanctions?q=${encodeURIComponent(subject)}`, { cache: 'no-store' })
    if (!r.ok) return { count: 0, sample: [] }
    const j = (await r.json()) as { matches?: Array<{ name?: string }>; total?: number }
    return { count: j.total ?? j.matches?.length ?? 0, sample: (j.matches ?? []).slice(0, 3).map(m => m.name ?? '').filter(Boolean) }
  } catch { return { count: 0, sample: [] } }
}

async function probeGleif(subject: string): Promise<{ lei?: string; legalName?: string; jurisdiction?: string } | null> {
  try {
    const r = await fetch(`https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=${encodeURIComponent(subject)}`, {
      headers: { Accept: 'application/vnd.api+json' },
    })
    if (!r.ok) return null
    type FuzzyHit = { relationships?: { 'lei-records'?: { data?: { id?: string } } }; attributes?: { value?: string } }
    const j = (await r.json()) as { data?: FuzzyHit[] }
    const top = j.data?.[0]
    if (!top?.relationships?.['lei-records']?.data?.id) return null
    const lei = top.relationships['lei-records'].data!.id!
    const legalName = top.attributes?.value
    const detail = await fetch(`https://api.gleif.org/api/v1/lei-records/${lei}`, { headers: { Accept: 'application/vnd.api+json' } })
    if (detail.ok) {
      type Detail = { data?: { attributes?: { entity?: { jurisdiction?: string } } } }
      const d = (await detail.json()) as Detail
      return { lei, legalName, jurisdiction: d.data?.attributes?.entity?.jurisdiction }
    }
    return { lei, legalName }
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { subject?: string }
  const subject = (body.subject ?? '').trim()
  if (!subject) return Response.json({ error: 'subject required' }, { status: 400 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      sse(controller, encoder, 'open', { subject, ts: new Date().toISOString() })

      // STAGE 1: Sanctions probe
      sse(controller, encoder, 'stage', { stage: 'sanctions', label: 'Sanctions Bot' })
      const ofac = await probeOfac(subject)
      sse(controller, encoder, 'finding', { stage: 'sanctions', text: ofac.count > 0
        ? `${ofac.count} OFAC SDN match(es) found${ofac.sample.length ? ': ' + ofac.sample.join(', ') : ''}`
        : 'No OFAC SDN matches' })

      // STAGE 2: GLEIF probe
      sse(controller, encoder, 'stage', { stage: 'gleif', label: 'Identity Bot' })
      const gleif = await probeGleif(subject)
      sse(controller, encoder, 'finding', { stage: 'gleif', text: gleif?.lei
        ? `LEI ${gleif.lei} · ${gleif.legalName ?? subject}${gleif.jurisdiction ? ' (' + gleif.jurisdiction + ')' : ''}`
        : 'No GLEIF entity match' })

      // STAGE 3: AI behavioural analysis (streaming)
      sse(controller, encoder, 'stage', { stage: 'swarm', label: 'Swarm Analysis' })
      const findings: string[] = []
      const ANALYST = `You are the GENESIS SWARM EYE — surveillance AI investigating an entity for operational/regulatory red flags. Output 5 forensic findings as a JSON array of strings. Each finding is ONE sentence. No markdown.`
      const aiPrompt = `Subject: "${subject}".
${gleif?.lei ? `GLEIF LEI: ${gleif.lei} (${gleif.jurisdiction ?? '?'})` : 'No GLEIF match.'}
${ofac.count > 0 ? `OFAC: ${ofac.count} matches.` : 'No OFAC matches.'}

Investigate. Cite specific concerns. If subject appears benign, say so honestly. Return JSON: {"findings": ["...", "...", ...], "verdict": "<one sentence>", "risk_level": "LOW|MODERATE|ELEVATED|CRITICAL", "sentiment_score": <0-100>}`

      let aiText = ''
      try {
        aiText = await groqChat({ system: ANALYST, user: aiPrompt, json: true, max_tokens: 700, temperature: 0.35 })
      } catch (e) {
        sse(controller, encoder, 'error', { stage: 'swarm', error: String(e) })
      }

      type AiOut = { findings?: string[]; verdict?: string; risk_level?: ScanArtifact['risk_level']; sentiment_score?: number }
      let parsed: AiOut = {}
      try { parsed = JSON.parse(aiText) as AiOut } catch { /* ignore */ }
      const swarmFindings = (parsed.findings ?? []).slice(0, 6)
      for (const f of swarmFindings) {
        findings.push(f)
        sse(controller, encoder, 'finding', { stage: 'swarm', text: f })
        await new Promise(r => setTimeout(r, 120))  // theatrical pacing
      }

      // STAGE 4: Final artifact
      const scannedAt = new Date().toISOString()
      const riskLevel = parsed.risk_level ?? 'MODERATE'
      const sentimentScore = parsed.sentiment_score ?? 50
      const verdict = parsed.verdict ?? 'Indeterminate — insufficient public signal.'

      const merkleParts = [
        `subject::${subject}`,
        `scanned_at::${scannedAt}`,
        `ofac_hits::${ofac.count}`,
        `gleif_lei::${gleif?.lei ?? ''}`,
        `risk::${riskLevel}`,
        `sentiment::${sentimentScore}`,
        `verdict::${verdict}`,
        ...swarmFindings.map((f, i) => `finding_${i}::${f}`),
      ]
      const root = await merkleRoot(merkleParts)
      const id = shortId(await sha256Hex(scannedAt + subject))

      const artifact: ScanArtifact = {
        id,
        subject,
        scanned_at: scannedAt,
        ofac_hits: ofac.count,
        gleif_match: gleif?.lei ? { lei: gleif.lei, legalName: gleif.legalName ?? subject, jurisdiction: gleif.jurisdiction } : undefined,
        sentiment_score: sentimentScore,
        risk_level: riskLevel,
        swarm_findings: swarmFindings,
        verdict,
        merkle_root: root,
      }

      await kv.set(`eye:${id}`, artifact, { ex: 60 * 60 * 24 * 365 })
      await kv.lpush('eye:log', { id, subject, scanned_at: scannedAt, risk_level: riskLevel, sentiment_score: sentimentScore })

      sse(controller, encoder, 'artifact', artifact)
      sse(controller, encoder, 'close', { id })
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

// Hint to suppress unused-import warning for groqStream (kept for future streaming variants)
void groqStream
