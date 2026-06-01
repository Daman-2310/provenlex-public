// Real prospectus ingestion pipeline.
//
// Flow: fetch a public fund-document PDF → extract text (unpdf) → ask Groq to
// pull structured regulatory claims → return them for storage in Supabase.
//
// This is the FIRST real document-data pipeline in Genesis. Unlike the
// synthetic Mirror model, these claims are extracted from actual published
// PDFs with the exact source sentence preserved as a quote.

import { extractText, getDocumentProxy } from 'unpdf'
import { groqChat } from '@/lib/groqClient'

export interface ExtractedClaim {
  metric: string
  label: string
  promised: number | null
  unit: string | null
  direction: 'min' | 'max' | null
  quote: string
  page_ref: number | null
  confidence: number
}

export interface IngestResult {
  ok: boolean
  source_url: string
  sha256: string
  page_count: number
  char_count: number
  claims: ExtractedClaim[]
  error?: string
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const EXTRACTION_SYSTEM = `You are a regulatory-disclosure extraction engine for EU funds and banks.
You receive raw text from a published fund document (prospectus, KIID/KID, annual report, Pillar 3, SFCR).
Extract every quantitative regulatory COMMITMENT or LIMIT the document states about itself.

Examples of claims to extract:
- "The Sub-Fund will not exceed 200% gross leverage" -> metric leverage_max, promised 200, unit %, direction max
- "Common Equity Tier 1 ratio of at least 12%" -> metric tier1_capital_ratio_min, promised 12, unit %, direction min
- "maximum 10% of net assets in a single issuer" -> metric concentration_single_issuer_max, promised 10, unit %, direction max
- "Solvency II ratio above 150%" -> metric solvency_ratio_min, promised 150, unit %, direction min
- "redemption notice of up to 30 business days" -> metric redemption_notice_days_max, promised 30, unit d, direction max

For each claim return:
  metric (snake_case machine key), label (human), promised (number), unit (% | x | d | bps | EUR_m | null),
  direction (min|max), quote (the EXACT sentence from the text), confidence (0-100).

Only extract claims with an explicit number. Do NOT invent values. If the document states no quantitative
commitments, return an empty array.

Return ONLY JSON: { "claims": [ ... ] }. No markdown.`

export async function fetchPdfText(url: string): Promise<{ text: string; pages: number; bytes: Uint8Array }> {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 20_000)
  const res = await fetch(url, {
    signal: ctrl.signal,
    headers: { 'User-Agent': 'Genesis-Swarm/1.0 (+https://genesis-swarm-rgq5.vercel.app)' },
  })
  clearTimeout(timeout)
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.length < 100) throw new Error('document too small / empty')

  const pdf = await getDocumentProxy(buf)
  const { text, totalPages } = await extractText(pdf, { mergePages: true })
  const merged = Array.isArray(text) ? text.join('\n') : text
  return { text: merged, pages: totalPages, bytes: buf }
}

export async function extractClaims(text: string, category?: string): Promise<ExtractedClaim[]> {
  // Cap text to keep token usage reasonable — claims usually appear in the
  // first ~40k chars (objectives, risk, investment-policy sections).
  const capped = text.slice(0, 40_000)
  const userPrompt = `Document category: ${category ?? 'unknown'}\n\nDOCUMENT TEXT:\n${capped}`
  let raw: string
  try {
    raw = await groqChat({
      system: EXTRACTION_SYSTEM,
      user: userPrompt,
      json: true,
      max_tokens: 2500,
      temperature: 0.1,
    })
  } catch {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as { claims?: ExtractedClaim[] }
    const claims = parsed.claims ?? []
    // Sanitise — drop claims without a numeric promised value
    return claims
      .filter(c => c.metric && typeof c.promised === 'number' && Number.isFinite(c.promised))
      .map(c => ({
        metric: String(c.metric).slice(0, 80),
        label: String(c.label ?? c.metric).slice(0, 120),
        promised: c.promised,
        unit: c.unit ? String(c.unit).slice(0, 12) : null,
        direction: c.direction === 'min' || c.direction === 'max' ? c.direction : null,
        quote: String(c.quote ?? '').slice(0, 600),
        page_ref: typeof c.page_ref === 'number' ? c.page_ref : null,
        confidence: typeof c.confidence === 'number' ? Math.max(0, Math.min(100, c.confidence)) : 60,
      }))
  } catch {
    return []
  }
}

export async function ingestDocument(url: string, category?: string): Promise<IngestResult> {
  try {
    const { text, pages, bytes } = await fetchPdfText(url)
    const sha = await sha256Hex(bytes)
    const claims = await extractClaims(text, category)
    return {
      ok: true,
      source_url: url,
      sha256: sha,
      page_count: pages,
      char_count: text.length,
      claims,
    }
  } catch (e) {
    return {
      ok: false,
      source_url: url,
      sha256: '',
      page_count: 0,
      char_count: 0,
      claims: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
