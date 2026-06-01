import Stripe from 'stripe'

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY

export const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null

// Default placeholder price IDs — replace with real ones from Stripe dashboard
// Set these as Vercel env vars: STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_ENTERPRISE
export const PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
}

export const TIER_INFO = {
  starter:    { name: 'Starter',    amount: 9900,  display: '€99/mo' },
  pro:        { name: 'Pro',        amount: 49900, display: '€499/mo' },
  enterprise: { name: 'Enterprise', amount: 0,     display: 'Custom' },
}

export function isStripeConfigured(): boolean {
  return !!stripe
}
