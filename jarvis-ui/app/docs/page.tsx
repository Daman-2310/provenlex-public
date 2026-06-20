'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Copy, Check, Terminal, ArrowRight, Key, Code2, Zap } from 'lucide-react'

type Lang = 'curl' | 'python' | 'typescript'

interface Endpoint {
  id: string
  method: 'GET' | 'POST'
  path: string
  scope: string
  title: string
  description: string
  request?: string
  response: string
  examples: Record<Lang, string>
}

const BASE = 'https://provenlex.vercel.app/api/v1'

const ENDPOINTS: Endpoint[] = [
  {
    id: 'screen',
    method: 'GET',
    path: '/screen?q=ROSNEFT&limit=5',
    scope: 'screen',
    title: 'OFAC Sanctions Screening',
    description: 'Screen any entity name against the live US Treasury OFAC SDN list. 18,976 entities indexed. Fuzzy + exact match.',
    response: `{
  "query": "ROSNEFT",
  "total": 3,
  "results": [
    {
      "id": "12345",
      "name": "ROSNEFT TRADING S.A.",
      "type": "entity",
      "program": "UKRAINE-EO13662 RUSSIA-EO14024",
      "remarks": "...",
      "score": 95,
      "matchLevel": "EXACT"
    }
  ],
  "source": "US Treasury OFAC SDN List",
  "_api": { "version": "v1", "endpoint": "screen" }
}`,
    examples: {
      curl: `curl -s "${BASE}/screen?q=ROSNEFT&limit=5" \\
  -H "Authorization: Bearer gs_live_YOUR_KEY"`,
      python: `import requests

res = requests.get(
    "${BASE}/screen",
    params={"q": "ROSNEFT", "limit": 5},
    headers={"Authorization": "Bearer gs_live_YOUR_KEY"},
)
print(res.json())`,
      typescript: `const res = await fetch(
  "${BASE}/screen?q=ROSNEFT&limit=5",
  { headers: { Authorization: "Bearer gs_live_YOUR_KEY" } }
)
const data = await res.json()
console.log(data.results)`,
    },
  },
  {
    id: 'lei',
    method: 'GET',
    path: '/lei?lei=529900VBK42Y5HHRMD23',
    scope: 'lei',
    title: 'GLEIF LEI Lookup',
    description: 'Resolve any 20-character LEI to the full legal entity record. 2.4M+ LEIs globally. Supports fuzzy search via ?q=name.',
    response: `{
  "lei": "529900VBK42Y5HHRMD23",
  "legalName": "BlackRock, Inc.",
  "jurisdiction": "US-DE",
  "status": "ACTIVE",
  "legalForm": "Corporation",
  "headquarters": {
    "country": "US",
    "city": "New York"
  },
  "registration": {
    "initialRegistrationDate": "2012-10-25",
    "lastUpdateDate": "2025-..."
  }
}`,
    examples: {
      curl: `curl -s "${BASE}/lei?lei=529900VBK42Y5HHRMD23" \\
  -H "Authorization: Bearer gs_live_YOUR_KEY"`,
      python: `import requests
res = requests.get(
    "${BASE}/lei",
    params={"lei": "529900VBK42Y5HHRMD23"},
    headers={"Authorization": "Bearer gs_live_YOUR_KEY"},
)
print(res.json()["legalName"])`,
      typescript: `const r = await fetch(
  "${BASE}/lei?lei=529900VBK42Y5HHRMD23",
  { headers: { Authorization: "Bearer gs_live_YOUR_KEY" } }
)
const { legalName, jurisdiction } = await r.json()`,
    },
  },
  {
    id: 'fx',
    method: 'GET',
    path: '/fx',
    scope: 'fx',
    title: 'ECB FX Rates',
    description: 'Live EUR exchange rates against 10 major currencies, sourced from the European Central Bank via Frankfurter. Cached 5min.',
    response: `{
  "base": "EUR",
  "date": "2026-05-29",
  "rates": { "USD": 1.1617, "GBP": 0.8666, "JPY": 185.24, "CHF": 0.9341, ... },
  "source": "ECB via Frankfurter"
}`,
    examples: {
      curl: `curl -s "${BASE}/fx" \\
  -H "Authorization: Bearer gs_live_YOUR_KEY"`,
      python: `r = requests.get("${BASE}/fx", headers={"Authorization": "Bearer gs_live_YOUR_KEY"})
print(r.json()["rates"]["USD"])`,
      typescript: `const { rates } = await fetch("${BASE}/fx", {
  headers: { Authorization: "Bearer gs_live_YOUR_KEY" }
}).then(r => r.json())`,
    },
  },
]

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative rounded-lg overflow-hidden" style={{ background: '#020207', border: '1px solid rgba(16,217,130,0.12)' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: 'rgba(16,217,130,0.02)', borderBottom: '1px solid rgba(16,217,130,0.08)' }}>
        <span className="text-[9px] uppercase tracking-widest font-bold text-[rgba(16,217,130,0.6)]">{lang}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.5)] hover:text-white">
          {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <pre className="p-4 text-[11px] leading-relaxed text-[#10D982] overflow-x-auto whitespace-pre" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{code}</pre>
    </div>
  )
}

export default function DocsPage() {
  const [lang, setLang] = useState<Lang>('curl')
  const [activeId, setActiveId] = useState<string>('screen')

  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 flex items-center justify-between"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Code2 className="w-4 h-4 text-[#10D982]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#10D982]">API DOCS</span>
        </div>
        <Link href="/dashboard"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold"
          style={{ background: 'rgba(16,217,130,0.08)', border: '1px solid rgba(16,217,130,0.35)', color: '#10D982' }}>
          <Key className="w-3 h-3" /> Get API key
        </Link>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12">

        {/* Hero */}
        <div className="mb-12">
          <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', lineHeight: 1 }}>
            <span className="text-white">The compliance API for</span>
            <br />
            <span style={{ background: 'linear-gradient(90deg, #10D982 0%, #5B8DEF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              European funds.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-base max-w-2xl">
            Embed real OFAC sanctions screening, GLEIF LEI resolution, ECB FX rates, AI compliance gap analysis,
            and AI-generated legal opinions / 60-minute audit packs directly into your stack. REST. JSON. Per-key rate-limited.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <Link href="/dashboard" className="px-5 py-3 rounded-md text-[11px] uppercase tracking-[0.15em] font-black inline-flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)', color: '#000', boxShadow: '0 0 24px rgba(16,217,130,0.4)' }}>
              <Key className="w-3.5 h-3.5" /> Create API key
            </Link>
            <a href="#screen" className="px-5 py-3 rounded-md text-[11px] uppercase tracking-[0.15em] font-bold inline-flex items-center gap-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>
              <Terminal className="w-3.5 h-3.5" /> Quick start
            </a>
          </div>
        </div>

        {/* Authentication */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">AUTHENTICATION</h2>
          <p className="text-[rgba(255,255,255,0.6)] text-[13px] mb-3">
            Every request requires a Bearer token. Create one at <Link href="/dashboard" className="text-[#10D982] hover:underline">/dashboard</Link> → API Keys.
            Keys are <code className="text-[#10D982] font-mono">gs_live_</code> prefixed, 24 bytes of entropy. Rate-limited per hour by plan tier
            (Starter: 100, Pro: 5,000, Enterprise: 100,000).
          </p>
          <CodeBlock lang="HTTP" code={`Authorization: Bearer gs_live_AbC123dEf456GhI789jKl0...

Response headers on every call:
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4982
X-RateLimit-Reset: 1748714400`} />
        </section>

        {/* Endpoint list */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">ENDPOINTS</h2>
          <div className="flex flex-wrap gap-1.5 mb-6">
            {ENDPOINTS.map(e => (
              <a key={e.id} href={`#${e.id}`} onClick={() => setActiveId(e.id)}
                className="px-2.5 py-1 rounded text-[10px] uppercase tracking-wider font-bold"
                style={{
                  background: activeId === e.id ? 'rgba(16,217,130,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${activeId === e.id ? 'rgba(16,217,130,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  color: activeId === e.id ? '#10D982' : 'rgba(255,255,255,0.6)',
                }}>
                <span className="text-[9px] mr-1.5"
                  style={{ color: e.method === 'GET' ? '#5B8DEF' : '#F5A524' }}>{e.method}</span>
                {e.id}
              </a>
            ))}
          </div>
        </section>

        {/* Lang tabs */}
        <div className="sticky top-[60px] z-20 -mx-6 px-6 py-2 flex gap-1 mb-4"
          style={{ background: 'rgba(5,5,12,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {(['curl', 'python', 'typescript'] as Lang[]).map(l => (
            <button key={l} onClick={() => setLang(l)}
              className="px-3 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold"
              style={{
                background: lang === l ? 'rgba(16,217,130,0.12)' : 'transparent',
                color: lang === l ? '#10D982' : 'rgba(255,255,255,0.5)',
                border: `1px solid ${lang === l ? 'rgba(16,217,130,0.4)' : 'transparent'}`,
              }}>
              {l}
            </button>
          ))}
        </div>

        {/* Endpoints detail */}
        {ENDPOINTS.map(e => (
          <section key={e.id} id={e.id} className="mb-12 pt-4">
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-[10px] uppercase tracking-widest font-black px-2 py-1 rounded"
                style={{
                  background: e.method === 'GET' ? 'rgba(91,141,239,0.1)' : 'rgba(245,165,36,0.1)',
                  color: e.method === 'GET' ? '#5B8DEF' : '#F5A524',
                  border: `1px solid ${e.method === 'GET' ? 'rgba(91,141,239,0.4)' : 'rgba(245,165,36,0.4)'}`,
                }}>{e.method}</span>
              <code className="text-base font-mono text-white">{e.path}</code>
              <span className="text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] ml-auto">scope: {e.scope}</span>
            </div>
            <h3 className="text-xl font-black text-white mb-1">{e.title}</h3>
            <p className="text-[12px] text-[rgba(255,255,255,0.55)] mb-4 leading-relaxed">{e.description}</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <div className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mb-1.5">REQUEST</div>
                <CodeBlock lang={lang} code={e.examples[lang]} />
                {e.request && (
                  <>
                    <div className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mb-1.5 mt-3">BODY</div>
                    <CodeBlock lang="JSON" code={e.request} />
                  </>
                )}
              </div>
              <div>
                <div className="text-[8px] uppercase tracking-widest text-[rgba(255,255,255,0.4)] mb-1.5">RESPONSE</div>
                <CodeBlock lang="JSON" code={e.response} />
              </div>
            </div>
          </section>
        ))}

        {/* Errors */}
        <section className="mb-10">
          <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">ERROR CODES</h2>
          <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { code: 400, label: 'BAD_REQUEST', desc: 'Missing or malformed query parameters / body' },
              { code: 401, label: 'UNAUTHENTICATED', desc: 'Missing or invalid API key' },
              { code: 403, label: 'INSUFFICIENT_SCOPE', desc: 'Key does not have permission for this endpoint' },
              { code: 404, label: 'NOT_FOUND', desc: 'LEI / fund / record does not exist in source registry' },
              { code: 429, label: 'RATE_LIMITED', desc: 'Hourly request quota exceeded for your plan' },
              { code: 502, label: 'UPSTREAM_ERROR', desc: 'OFAC / GLEIF / Frankfurter returned non-2xx' },
              { code: 503, label: 'NOT_CONFIGURED', desc: 'A required environment variable is missing server-side' },
            ].map(e => (
              <div key={e.code} className="flex items-center gap-4 px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <code className="text-base font-mono font-black text-[#F2566E] w-12">{e.code}</code>
                <code className="text-[12px] font-mono font-bold text-white w-44">{e.label}</code>
                <span className="text-[12px] text-[rgba(255,255,255,0.55)] flex-1">{e.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl p-8 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(16,217,130,0.04) 0%, rgba(91,141,239,0.03) 100%)',
            border: '1px solid rgba(16,217,130,0.3)',
          }}>
          <Zap className="w-8 h-8 text-[#10D982] mx-auto mb-3" />
          <h2 className="text-2xl font-black text-white mb-2">Ready to ship?</h2>
          <p className="text-[rgba(255,255,255,0.5)] text-[13px] mb-5 max-w-xl mx-auto">
            14-day free trial. 100 API calls/hour on Starter. No credit card. Get a key in 30 seconds.
          </p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black"
            style={{ background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)', color: '#000', boxShadow: '0 0 24px rgba(16,217,130,0.4)' }}>
            Create API key <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      </div>
    </div>
  )
}
