'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, LogOut, FileText, Plus, Trash2, Crown, Loader2, ArrowRight, Activity, CheckCircle2, Mail, Bell, BellOff, Slack, Newspaper, Save, Send, ShieldCheck, Code2, Copy, Key, Settings } from 'lucide-react'

interface User {
  authenticated: boolean
  email?: string
  plan?: string
  loggedInAt?: number
}

interface SavedAnalysis {
  id: string
  savedAt: number
  fundName: string
  fundType?: string
  domicile?: string
  complianceScore: number
  verdict: string
}

interface BenchmarkData {
  hasData: boolean
  myAvg: number
  percentile: number | null
  industryMedian: number
  top10: number
  totalFunds: number
  mode: string
}

interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: string[]
  rateLimit: number
  createdAt: number
  lastUsedAt?: number
}

interface AlertPreferences {
  email: string
  slackWebhook?: string
  emailAlerts: boolean
  dailyBriefing: boolean
  alertOnNewSanctions: boolean
  alertOnDoraDeadlines: boolean
  updatedAt: number
}

function PlanBadge({ plan }: { plan: string }) {
  const tiers: Record<string, { label: string; color: string }> = {
    starter:    { label: 'Starter',    color: '#4a9eff' },
    pro:        { label: 'Pro',        color: '#00ff88' },
    enterprise: { label: 'Enterprise', color: '#ffaa00' },
  }
  const t = tiers[plan] ?? tiers.starter
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.15em]"
      style={{ background: `${t.color}12`, border: `1px solid ${t.color}50`, color: t.color }}>
      <Crown className="w-2.5 h-2.5" /> {t.label}
    </span>
  )
}

function DashboardInner() {
  const router = useRouter()
  const params = useSearchParams()
  const upgraded = params.get('upgraded')

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<SavedAnalysis[]>([])
  const [persistence, setPersistence] = useState<'upstash' | 'memory'>('memory')
  const [upgradeBusy, setUpgradeBusy] = useState<string | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [prefs, setPrefs] = useState<AlertPreferences | null>(null)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsSaved, setPrefsSaved] = useState(false)
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [keyName, setKeyName] = useState('')
  const [keyCreating, setKeyCreating] = useState(false)
  const [newPlainKey, setNewPlainKey] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then((d: User) => {
      if (!d.authenticated) { router.push('/login'); return }
      setUser(d)
    }).finally(() => setLoading(false))
  }, [router])

  useEffect(() => {
    if (!user?.authenticated) return
    fetch('/api/saved/analyses').then(r => r.json()).then(d => {
      setItems(d.items ?? [])
      setPersistence(d.persistence ?? 'memory')
    })
    fetch('/api/alerts/preferences').then(r => r.json()).then(d => {
      if (d.prefs) setPrefs(d.prefs)
    })
    fetch('/api/benchmark').then(r => r.json()).then((d: BenchmarkData) => setBenchmark(d))
    fetch('/api/keys').then(r => r.json()).then(d => setApiKeys(d.items ?? []))
  }, [user])

  const savePrefs = useCallback(async () => {
    if (!prefs) return
    setPrefsSaving(true); setPrefsSaved(false)
    try {
      const res = await fetch('/api/alerts/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      })
      if (res.ok) { setPrefsSaved(true); setTimeout(() => setPrefsSaved(false), 2000) }
      else { const d = await res.json(); alert(d.message ?? d.error ?? 'Save failed') }
    } finally { setPrefsSaving(false) }
  }, [prefs])

  const testBriefing = useCallback(async () => {
    if (!confirm('Trigger daily briefing now? (will send to your email if Resend is configured)')) return
    const res = await fetch('/api/cron/daily-briefing')
    const d = await res.json()
    alert(d.sent ? `Briefing sent to ${d.sent} subscriber(s).` : `No emails sent. Reason: ${JSON.stringify(d).slice(0, 200)}`)
  }, [])

  const createApiKey = useCallback(async () => {
    setKeyCreating(true); setNewPlainKey(null)
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName || 'My API Key' }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error ?? 'Failed'); return }
      setNewPlainKey(d.key)
      // Refetch list
      const list = await fetch('/api/keys').then(r => r.json())
      setApiKeys(list.items ?? [])
      setKeyName('')
    } finally { setKeyCreating(false) }
  }, [keyName])

  const revokeApiKey = useCallback(async (id: string) => {
    if (!confirm('Revoke this API key? Any clients using it will start getting 401 errors.')) return
    await fetch(`/api/keys?id=${id}`, { method: 'DELETE' })
    const list = await fetch('/api/keys').then(r => r.json())
    setApiKeys(list.items ?? [])
  }, [])

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/saved/analyses?id=${id}`, { method: 'DELETE' })
    if (res.ok) setItems(items => items.filter(i => i.id !== id))
  }, [])

  const upgrade = useCallback(async (tier: string) => {
    setUpgradeBusy(tier)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const d = await res.json()
      if (d.url) { window.location.href = d.url; return }
      if (d.error === 'stripe_not_configured') {
        alert('Stripe not yet configured by admin. Email daman.sharma.2310@gmail.com to upgrade manually.')
        return
      }
      alert(d.message ?? d.error ?? 'Checkout failed')
    } finally { setUpgradeBusy(null) }
  }, [])

  const openPortal = useCallback(async () => {
    setPortalBusy(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const d = await res.json()
      if (d.url) { window.location.href = d.url; return }
      alert(d.error ?? 'Could not open billing portal')
    } finally { setPortalBusy(false) }
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050508] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#00ff88] animate-spin" />
      </div>
    )
  }
  if (!user?.authenticated) return null

  const plan = user.plan ?? 'starter'

  return (
    <div className="min-h-screen text-white" style={{
      background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)',
    }}>
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 flex items-center justify-between"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00aa55 100%)', boxShadow: '0 0 14px rgba(0,255,136,0.4)' }}>
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-black tracking-[0.15em] text-white">GENESIS SWARM</div>
            <div className="text-[8px] uppercase tracking-[0.25em] text-[#00ff88]">DASHBOARD</div>
          </div>
        </a>
        <div className="flex items-center gap-3">
          <a href="/operator" className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.7)] hover:text-white">
            <Activity className="w-3 h-3" /> Live Dashboard
          </a>
          <a href="/analyze" className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.7)] hover:text-white">
            <FileText className="w-3 h-3" /> Analyze
          </a>
          <a href="/audit" className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.7)] hover:text-white">
            <ShieldCheck className="w-3 h-3" /> Audit Pack
          </a>
          <a href="/intelligence" className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold text-[rgba(255,255,255,0.7)] hover:text-white">
            <Newspaper className="w-3 h-3" /> Intelligence
          </a>
          <button onClick={logout}
            className="p-2 rounded transition-all hover:bg-[rgba(255,51,102,0.08)]"
            style={{ border: '1px solid rgba(255,51,102,0.2)', color: 'rgba(255,51,102,0.6)' }}
            title="Sign out">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">

        {upgraded && (
          <div className="mb-6 rounded-xl p-4 flex items-center gap-3"
            style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.35)' }}>
            <CheckCircle2 className="w-5 h-5 text-[#00ff88]" />
            <div className="flex-1">
              <div className="font-black text-sm text-white">Welcome to {upgraded.charAt(0).toUpperCase() + upgraded.slice(1)}</div>
              <div className="text-[11px] text-[rgba(255,255,255,0.55)]">Your subscription is active — 14-day trial starts now.</div>
            </div>
          </div>
        )}

        {/* Account header */}
        <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[rgba(255,255,255,0.4)] mb-1">Signed in as</div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-white">{user.email}</h1>
              <PlanBadge plan={plan} />
            </div>
          </div>
          {plan !== 'starter' ? (
            <button onClick={openPortal} disabled={portalBusy}
              className="px-4 py-2 rounded text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}>
              {portalBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Settings className="w-3 h-3" />} Manage subscription
            </button>
          ) : (
            <button onClick={() => upgrade('pro')} disabled={upgradeBusy === 'pro'}
              className="px-4 py-2 rounded text-[10px] uppercase tracking-wider font-black flex items-center gap-1.5"
              style={{
                background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                color: '#000',
                boxShadow: '0 0 16px rgba(0,255,136,0.35)',
              }}>
              {upgradeBusy === 'pro' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crown className="w-3 h-3" />}
              Upgrade to Pro €499/mo
            </button>
          )}
        </div>

        {/* Persistence warning when in-memory */}
        {persistence === 'memory' && (
          <div className="mb-6 rounded-lg p-3 text-[10px] flex items-center gap-2"
            style={{ background: 'rgba(255,170,0,0.04)', border: '1px solid rgba(255,170,0,0.25)', color: '#ffaa00' }}>
            ⓘ <span>Persistence in transient memory — saved analyses will not survive server restarts. Provision Vercel KV (Upstash) to enable durable storage.</span>
          </div>
        )}

        {/* Industry Benchmark — percentile score */}
        {benchmark && benchmark.hasData && (
          <section className="mb-8">
            <div className="rounded-2xl p-6"
              style={{ background: 'linear-gradient(135deg, rgba(155,109,255,0.04) 0%, rgba(74,158,255,0.03) 100%)',
                       border: '1px solid rgba(155,109,255,0.3)',
                       boxShadow: '0 0 40px rgba(155,109,255,0.06)' }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[#9b6dff] font-black mb-1">INDUSTRY BENCHMARK</div>
                  <h2 className="text-2xl md:text-3xl font-black text-white">
                    You&apos;re at the{' '}
                    <span style={{ background: 'linear-gradient(90deg, #9b6dff, #4a9eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      {benchmark.percentile}{benchmark.percentile && benchmark.percentile >= 4 ? <sup className="text-base">th</sup> : null}
                    </span>{' '}
                    percentile
                  </h2>
                  <div className="text-[11px] text-[rgba(255,255,255,0.5)] mt-1">
                    among {benchmark.totalFunds} Luxembourg AIFMs tracked
                    {benchmark.mode === 'synthetic-baseline' && <span className="text-[#ffaa00] ml-1">(baseline)</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-black tabular-nums"
                    style={{ color: '#9b6dff', textShadow: '0 0 24px rgba(155,109,255,0.5)' }}>
                    {benchmark.myAvg}
                  </div>
                  <div className="text-[9px] uppercase tracking-widest text-[rgba(255,255,255,0.4)]">avg compliance</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[rgba(255,255,255,0.06)]">
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mb-1">Industry median</div>
                  <div className="text-lg font-black tabular-nums text-white">{benchmark.industryMedian}</div>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mb-1">Top 10%</div>
                  <div className="text-lg font-black tabular-nums text-[#00ff88]">{benchmark.top10}</div>
                </div>
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mb-1">Your gap to top 10%</div>
                  <div className="text-lg font-black tabular-nums text-[#ffaa00]">{(benchmark.top10 - benchmark.myAvg).toFixed(1)}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Saved analyses */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-black uppercase tracking-[0.15em] text-white">Saved Analyses</h2>
              <p className="text-[11px] text-[rgba(255,255,255,0.45)] mt-1">
                {items.length === 0 ? 'You haven\'t saved any fund analyses yet.' : `${items.length} fund${items.length === 1 ? '' : 's'} tracked`}
              </p>
            </div>
            <a href="/analyze"
              className="flex items-center gap-1.5 px-3 py-2 rounded text-[10px] uppercase tracking-wider font-bold"
              style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.35)', color: '#00ff88' }}>
              <Plus className="w-3 h-3" /> Analyse New Fund
            </a>
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl p-12 text-center"
              style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.08)' }}>
              <FileText className="w-10 h-10 mx-auto mb-3 text-[rgba(255,255,255,0.2)]" />
              <p className="text-[13px] text-[rgba(255,255,255,0.5)] mb-4">No analyses saved yet</p>
              <a href="/analyze"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-[11px] uppercase tracking-wider font-black"
                style={{
                  background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                  color: '#000',
                  boxShadow: '0 0 16px rgba(0,255,136,0.3)',
                }}>
                Drop your first prospectus <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map(item => {
                const color = item.complianceScore >= 80 ? '#00ff88' : item.complianceScore >= 60 ? '#ffaa00' : '#ff3366'
                return (
                  <div key={item.id} className="rounded-lg p-4 flex items-center gap-4"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-center shrink-0" style={{ minWidth: 60 }}>
                      <div className="font-black tabular-nums text-2xl" style={{ color, textShadow: `0 0 12px ${color}88` }}>
                        {item.complianceScore}
                      </div>
                      <div className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.3)]">/100</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-white truncate">{item.fundName}</div>
                      <div className="text-[10px] text-[rgba(255,255,255,0.4)] flex items-center gap-2 flex-wrap mt-0.5">
                        <span>{item.fundType ?? 'Fund'}</span>
                        {item.domicile && <><span>·</span><span>{item.domicile}</span></>}
                        <span>·</span>
                        <span>{new Date(item.savedAt).toLocaleDateString()}</span>
                      </div>
                      {item.verdict && (
                        <div className="text-[11px] text-[rgba(255,255,255,0.55)] mt-1 truncate">{item.verdict}</div>
                      )}
                    </div>
                    <button onClick={() => remove(item.id)}
                      className="p-2 rounded transition-all hover:bg-[rgba(255,51,102,0.08)]"
                      style={{ color: 'rgba(255,51,102,0.5)' }} title="Remove">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* API Keys */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-base font-black uppercase tracking-[0.15em] text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-[#4a9eff]" /> API Keys
              </h2>
              <p className="text-[11px] text-[rgba(255,255,255,0.45)] mt-1">
                Embed Genesis Swarm into your stack. Rate-limited by plan.
              </p>
            </div>
            <a href="/docs" className="flex items-center gap-1.5 px-3 py-2 rounded text-[10px] uppercase tracking-wider font-bold"
              style={{ background: 'rgba(74,158,255,0.08)', border: '1px solid rgba(74,158,255,0.35)', color: '#4a9eff' }}>
              <Code2 className="w-3 h-3" /> API Docs
            </a>
          </div>

          {newPlainKey && (
            <div className="rounded-xl p-4 mb-4"
              style={{ background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.4)', boxShadow: '0 0 24px rgba(255,170,0,0.08)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-3.5 h-3.5 text-[#ffaa00]" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-black text-[#ffaa00]">SAVE THIS KEY NOW</span>
              </div>
              <p className="text-[11px] text-[rgba(255,255,255,0.65)] mb-2">It will not be shown again.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-[12px] text-[#ffaa00] bg-[rgba(0,0,0,0.4)] px-3 py-2 rounded break-all"
                  style={{ border: '1px solid rgba(255,170,0,0.25)' }}>{newPlainKey}</code>
                <button onClick={() => { navigator.clipboard.writeText(newPlainKey); setNewPlainKey(null) }}
                  className="px-3 py-2 rounded text-[10px] uppercase tracking-wider font-bold"
                  style={{ background: 'rgba(255,170,0,0.15)', border: '1px solid rgba(255,170,0,0.45)', color: '#ffaa00' }}>
                  <Copy className="w-3 h-3 inline" /> Copy & close
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl p-4 mb-3"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex gap-2">
              <input type="text" value={keyName}
                onChange={e => setKeyName(e.target.value)}
                placeholder="Key name (e.g. 'Production', 'My laptop')"
                className="flex-1 bg-[rgba(0,0,0,0.4)] rounded px-3 py-2 text-[11px] text-white placeholder:text-[rgba(255,255,255,0.3)] focus:outline-none"
                style={{ border: '1px solid rgba(74,158,255,0.25)' }} />
              <button onClick={createApiKey} disabled={keyCreating}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-[10px] uppercase tracking-wider font-black disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #4a9eff 0%, #2c6bbd 100%)', color: '#fff', boxShadow: '0 0 16px rgba(74,158,255,0.3)' }}>
                {keyCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Create key
              </button>
            </div>
          </div>

          {apiKeys.length === 0 ? (
            <div className="text-[11px] text-[rgba(255,255,255,0.45)] text-center py-8 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
              No API keys yet. Create one above to start hitting <code className="text-[#4a9eff]">/api/v1/*</code> programmatically.
            </div>
          ) : (
            <div className="space-y-2">
              {apiKeys.map(k => (
                <div key={k.id} className="rounded-lg p-3 flex items-center gap-3"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(74,158,255,0.15)' }}>
                  <Key className="w-3.5 h-3.5 text-[#4a9eff] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold text-white truncate">{k.name}</div>
                    <div className="text-[10px] text-[rgba(255,255,255,0.45)] flex items-center gap-3 mt-0.5 flex-wrap">
                      <code className="font-mono text-[#4a9eff]">{k.prefix}</code>
                      <span>{k.rateLimit.toLocaleString()}/hr</span>
                      <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
                      {k.lastUsedAt && <span>· Last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <button onClick={() => revokeApiKey(k.id)}
                    className="p-2 rounded hover:bg-[rgba(255,51,102,0.08)]"
                    style={{ color: 'rgba(255,51,102,0.5)' }} title="Revoke">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Alerts + Briefings */}
        {prefs && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-base font-black uppercase tracking-[0.15em] text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#ffaa00]" /> Alerts & Daily Briefing
                </h2>
                <p className="text-[11px] text-[rgba(255,255,255,0.45)] mt-1">
                  Get pinged when OFAC adds a match · Wake up to an AI-curated regulatory summary
                </p>
              </div>
              <a href="/intelligence" className="flex items-center gap-1.5 px-3 py-2 rounded text-[10px] uppercase tracking-wider font-bold"
                style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.35)', color: '#9b6dff' }}>
                <Newspaper className="w-3 h-3" /> Open Intelligence Feed
              </a>
            </div>

            <div className="rounded-xl p-5 space-y-4"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold text-[rgba(255,255,255,0.55)] mb-2">
                  <Slack className="w-3 h-3" /> Slack Webhook URL <span className="text-[rgba(255,255,255,0.3)] normal-case tracking-normal font-normal">(optional)</span>
                </label>
                <input type="text" value={prefs.slackWebhook ?? ''}
                  onChange={e => setPrefs(p => p ? { ...p, slackWebhook: e.target.value } : p)}
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  className="w-full bg-[rgba(255,255,255,0.04)] rounded px-3 py-2 text-[12px] text-white font-mono placeholder:text-[rgba(255,255,255,0.25)] focus:outline-none"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
                <p className="text-[10px] text-[rgba(255,255,255,0.4)] mt-1">
                  Get real-time alerts in your team Slack. <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener" className="text-[#9b6dff] hover:underline">How to create</a>
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {([
                  { key: 'emailAlerts',         label: 'Email me on sanctions hit',     icon: Mail },
                  { key: 'dailyBriefing',       label: 'Daily 7am AI briefing email',   icon: Send },
                  { key: 'alertOnNewSanctions', label: 'Watch saved funds for OFAC',   icon: BellOff },
                  { key: 'alertOnDoraDeadlines',label: 'Alert on DORA deadlines',       icon: Bell },
                ] as Array<{ key: keyof AlertPreferences; label: string; icon: React.ElementType }>).map(({ key, label, icon: Icon }) => {
                  const enabled = !!prefs[key]
                  return (
                    <label key={key} className="flex items-center gap-3 p-3 rounded cursor-pointer transition-all"
                      style={{
                        background: enabled ? 'rgba(0,255,136,0.04)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${enabled ? 'rgba(0,255,136,0.25)' : 'rgba(255,255,255,0.08)'}`,
                      }}>
                      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: enabled ? '#00ff88' : 'rgba(255,255,255,0.4)' }} />
                      <div className="flex-1 text-[11px] text-white">{label}</div>
                      <input type="checkbox" checked={enabled}
                        onChange={e => setPrefs(p => p ? { ...p, [key]: e.target.checked } as AlertPreferences : p)}
                        className="accent-[#00ff88]" />
                    </label>
                  )
                })}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
                <button onClick={savePrefs} disabled={prefsSaving}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded text-[10px] uppercase tracking-wider font-black"
                  style={{
                    background: prefsSaved ? 'rgba(0,255,136,0.15)' : 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                    color: prefsSaved ? '#00ff88' : '#000',
                    boxShadow: '0 0 16px rgba(0,255,136,0.3)',
                  }}>
                  {prefsSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : prefsSaved ? <CheckCircle2 className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                  {prefsSaving ? 'Saving…' : prefsSaved ? 'Saved' : 'Save preferences'}
                </button>
                <button onClick={testBriefing}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded text-[10px] uppercase tracking-wider font-bold"
                  style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.35)', color: '#9b6dff' }}>
                  <Send className="w-3 h-3" /> Send Test Briefing Now
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Upgrade tiers */}
        {plan === 'starter' && (
          <section>
            <h2 className="text-base font-black uppercase tracking-[0.15em] text-white mb-4">Upgrade your plan</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { tier: 'starter', name: 'Starter', price: 'Free', features: ['1 fund', '11 bots, 8s polling', 'Email support'], featured: false },
                { tier: 'pro', name: 'Pro', price: '€499/mo', features: ['Up to 25 funds', '340ms real-time', 'Slack alerts', 'API + webhook', 'XAI console'], featured: true },
                { tier: 'enterprise', name: 'Enterprise', price: 'Custom', features: ['Unlimited funds', 'On-premise option', 'Dedicated CSM', 'SLA 99.99%'], featured: false },
              ].map(t => (
                <div key={t.tier} className="rounded-xl p-5"
                  style={{
                    background: t.featured ? 'linear-gradient(180deg, rgba(0,255,136,0.05) 0%, rgba(0,255,136,0.01) 100%)' : 'rgba(255,255,255,0.02)',
                    border: t.featured ? '1px solid rgba(0,255,136,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    boxShadow: t.featured ? '0 0 28px rgba(0,255,136,0.08)' : 'none',
                  }}>
                  <div className="text-[10px] uppercase tracking-[0.18em] font-black mb-1"
                    style={{ color: t.featured ? '#00ff88' : 'rgba(255,255,255,0.55)' }}>
                    {t.name}
                  </div>
                  <div className="text-2xl font-black text-white mb-2">{t.price}</div>
                  <ul className="space-y-1 mb-4">
                    {t.features.map(f => (
                      <li key={f} className="text-[11px] text-[rgba(255,255,255,0.65)] flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" style={{ color: t.featured ? '#00ff88' : 'rgba(255,255,255,0.4)' }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {t.tier === 'starter' ? (
                    <div className="text-center py-2 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)]">Current plan</div>
                  ) : t.tier === 'enterprise' ? (
                    <a href="mailto:daman.sharma.2310@gmail.com" className="block w-full text-center py-2 rounded text-[10px] uppercase tracking-wider font-black"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>
                      <Mail className="w-3 h-3 inline mr-1" /> Contact Sales
                    </a>
                  ) : (
                    <button onClick={() => upgrade(t.tier)} disabled={upgradeBusy === t.tier}
                      className="w-full py-2 rounded text-[10px] uppercase tracking-wider font-black disabled:opacity-60"
                      style={{
                        background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
                        color: '#000',
                        boxShadow: '0 0 14px rgba(0,255,136,0.3)',
                      }}>
                      {upgradeBusy === t.tier ? 'Redirecting…' : 'Start 14-day trial →'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050508]" />}>
      <DashboardInner />
    </Suspense>
  )
}
