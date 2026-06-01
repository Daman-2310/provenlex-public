// Heartbeat cron — runs every 6h. Does two jobs:
//  1. Rescan sanctions for each subscriber's saved fund universe
//  2. Fetch latest regulatory news from RSS feeds, tag with AI relevance, store in KV
import { NextRequest } from 'next/server'
import { authorizeCron, getActiveSubscribers, sendSlackMessage, sendEmail } from '@/lib/cron'
import { kv } from '@/lib/kv'

export const runtime = 'nodejs'
export const maxDuration = 60

interface SavedAnalysis {
  id: string; fundName: string; complianceScore: number; verdict: string
  savedAt: number; fundType?: string; domicile?: string
}
interface AlertPreferences {
  email: string
  slackWebhook?: string
  emailAlerts: boolean
  dailyBriefing: boolean
  alertOnNewSanctions: boolean
}

const RSS_SOURCES = [
  { name: 'CSSF', url: 'https://www.cssf.lu/en/feed/', topics: ['CSSF', 'Luxembourg'] },
  { name: 'EBA',  url: 'https://www.eba.europa.eu/rss.xml', topics: ['EBA', 'Banking', 'EU'] },
  { name: 'ESMA', url: 'https://www.esma.europa.eu/rss.xml', topics: ['ESMA', 'Securities', 'EU'] },
]

// Minimal RSS/Atom parsing — extract <item><title>...<link>...<pubDate>...</description>
function parseRss(xml: string, source: string): Array<{ title: string; link: string; pubDate?: string; summary?: string; source: string }> {
  const items: Array<{ title: string; link: string; pubDate?: string; summary?: string; source: string }> = []
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml)) !== null && items.length < 20) {
    const body = m[1]
    const title = body.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() ?? ''
    const link  = body.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? ''
    const date  = body.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? ''
    const desc  = body.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.trim() ?? ''
    if (title && link) {
      items.push({
        title,
        link,
        pubDate: date,
        summary: desc.replace(/<[^>]+>/g, '').slice(0, 300),
        source,
      })
    }
  }
  return items
}

interface NewsItem {
  id: string
  source: string
  title: string
  link: string
  pubDate?: string
  summary?: string
  fetchedAt: number
  frameworks?: string[]
}

async function fetchAndStoreNews(): Promise<{ added: number; sources: number }> {
  let added = 0
  let sources = 0
  // Get existing IDs to dedupe
  const existing = await kv.lrange<NewsItem>('news:items', 0, 199)
  const existingLinks = new Set(existing.map(e => e.link))

  for (const src of RSS_SOURCES) {
    try {
      const res = await fetch(src.url, {
        headers: { 'User-Agent': 'GenesisSwarm-RegtechBot/1.0 (compliance research)' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      sources++
      const xml = await res.text()
      const items = parseRss(xml, src.name)
      for (const it of items) {
        if (existingLinks.has(it.link)) continue
        // Naive framework tagging from title/summary
        const combined = (it.title + ' ' + (it.summary ?? '')).toLowerCase()
        const frameworks: string[] = []
        if (/dora/i.test(combined)) frameworks.push('DORA')
        if (/aifmd|aif\b/i.test(combined)) frameworks.push('AIFMD')
        if (/ucits/i.test(combined)) frameworks.push('UCITS')
        if (/sfdr|esg|sustainabil/i.test(combined)) frameworks.push('SFDR')
        if (/mifid/i.test(combined)) frameworks.push('MiFID')
        if (/aml|money launder/i.test(combined)) frameworks.push('AML')
        if (/cssf/i.test(combined)) frameworks.push('CSSF')
        if (/sanction|ofac|consolidated/i.test(combined)) frameworks.push('Sanctions')

        const newsItem: NewsItem = {
          id: Buffer.from(it.link).toString('base64url').slice(0, 16),
          source: src.name,
          title: it.title,
          link: it.link,
          pubDate: it.pubDate,
          summary: it.summary,
          fetchedAt: Date.now(),
          frameworks: [...new Set([...frameworks, ...src.topics])],
        }
        await kv.lpush('news:items', newsItem)
        added++
      }
    } catch (e) {
      console.warn(`[heartbeat] news fetch failed for ${src.name}:`, e)
    }
  }
  return { added, sources }
}

async function rescanSanctions(origin: string): Promise<{ scanned: number; alerts: number }> {
  let scanned = 0
  let alerts = 0
  const emails = await getActiveSubscribers()
  for (const email of emails) {
    const prefs = await kv.get<AlertPreferences>(`user:${email}:alert-prefs`)
    if (!prefs?.alertOnNewSanctions) continue
    const analyses = await kv.lrange<SavedAnalysis>(`user:${email}:analyses`, 0, 49)
    if (analyses.length === 0) continue
    for (const a of analyses) {
      scanned++
      try {
        const res = await fetch(`${origin}/api/real/sanctions?q=${encodeURIComponent(a.fundName)}`, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) continue
        const data = await res.json()
        const matches = data.results ?? []
        const hot = matches.filter((m: { score?: number }) => (m.score ?? 0) >= 85)
        if (hot.length === 0) continue

        // Compare against last alert to dedupe
        const lastAlertKey = `user:${email}:alert-cache:${a.id}`
        const lastIds = (await kv.get<string[]>(lastAlertKey)) ?? []
        const newIds = hot.map((m: { id?: string; name?: string }) => m.id ?? m.name ?? '').filter(Boolean)
        const trulyNew = newIds.filter((id: string) => !lastIds.includes(id))
        if (trulyNew.length === 0) continue
        await kv.set(lastAlertKey, [...lastIds, ...trulyNew], { ex: 7 * 86400 })

        alerts++
        const text = `Sanctions hit on saved fund *${a.fundName}* — ${trulyNew.length} new matches on OFAC SDN. Open dashboard to review.`
        const dashboardUrl = `${origin}/dashboard`
        if (prefs.slackWebhook) {
          await sendSlackMessage(prefs.slackWebhook, text, [
            { type: 'section', text: { type: 'mrkdwn', text } },
            { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Dashboard' }, url: dashboardUrl }] },
          ])
        }
        if (prefs.emailAlerts) {
          await sendEmail(
            email,
            `[Genesis Swarm] Sanctions alert on ${a.fundName}`,
            `<div style="font-family:system-ui">
              <h2 style="color:#ff3366">Sanctions screening hit</h2>
              <p>Your saved fund <strong>${a.fundName}</strong> matched ${trulyNew.length} new entities on the US Treasury OFAC SDN list.</p>
              <p><a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#00cc6a;color:#000;text-decoration:none;border-radius:4px;font-weight:bold">Review in Dashboard →</a></p>
              <p style="color:#888;font-size:11px;margin-top:24px">Genesis Swarm RegTech AI · Luxembourg</p>
            </div>`,
            text,
          )
        }
      } catch (e) {
        console.warn(`[heartbeat] sanctions rescan failed for ${email}/${a.fundName}:`, e)
      }
    }
  }
  return { scanned, alerts }
}

export async function GET(req: NextRequest) {
  if (!(await authorizeCron(req))) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const origin = new URL(req.url).origin
  const [news, scan] = await Promise.all([fetchAndStoreNews(), rescanSanctions(origin)])
  return Response.json({
    ok: true,
    timestamp: new Date().toISOString(),
    news,
    sanctions: scan,
  })
}
