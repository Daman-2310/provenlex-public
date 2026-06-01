// Sentinel live feed — mix of REAL regulator press items (Vesta bot) +
// templated postings for the other eleven bots.
//
// Vesta is now backed by live CSSF/BaFin/ESMA/EBA/FCA RSS feeds — those
// postings are sourced from actual regulator press releases, not templates.
// The other bots remain template-driven until their respective data
// pipelines are productionised.

import { BOTS, generateRecentPostings } from '@/lib/sentinel'
import { fetchAllRegulatorNews } from '@/lib/regulator-feeds'
import type { RegulatorItem } from '@/lib/regulator-feeds'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'

export const runtime = 'edge'

interface Posting {
  bot_id: string
  bot_name: string
  bot_role: string
  bot_color: string
  bot_glyph: string
  timestamp: string
  text: string
  entity_name: string
  entity_pci: number
  source_url?: string   // present when the posting cites a real regulator URL
}

function vestaPostingFromRegulatorItem(item: RegulatorItem): Posting {
  const vesta = BOTS.find(b => b.id === 'vesta')!
  // Try to match the item to a Book entity by name keyword
  const lowered = (item.title + ' ' + item.summary).toLowerCase()
  let entity = BOOK_SNAPSHOT_ENTRIES.find(e => {
    const head = e.candidate.name.split(/[ ,]/)[0].toLowerCase()
    return head.length >= 5 && lowered.includes(head)
  })
  if (!entity) {
    // Fallback — pick by source jurisdiction
    const jurMap: Record<string, string> = { CSSF: 'LU', BaFin: 'DE', ESMA: 'EU', EBA: 'EU', FCA: 'GB' }
    const jur = jurMap[item.source]
    entity = BOOK_SNAPSHOT_ENTRIES.find(e => e.candidate.jurisdiction === jur) ?? BOOK_SNAPSHOT_ENTRIES[0]
  }
  return {
    bot_id: vesta.id,
    bot_name: vesta.name,
    bot_role: vesta.role,
    bot_color: vesta.color,
    bot_glyph: vesta.avatar_glyph,
    timestamp: item.published,
    text: `[${item.source}] ${item.title}${item.summary ? ' · ' + item.summary.slice(0, 200) : ''}`,
    entity_name: entity.candidate.name,
    entity_pci: entity.pre_crime_index,
    source_url: item.link || undefined,
  }
}

export async function GET() {
  const now = Date.now()

  // 1. Real regulator news → Vesta postings
  const realPostings: Posting[] = []
  try {
    const news = await fetchAllRegulatorNews(6)
    for (const item of news.slice(0, 24)) {
      realPostings.push(vestaPostingFromRegulatorItem(item))
    }
  } catch {
    // RSS feeds may be unreachable; fall through to templated only
  }

  // 2. Templated postings for the 11 non-Vesta bots
  const templated = generateRecentPostings(now, 360).filter(p => p.bot_id !== 'vesta').slice(0, 60)

  // 3. Merge + sort newest-first
  const all: Posting[] = [...realPostings, ...templated]
  all.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return Response.json(
    {
      generated_at: new Date(now).toISOString(),
      total: all.length,
      real_count: realPostings.length,
      templated_count: templated.length,
      postings: all.slice(0, 80),
    },
    { headers: { 'Cache-Control': 'public, max-age=20, s-maxage=20' } },
  )
}
