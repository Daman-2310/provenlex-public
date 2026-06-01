import Link from 'next/link'
import { ArrowLeft, Network, Code2, GitMerge, Mail } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'The Genesis Federation · Open compliance score aggregator · Genesis Swarm',
  description: 'Publish your compliance scores into the Genesis ledger. Get distribution; we get aggregation. The GitHub of compliance signals.',
}

const EXAMPLE_PAYLOAD = `{
  "publisher_name": "ExampleCompliance Inc",
  "publisher_api_key": "(optional shared secret)",
  "subject_name": "BlackRock Investment Management (UK) Limited",
  "subject_lei": "529900VBK42Y5HHRMD23",
  "score": 72,
  "score_direction": "higher_better",
  "confidence": 85,
  "source_url": "https://example-compliance.com/reports/blackrock-uk",
  "methodology_url": "https://example-compliance.com/methodology",
  "notes": "Stable governance, no flags in Q1 2026 sweep."
}`

export default function FederationPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#9b6dff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Network className="w-4 h-4 text-[#9b6dff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">THE FEDERATION</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">open compliance API · zero gatekeeping</span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(155,109,255,0.08)', border: '1px solid rgba(155,109,255,0.3)' }}>
            <GitMerge className="w-3 h-3 text-[#9b6dff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#9b6dff]">
              The GitHub of compliance signals
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Publish your scores</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #9b6dff 0%, #4a9eff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(155,109,255,0.3))',
            }}>into the ledger.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            If you run a compliance, KYC, AML, or fund-risk tool, publish your scores into the
            Genesis Federation. We aggregate. We rank. You get distribution. Free, forever.
          </p>
        </div>

        {/* ENDPOINT */}
        <div className="rounded-2xl overflow-hidden mb-10"
          style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(155,109,255,0.3)', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-2 px-4 py-3"
            style={{ background: 'rgba(155,109,255,0.05)', borderBottom: '1px solid rgba(155,109,255,0.15)' }}>
            <Code2 className="w-3.5 h-3.5 text-[#9b6dff]" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#9b6dff] font-black">Endpoint</span>
          </div>
          <div className="p-4">
            <div className="text-[13px] font-mono mb-3">
              <span className="px-2 py-1 rounded font-bold mr-2 text-[#000]"
                style={{ background: '#9b6dff' }}>POST</span>
              <span className="text-white">https://genesis-swarm-rgq5.vercel.app/api/federation/publish</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-bold mb-2">Body (JSON)</div>
            <pre className="text-[11px] font-mono text-[rgba(255,255,255,0.85)] overflow-x-auto p-3 rounded"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>{EXAMPLE_PAYLOAD}</pre>
          </div>
        </div>

        {/* PARAMS */}
        <div className="rounded-2xl overflow-hidden mb-10"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)' }}>
          <div className="grid grid-cols-[160px_120px_1fr] gap-3 px-4 py-3 text-[9px] uppercase tracking-[0.18em] font-black text-[rgba(255,255,255,0.45)]"
            style={{ background: 'rgba(155,109,255,0.04)', borderBottom: '1px solid rgba(155,109,255,0.15)' }}>
            <span>Field</span><span>Required</span><span>Meaning</span>
          </div>
          <FieldRow name="publisher_name"     required body="Your organization name" />
          <FieldRow name="subject_name"       required body="Entity being scored (legal name preferred)" />
          <FieldRow name="subject_lei"                body="20-char GLEIF LEI if known" />
          <FieldRow name="score"              required body="Numeric 0-100" />
          <FieldRow name="score_direction"    required body='"higher_better" or "higher_worse"' />
          <FieldRow name="confidence"                 body="Your own confidence 0-100 (default 50)" />
          <FieldRow name="source_url"         required body="Public URL to your full report" />
          <FieldRow name="methodology_url"            body="Public methodology page" />
          <FieldRow name="notes"                      body="Free text, max 500 chars" />
        </div>

        {/* HOW IT WORKS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
          <Step n="1" color="#9b6dff" title="POST your score">
            Send a JSON payload to the publish endpoint. We hash + timestamp + assign an ID.
          </Step>
          <Step n="2" color="#4a9eff" title="We aggregate">
            Your score becomes part of the public Federation log alongside Genesis's own score and
            others' submissions. Linked from the entity's Genesis dossier.
          </Step>
          <Step n="3" color="#00ff88" title="You get distribution">
            Backlink + brand impression on every entity page. Users who trust your methodology can
            filter by publisher. Zero fees, zero gatekeeping.
          </Step>
        </div>

        {/* CURL EXAMPLE */}
        <div className="rounded-2xl overflow-hidden mb-10"
          style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(74,158,255,0.3)', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-2 px-4 py-3"
            style={{ background: 'rgba(74,158,255,0.05)', borderBottom: '1px solid rgba(74,158,255,0.15)' }}>
            <Code2 className="w-3.5 h-3.5 text-[#4a9eff]" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#4a9eff] font-black">curl example</span>
          </div>
          <pre className="text-[11px] font-mono text-[rgba(255,255,255,0.85)] overflow-x-auto p-4">{`curl -X POST https://genesis-swarm-rgq5.vercel.app/api/federation/publish \\
  -H "Content-Type: application/json" \\
  -d '${EXAMPLE_PAYLOAD.replace(/\n\s*/g, ' ')}'`}</pre>
        </div>

        {/* CTA */}
        <div className="rounded-2xl p-8 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(155,109,255,0.04) 0%, rgba(74,158,255,0.03) 100%)',
            border: '1px solid rgba(155,109,255,0.3)',
            backdropFilter: 'blur(10px)',
          }}>
          <Network className="w-8 h-8 text-[#9b6dff] mx-auto mb-3" />
          <h2 className="text-2xl font-black text-white mb-2">Become a Federation publisher</h2>
          <p className="text-[rgba(255,255,255,0.55)] text-[13px] mb-5 max-w-xl mx-auto leading-relaxed">
            Email the editor to be added to the public list of trusted publishers. No fee, no contract.
            We display your name on every entity you score.
          </p>
          <a href="mailto:daman.sharma.2310@gmail.com?subject=Genesis%20Federation%20publisher%20enrollment"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black"
            style={{ background: 'linear-gradient(135deg, #9b6dff 0%, #4a9eff 100%)', color: '#000', boxShadow: '0 0 24px rgba(155,109,255,0.4)' }}>
            <Mail className="w-4 h-4" /> Apply to publish
          </a>
        </div>

      </div>
    </div>
  )
}

function FieldRow({ name, required, body }: { name: string; required?: boolean; body: string }) {
  return (
    <div className="grid grid-cols-[160px_120px_1fr] gap-3 px-4 py-3 text-[11px] border-b border-[rgba(255,255,255,0.04)] last:border-0">
      <span className="font-mono font-bold text-[#9b6dff]">{name}</span>
      <span className="font-mono">{required ? <span className="text-[#ff3366]">required</span> : <span className="text-[rgba(255,255,255,0.4)]">optional</span>}</span>
      <span className="text-[rgba(255,255,255,0.75)]">{body}</span>
    </div>
  )
}

function Step({ n, color, title, children }: { n: string; color: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5"
      style={{ background: `${color}06`, border: `1px solid ${color}30`, backdropFilter: 'blur(10px)' }}>
      <div className="flex items-start gap-3">
        <span className="text-3xl font-black leading-none tabular-nums" style={{ color }}>{n}</span>
        <div>
          <div className="text-[13px] font-black text-white mb-1">{title}</div>
          <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  )
}
