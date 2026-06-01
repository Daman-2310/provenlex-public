import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { stripe, isStripeConfigured } from '@/lib/stripe'
import { kv } from '@/lib/kv'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  if (!isStripeConfigured() || !stripe) {
    return Response.json({ error: 'stripe_not_configured' }, { status: 503 })
  }

  // Look up the customer ID from our KV plan record
  const planRecord = await kv.get<{ customerId?: string }>(`user:${session.email}:plan`)
  let customerId = planRecord?.customerId

  // Fall back: search Stripe by email if no record yet
  if (!customerId) {
    try {
      const list = await stripe.customers.list({ email: session.email, limit: 1 })
      customerId = list.data[0]?.id
    } catch { /* swallow */ }
  }

  if (!customerId) {
    return Response.json({ error: 'no_subscription_found' }, { status: 404 })
  }

  const origin = new URL(req.url).origin
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard`,
    })
    return Response.json({ url: portal.url })
  } catch (e) {
    return Response.json({ error: 'portal_error', detail: String(e) }, { status: 500 })
  }
}
