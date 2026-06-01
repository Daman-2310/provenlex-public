import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { stripe, PRICE_IDS, isStripeConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.email) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  if (!isStripeConfigured() || !stripe) {
    return Response.json({
      error: 'stripe_not_configured',
      message: 'Set STRIPE_SECRET_KEY + STRIPE_PRICE_STARTER + STRIPE_PRICE_PRO env vars on Vercel.',
    }, { status: 503 })
  }

  let body: { tier?: string }
  try { body = await req.json() } catch { return Response.json({ error: 'invalid json' }, { status: 400 }) }
  const tier = (body.tier ?? 'pro').toLowerCase()

  if (tier === 'enterprise') {
    // Enterprise is sales-led, not self-serve
    return Response.json({
      error: 'enterprise_contact_sales',
      message: 'Enterprise plan requires a sales conversation. Email daman.sharma.2310@gmail.com',
    }, { status: 400 })
  }

  const priceId = PRICE_IDS[tier]
  if (!priceId) {
    return Response.json({
      error: 'price_not_configured',
      message: `Set STRIPE_PRICE_${tier.toUpperCase()} env var on Vercel.`,
    }, { status: 503 })
  }

  const origin = new URL(req.url).origin
  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: session.email,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      subscription_data: {
        trial_period_days: 14,
        metadata: { tier, email: session.email },
      },
      success_url: `${origin}/dashboard?upgraded=${tier}`,
      cancel_url: `${origin}/pricing`,
      metadata: { email: session.email, tier },
    })
    return Response.json({ url: checkout.url, id: checkout.id })
  } catch (e) {
    return Response.json({ error: 'stripe_error', detail: String(e) }, { status: 500 })
  }
}
