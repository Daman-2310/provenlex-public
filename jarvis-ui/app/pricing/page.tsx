'use client'
import { useState } from 'react'
import { CheckCircle, Zap, Shield, Globe, Loader2, Check } from 'lucide-react'

const TIERS = [
  {
    name: 'Starter',
    tier: 'starter',
    price: '€2,500',
    period: '/month',
    tagline: 'For single-fund boutiques',
    highlight: false,
    features: [
      '1 fund entity', 'DORA ICT Register builder', 'SFDR disclosure generator',
      'CSSF Audit Simulator', 'Compliance Certificate', 'Email support (48h SLA)',
      'PDF export', '14-day trial · cancel anytime',
    ],
    missing: ['Multi-fund dashboard', 'AML/Sanctions screener', 'Board report (AI)', 'Priority support', 'Custom branding'],
    cta: 'Subscribe',
    badge: null,
  },
  {
    name: 'Professional',
    tier: 'pro',
    price: '€5,000',
    period: '/month',
    tagline: 'For AIFMs and ManCos',
    highlight: true,
    features: [
      'Up to 5 fund entities', 'Everything in Starter',
      'Multi-fund portfolio dashboard', 'AML / Sanctions screener',
      'AI Board Report generator', 'Regulatory document checker',
      'CSSF Audit Simulator (full)', 'Priority support (4h SLA)',
      'Custom branding on certificates', 'DORA TLPT readiness module',
      'AIFMD II Annex IV templates',
    ],
    missing: ['Unlimited funds', 'Dedicated CSM', 'On-premise deployment'],
    cta: 'Subscribe',
    badge: 'Most popular',
  },
  {
    name: 'Enterprise',
    tier: 'enterprise',
    price: 'Custom',
    period: '',
    tagline: 'For asset managers & MFOs',
    highlight: false,
    features: [
      'Unlimited fund entities', 'Everything in Professional',
      'Dedicated Customer Success Manager', 'On-premise / VPC deployment',
      'API access (full v1)', 'Custom regulatory modules',
      'SLA guarantee (99.9% uptime)', 'CSSF liaison support',
      'White-label option', 'SOC 2 Type II report on request',
      'Quarterly compliance review calls',
    ],
    missing: [],
    cta: 'Contact sales',
    badge: null,
  },
]

// 'yes' renders as a check icon; '—' is a literal dash; anything else is text.
const COMPARE = [
  { feature: 'Fund entities', starter: '1', pro: 'Up to 5', enterprise: 'Unlimited' },
  { feature: 'DORA ICT Register', starter: 'yes', pro: 'yes', enterprise: 'yes' },
  { feature: 'SFDR Generator', starter: 'yes', pro: 'yes', enterprise: 'yes' },
  { feature: 'CSSF Audit Simulator', starter: 'Basic', pro: 'Full', enterprise: 'Full + custom' },
  { feature: 'Multi-fund dashboard', starter: '—', pro: 'yes', enterprise: 'yes' },
  { feature: 'AML / Sanctions screener', starter: '—', pro: 'yes', enterprise: 'yes' },
  { feature: 'AI Board Report', starter: '—', pro: 'yes', enterprise: 'yes' },
  { feature: 'Document checker', starter: '—', pro: 'yes', enterprise: 'yes' },
  { feature: 'API access', starter: '—', pro: 'Read-only', enterprise: 'Full' },
  { feature: 'Support SLA', starter: '48h', pro: '4h', enterprise: '1h + CSM' },
  { feature: 'Custom branding', starter: '—', pro: 'yes', enterprise: 'White-label' },
  { feature: 'On-premise / VPC', starter: '—', pro: '—', enterprise: 'yes' },
]

function CompareCell({ value }: { value: string }) {
  if (value === 'yes') return <Check className="w-3.5 h-3.5 inline" aria-label="included" />
  return <>{value}</>
}

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function subscribe(tier: string) {
    if (tier === 'enterprise') {
      window.location.href = 'mailto:daman.sharma.2310@gmail.com?subject=Genesis%20Swarm%20Enterprise%20-%20intro'
      return
    }
    setLoading(tier); setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ tier }),
      })
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent('/pricing')}`
        return
      }
      const json = await res.json()
      if (res.status === 503) {
        setError('Self-serve checkout coming soon. Email daman.sharma.2310@gmail.com for a 90-day pilot now.')
        return
      }
      if (!res.ok) {
        setError(json.message ?? json.error ?? 'Checkout error')
        return
      }
      if (json.url) window.location.href = json.url
    } catch (e) {
      setError('Network error. Try again, or email daman.sharma.2310@gmail.com')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#050508] text-[#00ff88] font-mono overflow-x-hidden">
      <div className="scanline pointer-events-none fixed inset-0 z-50" />

      {/* Nav */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b border-[rgba(0,255,136,0.12)]" style={{ background: 'rgba(5,5,8,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <a href="/operator" className="font-bold tracking-[0.2em] text-sm uppercase hover:opacity-80">Genesis Swarm</a>
          <span className="text-[rgba(0,255,136,0.4)] text-[10px] tracking-widest hidden sm:block">// Pricing</span>
        </div>
        <a href="/operator" className="text-[9px] uppercase tracking-wider px-3 py-1.5 border border-[rgba(0,255,136,0.3)] text-[#00ff88] rounded hover:bg-[rgba(0,255,136,0.08)] transition-colors">← Dashboard</a>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-16">
        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="text-[9px] uppercase tracking-[0.4em] text-[rgba(0,255,136,0.5)]">Transparent · No hidden fees</div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">RegTech that pays for itself</h1>
          <p className="text-[rgba(255,255,255,0.45)] text-base max-w-xl mx-auto leading-relaxed">One CSSF fine covers years of Genesis Swarm. Most Luxembourg funds spend €80k–€200k per year on compliance consultants. We cost a fraction.</p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded text-[10px] uppercase tracking-wider font-bold" style={{ background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.35)', color: '#ffaa00' }}>
            <Zap className="w-3.5 h-3.5" /> DORA deadline: 17 Jan 2025 — Luxembourg enforcement ongoing
          </div>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {TIERS.map(t => (
            <div key={t.name} className="rounded-lg p-6 space-y-5 flex flex-col relative" style={{
              background: t.highlight ? 'rgba(0,255,136,0.05)' : 'rgba(0,255,136,0.02)',
              border: t.highlight ? '2px solid rgba(0,255,136,0.5)' : '1px solid rgba(0,255,136,0.15)',
              boxShadow: t.highlight ? '0 0 40px rgba(0,255,136,0.1)' : 'none',
            }}>
              {t.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[8px] uppercase tracking-widest font-black" style={{ background: '#00ff88', color: '#050508' }}>{t.badge}</div>
              )}
              <div>
                <div className="text-[9px] uppercase tracking-widest text-[rgba(0,255,136,0.5)] mb-1">{t.tagline}</div>
                <div className="text-xl font-black text-white">{t.name}</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-black" style={{ color: t.highlight ? '#00ff88' : 'rgba(255,255,255,0.9)' }}>{t.price}</span>
                  {t.period && <span className="text-[rgba(255,255,255,0.35)] text-xs">{t.period}</span>}
                </div>
              </div>

              <div className="space-y-1.5 flex-1">
                {t.features.map(f => (
                  <div key={f} className="flex items-start gap-2 text-[10px] text-[rgba(255,255,255,0.65)]">
                    <CheckCircle className="w-3 h-3 text-[#00ff88] shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </div>
                ))}
                {t.missing.map(f => (
                  <div key={f} className="flex items-start gap-2 text-[10px] text-[rgba(255,255,255,0.2)]">
                    <span className="w-3 h-3 shrink-0 mt-0.5 text-center">—</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => subscribe(t.tier)} disabled={loading !== null} className="w-full block text-center py-3 rounded font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-60" style={{
                background: t.highlight ? 'rgba(0,255,136,0.15)' : 'rgba(0,255,136,0.06)',
                border: `1px solid ${t.highlight ? 'rgba(0,255,136,0.6)' : 'rgba(0,255,136,0.25)'}`,
                color: '#00ff88',
                boxShadow: t.highlight ? '0 0 20px rgba(0,255,136,0.15)' : 'none',
              }}>
                {loading === t.tier ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening checkout…</> : t.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Comparison table */}
        <div>
          <h2 className="text-lg font-bold tracking-tight mb-6 text-center text-white">Full feature comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-[rgba(0,255,136,0.15)]">
                  <th className="text-left py-3 px-4 text-[rgba(0,255,136,0.5)] uppercase tracking-widest font-bold w-1/3">Feature</th>
                  <th className="text-center py-3 px-4 text-[rgba(0,255,136,0.5)] uppercase tracking-widest font-bold">Starter</th>
                  <th className="text-center py-3 px-4 text-[#00ff88] uppercase tracking-widest font-bold">Professional</th>
                  <th className="text-center py-3 px-4 text-[rgba(0,255,136,0.5)] uppercase tracking-widest font-bold">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row, i) => (
                  <tr key={row.feature} className="border-b border-[rgba(0,255,136,0.06)]" style={{ background: i % 2 === 0 ? 'rgba(0,255,136,0.01)' : 'transparent' }}>
                    <td className="py-2.5 px-4 text-[rgba(255,255,255,0.6)]">{row.feature}</td>
                    <td className="py-2.5 px-4 text-center text-[rgba(255,255,255,0.4)]"><CompareCell value={row.starter} /></td>
                    <td className="py-2.5 px-4 text-center text-[#00ff88] font-bold"><CompareCell value={row.pro} /></td>
                    <td className="py-2.5 px-4 text-center text-[rgba(255,255,255,0.4)]"><CompareCell value={row.enterprise} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trust bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 py-8 border-t border-b border-[rgba(0,255,136,0.1)]">
          {[
            { icon: Shield, title: '90-day pilot', body: 'No commitment. Cancel any time. Full access from day one.' },
            { icon: Globe, title: 'Luxembourg-native', body: 'Built specifically for CSSF, DORA, AIFMD II, and SFDR frameworks.' },
            { icon: Zap, title: 'Live in 24h', body: 'No lengthy onboarding. You get compliance output on day one.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-3 p-4 rounded" style={{ background: 'rgba(0,255,136,0.02)', border: '1px solid rgba(0,255,136,0.1)' }}>
              <Icon className="w-5 h-5 text-[#00ff88] shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-white text-sm mb-1">{title}</div>
                <div className="text-[rgba(255,255,255,0.4)] text-[11px] leading-relaxed">{body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded p-3 text-center text-[11px]" style={{ background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.35)', color: '#ffaa00' }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <div className="text-center space-y-4">
          <p className="text-[rgba(255,255,255,0.4)] text-sm">Questions? Talk to the founding team directly.</p>
          <a href="/trial" className="inline-flex items-center gap-2 px-8 py-3.5 rounded font-bold text-sm uppercase tracking-wider transition-all" style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.6)', color: '#00ff88', boxShadow: '0 0 30px rgba(0,255,136,0.15)' }}>
            <Zap className="w-4 h-4" /> Request 90-day pilot
          </a>
        </div>
      </div>
    </div>
  )
}
