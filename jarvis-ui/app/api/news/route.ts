import { NextRequest } from 'next/server'
import { kv } from '@/lib/kv'

export const runtime = 'nodejs'

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const framework = url.searchParams.get('framework')?.toUpperCase()
  const source = url.searchParams.get('source')?.toUpperCase()
  const q = url.searchParams.get('q')?.toLowerCase()
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)

  const all = await kv.lrange<NewsItem>('news:items', 0, 199)
  let filtered = all
  if (framework) filtered = filtered.filter(n => n.frameworks?.some(f => f.toUpperCase() === framework))
  if (source) filtered = filtered.filter(n => n.source.toUpperCase() === source)
  if (q) filtered = filtered.filter(n => (n.title + ' ' + (n.summary ?? '')).toLowerCase().includes(q))

  // Sort by fetchedAt desc
  filtered.sort((a, b) => b.fetchedAt - a.fetchedAt)

  return Response.json({
    total: filtered.length,
    items: filtered.slice(0, limit),
    sources: ['CSSF', 'EBA', 'ESMA'],
    frameworks: ['DORA', 'AIFMD', 'UCITS', 'SFDR', 'MiFID', 'AML', 'Sanctions'],
  })
}
