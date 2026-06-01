// Vindication Engine — scans Google News RSS for material distress events on
// Book entities. Conservative multi-stage filter:
//   1. Headline must contain the entity name (fuzzy)
//   2. Headline must contain a strong distress signal verb
//   3. Headline must NOT contain exclusion phrases (victim, warns about, etc.)
//   4. Headline must NOT contain negation/recovery patterns
//   5. Entity name must precede the signal verb (subject-verb proximity)
//   6. Source must be a credible outlet
//   7. AI verification step: Groq classifies "is the entity itself in distress?"
//   8. Confidence >= 70 required to persist as VINDICATED
//
// Anything that fails any step is dropped silently (logged on `rejected` list).

import { kv } from '@/lib/kv'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'
import { groqChat } from '@/lib/groqClient'
import type { BookEntry } from '@/lib/book'

// ─── SIGNALS ──────────────────────────────────────────────────────────────

// STRONG signals — verbs/phrases that directly describe the entity in distress.
// Each entry is matched as a substring (case-insensitive) in the headline.
const STRONG_SIGNALS = [
  'files for bankruptcy', 'files bankruptcy', 'declares bankruptcy', 'in bankruptcy',
  'files for insolvency', 'declares insolvency', 'in insolvency', 'enters insolvency',
  'placed in administration', 'put in administration', 'enters administration',
  'fined', 'is fined', 'pays fine', 'penalty', 'sanctioned', 'sanctioning',
  'license revoked', 'license suspended', 'authorisation withdrawn',
  'enforcement action', 'cease and desist', 'cease-and-desist',
  'restated', 'restates earnings', 'restatement of accounts',
  'short report', 'short-seller report', 'short seller targets',
  'capital shortfall', 'liquidation', 'liquidated', 'wound up', 'wound down',
  'frozen by regulator', 'frozen by court', 'assets frozen',
  'suspends redemptions', 'redemption gates', 'gates redemptions',
  'ceo resigns', 'ceo arrested', 'chairman arrested', 'cfo resigns', 'cfo arrested',
  'forced sale', 'forced merger', 'emergency bailout', 'rescue package',
  'major loss', 'massive loss', 'multi-billion loss', 'multi-million fine',
  'subject of investigation', 'under investigation', 'criminal probe',
  'class action against', 'lawsuit against', 'sued by regulator', 'sued by clients',
  'collapsed', 'collapse of', 'collapses', 'goes bust', 'went bust',
  'misappropriation', 'embezzlement', 'ponzi scheme',
]

// EXCLUSIONS — phrases that almost always mean the entity is NOT the perpetrator/subject
const EXCLUSION_PHRASES = [
  'victim', 'victims', 'fraud victims',
  'warns about', 'warns of', 'warning about', 'warning of', 'warning from',
  'denies', 'denied', 'deny', 'rejects', 'rejected',
  'survives', 'survived', 'recovers', 'recovery', 'recovered', 'rebounds', 'bounces back',
  'beats expectations', 'beats forecast', 'tops estimates',
  'bid for', 'bids for', 'buys', 'acquires', 'to acquire', 'agrees to buy',
  'wins', 'won', 'awarded', 'launches', 'partners with',
  'former', 'ex-', 'ex ',
  'tools to detect', 'helps detect', 'spots', 'flagged',
  'no fraud', 'no collapse', 'no insolvency', 'no bankruptcy',
  'cleared of', 'cleared by',
  'reports', 'report from', 'study by', 'research by',
  'sponsors', 'sponsorship', 'donates', 'foundation', 'charity',
]

// NEGATION patterns — short qualifying phrases that flip meaning
const NEGATION_REGEX = /\b(no|not|never|denies|denied|cleared)\s+(of\s+)?(fraud|collapse|insolvency|bankruptcy|wrongdoing|wrong-doing)/i

// Credible-outlet domains (host suffix match)
const CREDIBLE_OUTLETS = [
  'reuters.com', 'ft.com', 'bloomberg.com', 'wsj.com', 'nytimes.com', 'cnbc.com',
  'cssf.lu', 'bafin.de', 'esma.europa.eu', 'fca.org.uk', 'ecb.europa.eu', 'eba.europa.eu',
  'handelsblatt.com', 'manager-magazin.de', 'lemonde.fr', 'lesechos.fr', 'agefi.fr',
  'corriere.it', 'ilsole24ore.com', 'expansion.com', 'volkskrant.nl', 'nrc.nl',
  'paperjam.lu', 'wort.lu', 'finextra.com', 'risk.net', 'thetimes.com', 'theguardian.com',
  'spiegel.de', 'sueddeutsche.de', 'faz.net', 'borsadrid.com',
  'reuters.co.uk', 'bloomberg.co.uk', 'spglobal.com', 'ratingsdirect.com',
]

// ─── TYPES ────────────────────────────────────────────────────────────────

export interface VindicationHit {
  prophecy_id: string
  subject: string
  pre_crime_index: number
  signal_words: string[]
  outlet: string
  headline: string
  url: string
  published_at: string
  detected_at: string
  confidence: number          // 0-100, AI-verified
  ai_reason: string           // one-sentence AI explanation
}

export interface RejectedHit {
  subject: string
  headline: string
  url: string
  reason: string
  detected_at: string
}

interface RssItem { title?: string; link?: string; pubDate?: string; description?: string }

// ─── RSS PARSING ──────────────────────────────────────────────────────────

function unescapeXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = []
  const itemBlocks = xml.split(/<item[\s>]/i).slice(1)
  for (const block of itemBlocks) {
    const closeIdx = block.indexOf('</item>')
    if (closeIdx < 0) continue
    const body = block.slice(0, closeIdx)
    const get = (tag: string) => {
      const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
      if (!m) return undefined
      let val = m[1].trim()
      val = val.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')
      return unescapeXml(val)
    }
    items.push({
      title: get('title'),
      link: get('link'),
      pubDate: get('pubDate'),
      description: get('description'),
    })
  }
  return items
}

async function fetchGoogleNewsRss(query: string): Promise<RssItem[]> {
  // Targeted distress query — tighter than the v1 "OR" sprawl
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8_000)
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GenesisVindicationEngine/2.0 (research)' },
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!res.ok) return []
    return parseRssItems(await res.text())
  } catch { return [] }
}

// ─── FILTERS ──────────────────────────────────────────────────────────────

function normalizeEntityName(name: string): string[] {
  // Generate match candidates: full name, name without legal suffixes, key tokens
  const base = name
    .replace(/\b(S\.A\.|S\.à r\.l\.|GmbH|AG|N\.V\.|plc|Ltd|Limited|LLC|S\.p\.A\.|Inc|Corp|Co\.|KGaA|& Co\.?|S\.A\.S\.|AB|A\/S|Oy|Abp)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  const tokens = base.split(/\s+/).filter(t => t.length >= 4 && !/^(the|for|and|of|de|du|la|le)$/i.test(t))
  const candidates = new Set([name.toLowerCase(), base.toLowerCase()])
  // Add first 1-3 distinctive tokens
  if (tokens.length >= 1) candidates.add(tokens.slice(0, Math.min(3, tokens.length)).join(' ').toLowerCase())
  if (tokens.length >= 1) candidates.add(tokens[0].toLowerCase())
  return Array.from(candidates).filter(c => c.length >= 3)
}

function headlineMentionsEntity(headline: string, name: string): { ok: boolean; index: number } {
  const lower = headline.toLowerCase()
  for (const candidate of normalizeEntityName(name)) {
    const idx = lower.indexOf(candidate)
    if (idx >= 0) return { ok: true, index: idx }
  }
  return { ok: false, index: -1 }
}

function findStrongSignal(headline: string): { signal: string; index: number } | null {
  const lower = headline.toLowerCase()
  for (const sig of STRONG_SIGNALS) {
    const idx = lower.indexOf(sig)
    if (idx >= 0) return { signal: sig, index: idx }
  }
  return null
}

function hasExclusionPhrase(headline: string): string | null {
  const lower = headline.toLowerCase()
  for (const phrase of EXCLUSION_PHRASES) {
    // Require word boundary on both ends so "ex-" only matches "ex-" not "exists"
    const re = new RegExp(`(^|\\b|[\\s,.-])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\b|[\\s,.-]|$)`, 'i')
    if (re.test(lower)) return phrase
  }
  return null
}

function hasNegation(headline: string): boolean {
  return NEGATION_REGEX.test(headline)
}

function subjectPrecedesSignal(entityIdx: number, signalIdx: number, headline: string): boolean {
  // Entity should appear before the signal verb within ~80 chars (roughly 12 words)
  if (entityIdx < 0 || signalIdx < 0) return false
  if (entityIdx >= signalIdx) return false
  const gap = signalIdx - entityIdx
  return gap < 80
}

function outletFromLink(link: string): { host: string; credible: boolean } {
  try {
    const u = new URL(link)
    const host = u.hostname.replace(/^www\./, '')
    for (const c of CREDIBLE_OUTLETS) {
      if (host.endsWith(c)) return { host: c, credible: true }
    }
    if (host === 'news.google.com') return { host: 'news.google.com', credible: true }
    return { host, credible: false }
  } catch { return { host: 'unknown', credible: false } }
}

// ─── AI VERIFICATION ──────────────────────────────────────────────────────

interface AiVerdict { matches: boolean; confidence: number; reason: string }

async function aiVerify(entity: string, headline: string): Promise<AiVerdict | null> {
  if (!process.env.GROQ_API_KEY) return null
  try {
    const sys = `You verify whether a news headline reports that a SPECIFIC NAMED ENTITY is currently in serious operational distress. Answer with strict JSON. No markdown.

A headline qualifies (matches=true, confidence 70-100) ONLY if it directly reports that the named entity:
  - is in insolvency/bankruptcy/liquidation OR
  - is fined/sanctioned by a regulator OR
  - has had license revoked/suspended OR
  - is the SUBJECT of a criminal investigation/enforcement action OR
  - has restated earnings/disclosed major loss / capital shortfall OR
  - has had top executives arrested or forced out for misconduct OR
  - has suspended redemptions / frozen client assets OR
  - has been publicly accused of fraud by a credible source (regulator, short-seller report, formal lawsuit)

A headline does NOT qualify (matches=false) if:
  - the entity is the VICTIM (e.g. "X clients defrauded", "fraud victims at X")
  - the entity is issuing a WARNING about others (e.g. "X warns about scam")
  - the entity is the ACQUIRER/RECOVERING party (e.g. "X bids for Y", "X recovers from crisis")
  - it's about a FORMER employee / ex-staff
  - it's a RESEARCH report ABOUT the sector, not about the entity itself
  - the headline only mentions the entity in passing context
  - it's marketing / sponsorship / charity coverage

Output JSON: {"matches": boolean, "confidence": integer 0-100, "reason": "one short sentence"}`

    const user = `Entity: "${entity}"
Headline: "${headline}"

Does this headline directly report the entity in serious operational distress? Return JSON.`

    const raw = await groqChat({ system: sys, user, json: true, max_tokens: 200, temperature: 0.1 })
    const parsed = JSON.parse(raw) as AiVerdict
    if (typeof parsed.matches !== 'boolean' || typeof parsed.confidence !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────

export interface SweepResult {
  checked: number
  hits: VindicationHit[]
  rejected: RejectedHit[]
  errors: string[]
}

export async function vindicationSweep(opts?: {
  limit?: number
  dryRun?: boolean
  skipAi?: boolean
  minConfidence?: number
}): Promise<SweepResult> {
  const limit = opts?.limit ?? BOOK_SNAPSHOT_ENTRIES.length
  const minConfidence = opts?.minConfidence ?? 70
  const entries = BOOK_SNAPSHOT_ENTRIES.slice(0, limit)
  const hits: VindicationHit[] = []
  const rejected: RejectedHit[] = []
  const errors: string[] = []
  let checked = 0

  for (const entry of entries) {
    checked++
    try {
      // Skip entries already vindicated this version
      const existing = await kv.get<VindicationHit>(`vindication:${entry.prophecy_id}`)
      if (existing) continue

      // Targeted distress query — high-precision verbs only
      const query = `"${entry.candidate.name}" (insolvency OR bankruptcy OR fined OR enforcement OR "ceo resigns" OR "ceo arrested" OR investigation OR restated OR "short report" OR sanctioned)`
      const items = await fetchGoogleNewsRss(query)

      for (const item of items.slice(0, 6)) {
        const headline = (item.title ?? '').trim()
        const link = item.link ?? ''
        if (!headline || !link) continue

        // Filter 1: entity name in headline
        const mention = headlineMentionsEntity(headline, entry.candidate.name)
        if (!mention.ok) {
          rejected.push({ subject: entry.candidate.name, headline, url: link, reason: 'entity name not in headline', detected_at: new Date().toISOString() })
          continue
        }

        // Filter 2: strong signal in headline
        const signal = findStrongSignal(headline)
        if (!signal) {
          rejected.push({ subject: entry.candidate.name, headline, url: link, reason: 'no strong distress signal in headline', detected_at: new Date().toISOString() })
          continue
        }

        // Filter 3: no exclusion phrase
        const excl = hasExclusionPhrase(headline)
        if (excl) {
          rejected.push({ subject: entry.candidate.name, headline, url: link, reason: `exclusion phrase: "${excl}"`, detected_at: new Date().toISOString() })
          continue
        }

        // Filter 4: no negation
        if (hasNegation(headline)) {
          rejected.push({ subject: entry.candidate.name, headline, url: link, reason: 'negation pattern detected', detected_at: new Date().toISOString() })
          continue
        }

        // Filter 5: subject-verb proximity (entity must precede signal)
        if (!subjectPrecedesSignal(mention.index, signal.index, headline)) {
          rejected.push({ subject: entry.candidate.name, headline, url: link, reason: 'entity does not precede signal verb', detected_at: new Date().toISOString() })
          continue
        }

        // Filter 6: credible outlet
        const outlet = outletFromLink(link)
        if (!outlet.credible) {
          rejected.push({ subject: entry.candidate.name, headline, url: link, reason: `non-credible outlet: ${outlet.host}`, detected_at: new Date().toISOString() })
          continue
        }

        // Filter 7: AI verification (gold standard)
        let confidence = 75
        let aiReason = 'pre-filter only (AI skipped)'
        if (!opts?.skipAi) {
          const verdict = await aiVerify(entry.candidate.name, headline)
          if (!verdict) {
            rejected.push({ subject: entry.candidate.name, headline, url: link, reason: 'AI verification failed/unavailable', detected_at: new Date().toISOString() })
            continue
          }
          if (!verdict.matches || verdict.confidence < minConfidence) {
            rejected.push({
              subject: entry.candidate.name, headline, url: link,
              reason: `AI rejection (confidence ${verdict.confidence}): ${verdict.reason}`,
              detected_at: new Date().toISOString(),
            })
            continue
          }
          confidence = verdict.confidence
          aiReason = verdict.reason
        }

        // PASSED ALL FILTERS — persist as a vindication
        const hit: VindicationHit = {
          prophecy_id: entry.prophecy_id,
          subject: entry.candidate.name,
          pre_crime_index: entry.pre_crime_index,
          signal_words: [signal.signal],
          outlet: outlet.host,
          headline: headline.slice(0, 250),
          url: link,
          published_at: item.pubDate ?? new Date().toISOString(),
          detected_at: new Date().toISOString(),
          confidence,
          ai_reason: aiReason,
        }

        hits.push(hit)
        if (!opts?.dryRun) {
          await kv.set(`vindication:${entry.prophecy_id}`, hit, { ex: 60 * 60 * 24 * 365 * 5 })
          await kv.lpush('vindication:log', hit)
        }
        break  // one hit per entity per sweep
      }

      // Politeness pause between entities
      await new Promise(r => setTimeout(r, 250))
    } catch (e) {
      errors.push(`${entry.candidate.name}: ${String(e).slice(0, 100)}`)
    }
  }

  return { checked, hits, rejected, errors }
}

export async function getVindicationsList(limit = 50): Promise<VindicationHit[]> {
  return await kv.lrange<VindicationHit>('vindication:log', 0, limit - 1)
}

export async function getVindicationForEntry(prophecyId: string): Promise<VindicationHit | null> {
  return await kv.get<VindicationHit>(`vindication:${prophecyId}`)
}

export async function decorateWithVindications<T extends BookEntry>(
  entries: T[],
): Promise<Array<T & { vindication?: VindicationHit }>> {
  const out: Array<T & { vindication?: VindicationHit }> = []
  for (const e of entries) {
    const v = await getVindicationForEntry(e.prophecy_id)
    out.push({ ...e, vindication: v ?? undefined })
  }
  return out
}

export async function clearAllVindications(): Promise<number> {
  // Clear log
  await kv.del('vindication:log')
  // Clear per-entry keys (best-effort over snapshot)
  let cleared = 0
  for (const e of BOOK_SNAPSHOT_ENTRIES) {
    const existing = await kv.get(`vindication:${e.prophecy_id}`)
    if (existing) {
      await kv.del(`vindication:${e.prophecy_id}`)
      cleared++
    }
  }
  return cleared
}
