// Real regulator press-feed ingestion.
//
// Pulls live RSS / Atom feeds from EU+UK financial supervisors and normalises
// them into a single typed list. This is the FIRST real-data pipeline in
// Genesis — used by the Sentinel Vesta bot and exposed publicly at
// /api/regulator-news.

export interface RegulatorItem {
  id: string                  // SHA-1 of url for stable cache key
  source: string              // 'CSSF' | 'BaFin' | 'ESMA' | 'FCA' | 'ECB' | 'EBA'
  title: string
  link: string
  published: string           // ISO timestamp
  summary: string             // first 280 chars of description
  category: string            // best-guess category from feed tags or fallback
}

export interface RegulatorFeed {
  source: string
  url: string
  category: string            // default category if items don't carry their own
}

// Public RSS / Atom endpoints. These are well-known stable public URLs.
export const REGULATOR_FEEDS: RegulatorFeed[] = [
  { source: 'CSSF', url: 'https://www.cssf.lu/en/category/news/feed/',                                                category: 'supervisory' },
  { source: 'BaFin', url: 'https://www.bafin.de/SiteGlobals/Functions/RSSFeed/EN/RSSNewsroom/RSSNewsroom.xml',         category: 'supervisory' },
  { source: 'ESMA', url: 'https://www.esma.europa.eu/news-and-publications/press-releases/rss.xml',                    category: 'supervisory' },
  { source: 'EBA',  url: 'https://www.eba.europa.eu/news-publications/news/_/jcr_content/rss.xml',                     category: 'banking' },
  { source: 'FCA',  url: 'https://www.fca.org.uk/news/rss.xml',                                                         category: 'supervisory' },
]

async function sha1Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hash = await crypto.subtle.digest('SHA-1', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function pickTag(xml: string, tag: string): string {
  // Loose tag picker — handles CDATA + nested tags. Returns first match content.
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = xml.match(re)
  if (!m) return ''
  let val = m[1]
  const cdata = val.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  if (cdata) val = cdata[1]
  return val.trim()
}

function pickItems(xml: string): string[] {
  // RSS uses <item>, Atom uses <entry>
  const items: string[] = []
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi
  const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/gi
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml)) !== null) items.push(m[1])
  if (items.length === 0) {
    while ((m = entryRe.exec(xml)) !== null) items.push(m[1])
  }
  return items
}

function pickLink(itemXml: string): string {
  // RSS: <link>https://...</link>. Atom: <link href="..."/>.
  const explicit = pickTag(itemXml, 'link')
  if (explicit && !explicit.startsWith('<')) return explicit
  const m = itemXml.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/)
  return m ? m[1] : ''
}

function pickDate(itemXml: string): string {
  const candidates = ['pubDate', 'published', 'updated', 'dc:date']
  for (const tag of candidates) {
    const raw = pickTag(itemXml, tag)
    if (raw) {
      const d = new Date(raw)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }
  return new Date().toISOString()
}

async function fetchOne(feed: RegulatorFeed, limit: number): Promise<RegulatorItem[]> {
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Genesis-Swarm/1.0 (+https://genesis-swarm-rgq5.vercel.app)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      // Cache for 15 min at the CDN edge
      next: { revalidate: 900 },
    })
    clearTimeout(timeout)
    if (!res.ok) return []
    const text = await res.text()
    const items = pickItems(text).slice(0, limit)
    const out: RegulatorItem[] = []
    for (const itemXml of items) {
      const title = stripHtml(pickTag(itemXml, 'title'))
      if (!title) continue
      const link = pickLink(itemXml)
      const descRaw = pickTag(itemXml, 'description') || pickTag(itemXml, 'summary') || pickTag(itemXml, 'content')
      const summary = stripHtml(descRaw).slice(0, 280)
      const published = pickDate(itemXml)
      const id = await sha1Hex(`${feed.source}:${link || title}`)
      out.push({
        id,
        source: feed.source,
        title,
        link,
        published,
        summary,
        category: feed.category,
      })
    }
    return out
  } catch {
    return []
  }
}

export async function fetchAllRegulatorNews(limitPerFeed = 8): Promise<RegulatorItem[]> {
  const all = await Promise.all(REGULATOR_FEEDS.map(f => fetchOne(f, limitPerFeed)))
  const flat = all.flat()
  // newest first
  return flat.sort((a, b) => b.published.localeCompare(a.published))
}

// Filter items by entity-name match (case-insensitive substring) for Sentinel
// Vesta bot — used when surfacing items "about" a given Book entity.
export function filterByEntityMention(items: RegulatorItem[], entityNames: string[]): RegulatorItem[] {
  const haystacks = items.map(it => ({ it, hay: (it.title + ' ' + it.summary).toLowerCase() }))
  const hits: RegulatorItem[] = []
  for (const { it, hay } of haystacks) {
    for (const name of entityNames) {
      // Strip common suffixes to widen match
      const stripped = name.replace(/\b(S\.?A\.?|AG|GmbH|& Co\.|plc|N\.V\.|S\.p\.A\.|S\.A\.R\.L\.?|KGaA|Holding|Group|Bank|Limited)\b/gi, '').trim().toLowerCase()
      const head = stripped.split(/\s+/).slice(0, 3).join(' ')
      if (head.length < 5) continue
      if (hay.includes(head)) {
        hits.push(it)
        break
      }
    }
  }
  return hits
}
