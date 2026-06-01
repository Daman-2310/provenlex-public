import type { MetadataRoute } from 'next'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'
import { OBITUARIES } from '@/lib/obituaries'

const BASE = 'https://genesis-swarm-rgq5.vercel.app'

const STATIC_PAGES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '',                  priority: 1.0, changeFrequency: 'daily' },
  { path: '/watchlist',        priority: 1.0, changeFrequency: 'weekly' },
  { path: '/anchor',           priority: 0.9, changeFrequency: 'monthly' },
  { path: '/book',             priority: 0.9, changeFrequency: 'weekly' },
  { path: '/predictions',      priority: 0.9, changeFrequency: 'weekly' },
  { path: '/obituary',         priority: 0.9, changeFrequency: 'monthly' },
  { path: '/independence',     priority: 0.9, changeFrequency: 'yearly' },
  { path: '/research',         priority: 0.9, changeFrequency: 'monthly' },
  { path: '/research/foresight-01-cryptographic-pre-registration', priority: 0.8, changeFrequency: 'yearly' },
  { path: '/deck',             priority: 0.8, changeFrequency: 'monthly' },
  { path: '/mirror',           priority: 0.8, changeFrequency: 'weekly' },
  { path: '/network',          priority: 0.8, changeFrequency: 'weekly' },
  { path: '/twin',             priority: 0.8, changeFrequency: 'weekly' },
  { path: '/sentinel',         priority: 0.8, changeFrequency: 'daily' },
  { path: '/codex',            priority: 0.7, changeFrequency: 'monthly' },
  { path: '/globe',            priority: 0.7, changeFrequency: 'weekly' },
  { path: '/lookup',           priority: 0.7, changeFrequency: 'monthly' },
  { path: '/oracle',           priority: 0.7, changeFrequency: 'monthly' },
  { path: '/mcp',              priority: 0.7, changeFrequency: 'monthly' },
  { path: '/claim',            priority: 0.7, changeFrequency: 'monthly' },
  { path: '/pricing',          priority: 0.7, changeFrequency: 'monthly' },
  { path: '/about',            priority: 0.6, changeFrequency: 'monthly' },
  { path: '/investors',        priority: 0.7, changeFrequency: 'monthly' },
  { path: '/press',            priority: 0.7, changeFrequency: 'monthly' },
  { path: '/legal',            priority: 0.5, changeFrequency: 'yearly' },
  { path: '/privacy',          priority: 0.5, changeFrequency: 'yearly' },
  { path: '/terms',            priority: 0.5, changeFrequency: 'yearly' },
  { path: '/dpa',              priority: 0.5, changeFrequency: 'yearly' },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map(p => ({
    url: `${BASE}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))

  const bookEntries: MetadataRoute.Sitemap = BOOK_SNAPSHOT_ENTRIES.map(e => ({
    url: `${BASE}/book/${e.prophecy_id}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  const obituaryEntries: MetadataRoute.Sitemap = OBITUARIES.map(o => ({
    url: `${BASE}/obituary/${o.slug}`,
    lastModified: new Date(o.collapse_date),
    changeFrequency: 'yearly',
    priority: 0.7,
  }))

  const mirrorEntries: MetadataRoute.Sitemap = BOOK_SNAPSHOT_ENTRIES.map(e => ({
    url: `${BASE}/mirror/${e.prophecy_id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.5,
  }))

  const twinEntries: MetadataRoute.Sitemap = BOOK_SNAPSHOT_ENTRIES.map(e => ({
    url: `${BASE}/twin/${e.prophecy_id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.5,
  }))

  return [...staticEntries, ...bookEntries, ...obituaryEntries, ...mirrorEntries, ...twinEntries]
}
