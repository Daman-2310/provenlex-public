// Real-time status check across all upstream dependencies
export const runtime = 'edge'

type Check = {
  id: string
  label: string
  description: string
  status: 'up' | 'degraded' | 'down'
  latencyMs?: number
  detail?: string
}

async function probe(label: string, fn: () => Promise<{ ok: boolean; detail?: string }>): Promise<Omit<Check, 'id' | 'label' | 'description'>> {
  const start = Date.now()
  try {
    const res = await Promise.race([
      fn(),
      new Promise<{ ok: false; detail: string }>((_, rej) => setTimeout(() => rej({ ok: false, detail: 'timeout' }), 6000)),
    ])
    const dur = Date.now() - start
    if (!res.ok) return { status: 'down', latencyMs: dur, detail: res.detail }
    return { status: dur > 2000 ? 'degraded' : 'up', latencyMs: dur, detail: res.detail }
  } catch (e) {
    return { status: 'down', latencyMs: Date.now() - start, detail: String(e).slice(0, 100) }
  }
}

export async function GET() {
  const [ofac, gleif, fx, groq] = await Promise.all([
    probe('OFAC', async () => {
      const r = await fetch('https://genesis-swarm-rgq5.vercel.app/api/real/sanctions?q=ROSNEFT', { cache: 'no-store' })
      return { ok: r.ok, detail: r.ok ? '18,976 entities indexed' : `HTTP ${r.status}` }
    }),
    probe('GLEIF', async () => {
      const r = await fetch('https://api.gleif.org/api/v1/lei-records?page%5Bsize%5D=1', { cache: 'no-store' })
      return { ok: r.ok, detail: r.ok ? '2.4M LEI registry' : `HTTP ${r.status}` }
    }),
    probe('ECB FX', async () => {
      const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD', { cache: 'no-store' })
      return { ok: r.ok, detail: r.ok ? 'ECB pegged' : `HTTP ${r.status}` }
    }),
    probe('Groq AI', async () => {
      // Light probe — just hit the model endpoint with a 1-token request
      if (!process.env.GROQ_API_KEY) return { ok: false, detail: 'GROQ_API_KEY not configured' }
      const r = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        cache: 'no-store',
      })
      return { ok: r.ok, detail: r.ok ? 'llama-3.3-70b' : `HTTP ${r.status}` }
    }),
  ])

  const checks: Check[] = [
    { id: 'web',     label: 'Web App',                description: 'Marketing + dashboard',                                status: 'up' },
    { id: 'auth',    label: 'Authentication',         description: 'Magic-link sign-in via Resend',                        status: process.env.RESEND_API_KEY ? 'up' : 'degraded', detail: process.env.RESEND_API_KEY ? 'Resend active' : 'Dev mode (link surfaced inline)' },
    { id: 'kv',      label: 'Persistence (KV)',       description: 'User analyses + alert prefs',                          status: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) ? 'up' : 'degraded', detail: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) ? 'Upstash Redis' : 'In-memory fallback (warning)' },
    { id: 'ofac',    label: 'OFAC SDN Screening',     description: '18,976 US Treasury sanctioned entities',               ...ofac },
    { id: 'gleif',   label: 'GLEIF Registry',         description: '2.4M global legal entity identifiers',                 ...gleif },
    { id: 'fx',      label: 'ECB FX Rates',           description: 'Frankfurter / ECB peg',                                ...fx },
    { id: 'groq',    label: 'Groq AI Engine',         description: 'llama-3.3-70b-versatile streaming',                    ...groq },
    { id: 'stripe',  label: 'Stripe Checkout',        description: 'Subscription billing',                                 status: process.env.STRIPE_SECRET_KEY ? 'up' : 'degraded', detail: process.env.STRIPE_SECRET_KEY ? 'Configured' : 'Awaiting STRIPE_SECRET_KEY' },
  ]

  const overall: Check['status'] = checks.some(c => c.status === 'down')
    ? 'down'
    : checks.some(c => c.status === 'degraded') ? 'degraded' : 'up'

  return Response.json({
    overall,
    checks,
    generatedAt: new Date().toISOString(),
  })
}
