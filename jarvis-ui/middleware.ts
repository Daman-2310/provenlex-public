import { NextResponse, type NextRequest } from 'next/server'
import { refreshSupabaseSession } from '@/lib/supabase-middleware'

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' ws: wss: https:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ')

const SECURITY_HEADERS: ReadonlyArray<[string, string]> = [
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-XSS-Protection', '1; mode=block'],
  ['X-DNS-Prefetch-Control', 'off'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'],
  ['Content-Security-Policy', CSP_DIRECTIVES],
]

// Embed routes are meant to be iframed by third parties.
// They get their own permissive headers from the route handler itself.
function isEmbedRoute(pathname: string): boolean {
  return pathname.startsWith('/embed/')
}

// Embed-docs needs to iframe /embed/[lei] internally.
function isEmbedDocsRoute(pathname: string): boolean {
  return pathname.startsWith('/embed-docs')
}

const HSTS_HEADER: [string, string] = [
  'Strict-Transport-Security',
  'max-age=63072000; includeSubDomains; preload',
]

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE'])

const IDEMPOTENCY_EXEMPT_PREFIXES = ['/api/auth/', '/api/demo/reset', '/api/ai/', '/api/fund-score', '/api/live', '/api/real/', '/api/analyze/', '/api/report/', '/api/saved/', '/api/stripe/', '/api/alerts/', '/api/cron/', '/api/news', '/api/audit/', '/api/opinion/', '/api/slack/', '/api/benchmark', '/api/status', '/api/v1/', '/api/keys', '/api/gpt/', '/api/extension/', '/api/prophecy/', '/api/court/', '/api/eye/', '/api/protocol/', '/api/book/', '/api/vindicate/', '/api/daily/', '/api/bounty/', '/api/coalition/', '/api/federation/', '/api/mcp', '/api/predictions', '/api/whistleblower/', '/api/witness/', '/api/codex/', '/api/claim/', '/api/watchlist/', '/api/sentinel/', '/auth/', '/api/pillars/', '/api/mirror/', '/api/regulator-news', '/api/oracle']

function isIdempotencyExempt(pathname: string): boolean {
  return IDEMPOTENCY_EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

function problem(
  type: string,
  title: string,
  status: number,
  detail: string,
  instance: string,
): NextResponse {
  return NextResponse.json(
    { type, title, status, detail, instance },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const method = request.method
  const isApiRoute = pathname.startsWith('/api/')
  const isMutating = MUTATING_METHODS.has(method)

  if (isMutating && isApiRoute && !isIdempotencyExempt(pathname)) {
    const idempotencyKey = request.headers.get('X-Idempotency-Key')

    if (!idempotencyKey) {
      return problem(
        'https://genesis-swarm.io/problems/missing-idempotency-key',
        'Missing Idempotency Key',
        400,
        `${method} requests to ${pathname} require an X-Idempotency-Key header.`,
        pathname,
      )
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(idempotencyKey) && idempotencyKey.length < 16) {
      return problem(
        'https://genesis-swarm.io/problems/invalid-idempotency-key',
        'Invalid Idempotency Key',
        400,
        'X-Idempotency-Key must be a UUID v4 or at least 16 characters.',
        pathname,
      )
    }
  }

  const response = NextResponse.next()

  // Embed routes set their own permissive frame headers in the handler.
  // Skip the restrictive defaults for them.
  if (isEmbedRoute(pathname)) {
    response.headers.set('X-Request-ID', crypto.randomUUID())
    return response
  }

  for (const [key, value] of SECURITY_HEADERS) {
    if (key === 'X-Frame-Options' && isEmbedDocsRoute(pathname)) continue
    if (key === 'Content-Security-Policy' && isEmbedDocsRoute(pathname)) {
      // Allow embed-docs to iframe its own /embed/ children
      response.headers.set(key, value.replace("frame-src 'none'", "frame-src 'self'"))
      continue
    }
    response.headers.set(key, value)
  }

  if (process.env['NODE_ENV'] === 'production') {
    response.headers.set(...HSTS_HEADER)
  }

  response.headers.set('X-Request-ID', crypto.randomUUID())

  // Refresh Supabase session cookie if Supabase is configured. No-op otherwise.
  return refreshSupabaseSession(request, response)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$).*)',
  ],
}
