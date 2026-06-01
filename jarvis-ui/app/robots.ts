import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard', '/settings', '/onboard'],
      },
      // Block known scraper bots that don't add value
      {
        userAgent: ['CCBot', 'GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot'],
        // Note: we allow Google/Bing indexing via the catch-all above; we only
        // restrict the LLM-training-specific user agents.
        disallow: '/api/',
        allow: '/',
      },
    ],
    sitemap: 'https://genesis-swarm-rgq5.vercel.app/sitemap.xml',
    host: 'https://genesis-swarm-rgq5.vercel.app',
  }
}
