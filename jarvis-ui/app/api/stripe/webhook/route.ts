import { NextRequest } from 'next/server'
import { stripe } from '@/lib/stripe'
import { kv } from '@/lib/kv'
import Stripe from 'stripe'

export const runtime = 'nodejs'

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  if (!stripe || !WEBHOOK_SECRET) {
    return Response.json({ error: 'stripe webhook not configured' }, { status: 503 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) return Response.json({ error: 'missing signature' }, { status: 400 })

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET)
  } catch (e) {
    return Response.json({ error: 'invalid signature', detail: String(e) }, { status: 400 })
  }

  const writePlan = async (email: string, tier: string | null, customerId?: string) => {
    if (!email) return
    const key = `user:${email}:plan`
    if (tier) await kv.set(key, { tier, customerId, updatedAt: Date.now() })
    else await kv.del(key)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const sess = event.data.object as Stripe.Checkout.Session
      const email = sess.metadata?.email ?? sess.customer_email ?? ''
      const tier = sess.metadata?.tier ?? 'pro'
      const customerId = typeof sess.customer === 'string' ? sess.customer : sess.customer?.id
      await writePlan(email, tier, customerId)
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      try {
        const customer = await stripe.customers.retrieve(customerId)
        if (customer && !customer.deleted && customer.email) {
          await writePlan(customer.email, null)
        }
      } catch { /* swallow */ }
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      try {
        const customer = await stripe.customers.retrieve(customerId)
        const tier = sub.metadata?.tier ?? sub.items.data[0]?.price.nickname ?? 'pro'
        if (customer && !customer.deleted && customer.email) {
          await writePlan(customer.email, tier, customerId)
        }
      } catch { /* swallow */ }
      break
    }
  }
  return Response.json({ received: true })
}
