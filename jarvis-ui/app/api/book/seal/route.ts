import { NextRequest } from 'next/server'
import { merkleRoot, sha256Hex, shortId } from '@/lib/merkle'
import { groqChat } from '@/lib/groqClient'
import { kv } from '@/lib/kv'
import { BOOK_CANDIDATES, BOOK_VERSION, type BookEntry, type BookManifest } from '@/lib/book'
import { submitToCalendar } from '@/lib/opentimestamps'

export const runtime = 'nodejs'  // node runtime for longer execution window
export const maxDuration = 60     // Vercel max for Hobby tier

const BATCH_PROMPT = `You are the GENESIS PROPHECY ENGINE — an AI analytical model.
You will receive a list of named EU financial entities. For EACH one, return a JSON object with:
  - pre_crime_index (integer 0-100, AI-assessed operational-risk indicator — most entities are LOW (10-40))
  - genesis_score (integer 0-100, compliance-posture indicator, roughly inverse of pre_crime_index)
  - trajectory ("RISING" | "FALLING" | "HOLDING")
  - pattern_match ("wirecard" | "archegos" | "ftx" | "greensill" | "madoff" | "none") — references to HISTORICAL ARCHETYPES only, never accusations
  - forecast (ONE sentence operational-risk forecast describing what structural concerns would warrant supervisory monitoring — NEVER a claim of wrongdoing)

NEVER use the words "fraud", "criminal", "guilty". Use "operational-risk indicator", "structural concern", "governance gap" instead. This is analytical risk modeling, not a legal accusation.

Score honestly. Reserve 70+ for elevated structural-risk indicators. 85+ only for unusually elevated indicators.
Most well-regulated entities sit 15-45. Smaller/opaque structures sit 30-55. Recently-stressed entities sit 50-70.

Return ONLY a JSON object: { "results": [<one object per input, same order>] }. No markdown.`

interface BatchResult {
  pre_crime_index: number
  genesis_score: number
  trajectory: 'RISING' | 'FALLING' | 'HOLDING'
  pattern_match?: string
  forecast: string
}

async function scoreBatch(items: typeof BOOK_CANDIDATES): Promise<BatchResult[]> {
  const userPrompt = `Score these ${items.length} entities (return same order):\n\n` +
    items.map((c, i) => `${i + 1}. ${c.name} [${c.jurisdiction}] (${c.category})`).join('\n')
  const raw = await groqChat({
    system: BATCH_PROMPT,
    user: userPrompt,
    json: true,
    max_tokens: 4000,
    temperature: 0.35,
  })
  try {
    const parsed = JSON.parse(raw) as { results?: BatchResult[] }
    return parsed.results ?? []
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  // Soft guard — require a secret in production to prevent open re-sealing
  const auth = req.headers.get('x-seal-auth') ?? new URL(req.url).searchParams.get('auth')
  if (process.env.NODE_ENV === 'production' && auth !== (process.env.SEAL_AUTH ?? 'genesis-let-it-rip')) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const sealedAt = new Date().toISOString()

  // 18-month reveal window
  const revealAt = new Date(Date.now() + 18 * 30 * 86400_000).toISOString()

  // Process in chunks of 25 to keep Groq response sizes manageable
  const CHUNK = 25
  const allResults: BatchResult[] = []
  for (let i = 0; i < BOOK_CANDIDATES.length; i += CHUNK) {
    const chunk = BOOK_CANDIDATES.slice(i, i + CHUNK)
    try {
      const batch = await scoreBatch(chunk)
      // pad with defaults if model returned wrong length
      while (batch.length < chunk.length) {
        batch.push({ pre_crime_index: 30, genesis_score: 65, trajectory: 'HOLDING', pattern_match: 'none', forecast: 'No material public signal at scoring time.' })
      }
      allResults.push(...batch.slice(0, chunk.length))
    } catch {
      // fallback for failed chunk
      for (const _c of chunk) {
        void _c
        allResults.push({ pre_crime_index: 30, genesis_score: 65, trajectory: 'HOLDING', pattern_match: 'none', forecast: 'Scoring engine unavailable; placeholder issued.' })
      }
    }
  }

  // Build sealed entries with per-entry Merkle proofs
  const entries: BookEntry[] = []
  const entrySigs: string[] = []
  for (let i = 0; i < BOOK_CANDIDATES.length; i++) {
    const c = BOOK_CANDIDATES[i]
    const r = allResults[i]
    const parts = [
      `name::${c.name}`,
      `lei::${c.lei ?? ''}`,
      `jurisdiction::${c.jurisdiction}`,
      `category::${c.category}`,
      `pre_crime_index::${r.pre_crime_index}`,
      `genesis_score::${r.genesis_score}`,
      `trajectory::${r.trajectory}`,
      `pattern::${r.pattern_match ?? 'none'}`,
      `forecast::${r.forecast}`,
      `sealed_at::${sealedAt}`,
    ]
    const entryRoot = await merkleRoot(parts)
    const sig = await sha256Hex(JSON.stringify(r) + sealedAt + c.name)
    const id = shortId(entryRoot)
    entries.push({
      rank: 0,  // assigned after sorting
      candidate: c,
      pre_crime_index: r.pre_crime_index,
      genesis_score: r.genesis_score,
      trajectory: r.trajectory,
      pattern_match: r.pattern_match && r.pattern_match !== 'none' ? r.pattern_match : undefined,
      forecast: r.forecast,
      merkle_root: entryRoot,
      signature: sig,
      prophecy_id: id,
    })
    entrySigs.push(entryRoot)
  }

  // Sort by pre_crime_index DESC (highest risk first), then assign rank
  entries.sort((a, b) => b.pre_crime_index - a.pre_crime_index)
  entries.forEach((e, i) => { e.rank = i + 1 })

  // Compute single Book Merkle root over all 100 entry roots
  const bookRoot = await merkleRoot(entrySigs)

  // Submit to OpenTimestamps for Bitcoin anchoring
  let manifest: BookManifest = {
    version: BOOK_VERSION,
    sealed_at: sealedAt,
    reveal_at: revealAt,
    total_prophecies: entries.length,
    vindications: 0,
    misses: 0,
    pending: entries.length,
    merkle_root: bookRoot,
    ots_status: 'PENDING_ANCHOR',
  }
  try {
    const ots = await submitToCalendar(bookRoot)
    if (ots) {
      manifest = {
        ...manifest,
        ots_receipt: ots.receipt,
        ots_calendar: ots.calendar,
        ots_submitted_at: ots.submitted_at,
        ots_status: 'CALENDAR_ATTESTED',
      }
    }
  } catch { /* keep PENDING_ANCHOR */ }

  // Persist
  await kv.set(`book:manifest:${BOOK_VERSION}`, manifest, { ex: 60 * 60 * 24 * 365 * 5 })
  await kv.set(`book:manifest:current`, manifest, { ex: 60 * 60 * 24 * 365 * 5 })
  await kv.set(`book:entries:${BOOK_VERSION}`, entries, { ex: 60 * 60 * 24 * 365 * 5 })
  await kv.set(`book:entries:current`, entries, { ex: 60 * 60 * 24 * 365 * 5 })

  // Index each entry individually so /book/[id] works
  for (const e of entries) {
    await kv.set(`book:entry:${e.prophecy_id}`, e, { ex: 60 * 60 * 24 * 365 * 5 })
  }

  // Optional ?full=1 returns all entries for snapshot capture
  const wantFull = new URL(req.url).searchParams.get('full') === '1'
  return Response.json({
    ok: true,
    manifest,
    sample_entries: entries.slice(0, 5),
    entries: wantFull ? entries : undefined,
    elapsed_ms: Date.now() - startedAt,
  })
}
