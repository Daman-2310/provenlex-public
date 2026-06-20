import type { MetadataRoute } from 'next'

const BASE = 'https://provenlex.vercel.app'

// Only the real, live, honest pages are advertised to search engines.
// The retired theater routes (book / watchlist / obituary / mirror / twin /
// oracle / predictions / globe …) now redirect to /scan and are deliberately
// excluded — we don't want Google indexing redirect stubs or fabricated content.
const STATIC_PAGES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '',                                            priority: 1.0, changeFrequency: 'weekly' },
  { path: '/scan',                                       priority: 1.0, changeFrequency: 'weekly' },
  { path: '/deterministic',                              priority: 0.9, changeFrequency: 'monthly' },
  { path: '/ruleset',                                    priority: 0.9, changeFrequency: 'monthly' },
  { path: '/shadow',                                     priority: 0.8, changeFrequency: 'monthly' },
  { path: '/vault',                                      priority: 0.8, changeFrequency: 'monthly' },
  { path: '/verify',                                     priority: 0.8, changeFrequency: 'monthly' },
  { path: '/screening',                                  priority: 0.8, changeFrequency: 'monthly' },
  { path: '/lux',                                        priority: 0.8, changeFrequency: 'monthly' },
  { path: '/security',                                   priority: 0.8, changeFrequency: 'monthly' },
  { path: '/aifmd',                                      priority: 0.7, changeFrequency: 'monthly' },
  { path: '/dora',                                       priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs',                                       priority: 0.7, changeFrequency: 'monthly' },
  { path: '/pricing',                                    priority: 0.7, changeFrequency: 'monthly' },
  { path: '/research',                                   priority: 0.7, changeFrequency: 'monthly' },
  { path: '/research/report-01-aifmd2-readiness',        priority: 0.8, changeFrequency: 'monthly' },
  { path: '/research/note-02-extraction-is-the-hard-part', priority: 0.7, changeFrequency: 'yearly' },
  { path: '/playground',                                 priority: 0.8, changeFrequency: 'monthly' },
  { path: '/research/note-01-consistent-isnt-compliant', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/about',                                      priority: 0.6, changeFrequency: 'monthly' },
  { path: '/legal',                                      priority: 0.4, changeFrequency: 'yearly' },
  { path: '/privacy',                                    priority: 0.4, changeFrequency: 'yearly' },
  { path: '/terms',                                      priority: 0.4, changeFrequency: 'yearly' },
  { path: '/dpa',                                        priority: 0.4, changeFrequency: 'yearly' },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return STATIC_PAGES.map(p => ({
    url: `${BASE}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))
}
