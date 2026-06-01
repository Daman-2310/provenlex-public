import Link from 'next/link'
import { ArrowLeft, BookOpen, Hash, ShieldCheck, Layers, GitBranch, Award, Download, ExternalLink } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

const PRINCIPLES = [
  { n: '01', title: 'Cryptographic anchoring', desc: 'Every score is sealed with a SHA-256 Merkle root + timestamp at issue. Verifiable independently.' },
  { n: '02', title: 'Public by default', desc: 'Scores are world-readable unless the subject is a private individual. Transparency is the moat.' },
  { n: '03', title: 'Method-disclosed', desc: 'Scoring methodology, model versions, and signal weights are published. No black boxes.' },
  { n: '04', title: 'Append-only audit', desc: 'Historical scores never disappear. Revisions append; they don\'t overwrite.' },
  { n: '05', title: 'Adversarial-tested', desc: 'Every signal must survive a Shadow Bot probe before going live. Red-team posture is published.' },
  { n: '06', title: 'Pattern-grounded', desc: 'All predictions cite a historical analog (Wirecard, Archegos, FTX, Greensill, Madoff) or explicitly state "no match".' },
]

const SCHEMA = {
  '@context': 'https://genesis-swarm.app/protocol/v1',
  '@type': 'GenesisOperationalRiskAssessment',
  subject: { '@type': 'LegalEntity', lei: 'string|null', legal_name: 'string' },
  scores: {
    pre_crime_index: { range: '0-100', meaning: 'behavioural fraud probability', threshold_danger: 70 },
    genesis_score: { range: '0-100', meaning: 'compliance health (higher better)' },
    trajectory: { enum: ['RISING', 'FALLING', 'HOLDING'] },
    risk_level: { enum: ['LOW', 'MODERATE', 'ELEVATED', 'CRITICAL'] },
  },
  signals: 'array<{ name, severity:0-100, note, weight }>',
  pattern_match: { enum: ['wirecard', 'archegos', 'ftx', 'greensill', 'madoff', 'none'] },
  seal: {
    merkle_root: 'sha256-hex',
    signature: 'sha256-hex',
    sealed_at: 'iso8601',
    reveal_at: 'iso8601',
  },
  framework_coverage: 'array<{ requirement, status:met|partial|missing, note }>',
  data_sources: 'array<string>',
  model: 'string',
  version: 'GENESIS-1',
}

const TIERS = [
  { tier: 'GENESIS-CERTIFIED', score: '≥ 80', color: '#00ff88', desc: 'Acceptable operational-risk posture. Suitable for institutional inclusion.' },
  { tier: 'GENESIS-MONITORED', score: '50–79', color: '#ffaa00', desc: 'Notable structural risk. Watchlist; periodic re-scoring required.' },
  { tier: 'GENESIS-CONCERNED', score: '30–49', color: '#ff7700', desc: 'Material risk indicators present. Due diligence escalation recommended.' },
  { tier: 'GENESIS-DANGER',    score: '< 30',  color: '#ff3366', desc: 'Clear and present risk. Pre-Crime Index typically ≥ 70.' },
]

export default function ProtocolPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#ffaa00" />
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <BookOpen className="w-4 h-4 text-[#ffaa00]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ffaa00]">GENESIS PROTOCOL</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">GENESIS-1 · open standard · v1.0</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-14">

        {/* HERO */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{ background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.3)' }}>
            <Award className="w-3 h-3 text-[#ffaa00]" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#ffaa00]">
              Open standard · Apache 2.0
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-4" style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 1.05 }}>
            <span className="text-white">GENESIS-1</span>
            <br />
            <span style={{ background: 'linear-gradient(90deg, #ffaa00 0%, #ff7700 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Operational-Risk Reporting Framework
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            The open standard for AI-driven operational-risk disclosure in regulated financial entities.
            Built to be the <em>SOC 2 of fund compliance</em>: any tool can implement it, any auditor can verify it,
            any regulator can endorse it.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.5)]">
            <span>Version <span className="text-[#ffaa00] font-bold">1.0</span></span>
            <span>·</span>
            <span>Status <span className="text-[#00ff88] font-bold">CANDIDATE</span></span>
            <span>·</span>
            <span>License <span className="text-[#4a9eff] font-bold">Apache 2.0</span></span>
            <span>·</span>
            <span>Editor <span className="text-white font-bold">Daman Sharma</span></span>
          </div>
        </div>

        {/* SIX PRINCIPLES */}
        <section className="mb-14">
          <div className="text-[10px] uppercase tracking-[0.25em] font-black text-[#ffaa00] mb-6">§ 1 — Six Principles</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PRINCIPLES.map(p => (
              <div key={p.n} className="rounded-xl p-5"
                style={{ background: 'rgba(255,170,0,0.03)', border: '1px solid rgba(255,170,0,0.2)' }}>
                <div className="flex items-start gap-3">
                  <span className="text-[24px] font-black text-[#ffaa00] tabular-nums leading-none">{p.n}</span>
                  <div>
                    <div className="text-[13px] font-black text-white mb-1">{p.title}</div>
                    <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">{p.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SCHEMA */}
        <section className="mb-14">
          <div className="text-[10px] uppercase tracking-[0.25em] font-black text-[#ffaa00] mb-6">§ 2 — Assessment Schema</div>
          <div className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,170,0,0.2)' }}>
            <div className="px-4 py-2 flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold"
              style={{ background: 'rgba(255,170,0,0.04)', borderBottom: '1px solid rgba(255,170,0,0.15)', color: '#ffaa00' }}>
              <Hash className="w-3 h-3" /> GENESIS-1 JSON-LD
            </div>
            <pre className="p-4 text-[11px] font-mono overflow-x-auto text-[rgba(255,255,255,0.85)]">
{JSON.stringify(SCHEMA, null, 2)}
            </pre>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px]">
            <a href="/api/protocol/schema"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded uppercase tracking-wider font-bold"
              style={{ background: 'rgba(255,170,0,0.08)', color: '#ffaa00', border: '1px solid rgba(255,170,0,0.3)' }}>
              <Download className="w-3 h-3" /> JSON-LD schema
            </a>
            <a href="/api/protocol/schema?format=openapi"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded uppercase tracking-wider font-bold"
              style={{ background: 'rgba(74,158,255,0.08)', color: '#4a9eff', border: '1px solid rgba(74,158,255,0.3)' }}>
              <Download className="w-3 h-3" /> OpenAPI v3.1
            </a>
          </div>
        </section>

        {/* TIERS */}
        <section className="mb-14">
          <div className="text-[10px] uppercase tracking-[0.25em] font-black text-[#ffaa00] mb-6">§ 3 — Certification Tiers</div>
          <div className="space-y-2">
            {TIERS.map(t => (
              <div key={t.tier} className="rounded-xl p-4 flex items-center gap-4"
                style={{ background: `${t.color}06`, border: `1px solid ${t.color}30` }}>
                <Award className="w-5 h-5 shrink-0" style={{ color: t.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[14px] font-black tracking-wider" style={{ color: t.color }}>{t.tier}</span>
                    <span className="text-[11px] font-mono text-[rgba(255,255,255,0.5)]">{t.score}</span>
                  </div>
                  <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed mt-0.5">{t.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* METHODOLOGY */}
        <section className="mb-14">
          <div className="text-[10px] uppercase tracking-[0.25em] font-black text-[#ffaa00] mb-6">§ 4 — Scoring Methodology</div>
          <div className="rounded-xl p-6"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="space-y-4 text-[12px] leading-relaxed text-[rgba(255,255,255,0.75)]">
              <p>
                <strong className="text-white">Step 1: Identity anchor.</strong> Subject must be resolvable to a GLEIF LEI
                or equivalent (LegalEntity-typed graph). Anonymous entities receive a "PROVISIONAL" suffix.
              </p>
              <p>
                <strong className="text-white">Step 2: Signal panel.</strong> 11 specialist bots emit signal scores:
                NAV_DETECTOR, PBFT_QUORUM, SANCTIONS_BOT, MERKLE_ANCHOR, FX_BOT, COMPLIANCE_BOT, SHADOW_BOT,
                ORBITAL_BOT, SUCCESSION_BOT, YACHT_GUARDIAN, INTELLIGENCE_BOT. Each emits a 0-100 severity + note.
              </p>
              <p>
                <strong className="text-white">Step 3: Pattern matching.</strong> The signal panel is matched
                against five historical fraud archetypes (Wirecard, Archegos, FTX, Greensill, Madoff). A
                cosine-similarity ≥ 0.7 triggers pattern_match.
              </p>
              <p>
                <strong className="text-white">Step 4: Aggregation.</strong> Pre-Crime Index = weighted mean of
                signal severities with pattern-match multiplier. Genesis Score = inverse with structural-strength
                bonus (regulatory framework coverage).
              </p>
              <p>
                <strong className="text-white">Step 5: Sealing.</strong> Full assessment payload is hashed into a
                Merkle root. Root + signature + timestamps are written to KV with 5-year retention. Verifiers
                can replay the SHA-256 chain independently.
              </p>
            </div>
          </div>
        </section>

        {/* GOVERNANCE */}
        <section className="mb-14">
          <div className="text-[10px] uppercase tracking-[0.25em] font-black text-[#ffaa00] mb-6">§ 5 — Governance & Evolution</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Layers className="w-5 h-5 text-[#4a9eff] mb-2" />
              <div className="text-[13px] font-black text-white mb-1">Versioning</div>
              <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">
                Semantic versioning. Major bumps (GENESIS-2) require 90-day notice + public RFC.
                Minor bumps are additive only. Patch bumps are clarifications, never behavioural changes.
              </div>
            </div>
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <GitBranch className="w-5 h-5 text-[#9b6dff] mb-2" />
              <div className="text-[13px] font-black text-white mb-1">Contribution</div>
              <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">
                Open RFC process. Anyone may propose signal additions, pattern archetypes, or framework
                coverage. Reference implementation hosted at <span className="text-[#4a9eff]">genesis-swarm/jarvis-ui</span>.
              </div>
            </div>
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <ShieldCheck className="w-5 h-5 text-[#00ff88] mb-2" />
              <div className="text-[13px] font-black text-white mb-1">Independence</div>
              <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">
                No vendor lock-in. The protocol is implementable by any party. Genesis Swarm is the
                reference implementation, not the sole authority.
              </div>
            </div>
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Award className="w-5 h-5 text-[#ffaa00] mb-2" />
              <div className="text-[13px] font-black text-white mb-1">Endorsement track</div>
              <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">
                Target endorsers: CSSF, BaFin, FCA, ECB SSM, ESMA. Outreach Q3 2026.
                LP coalition signatories Q4 2026.
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl p-8 text-center"
          style={{ background: 'linear-gradient(135deg, rgba(255,170,0,0.04) 0%, rgba(255,119,0,0.03) 100%)', border: '1px solid rgba(255,170,0,0.3)' }}>
          <BookOpen className="w-8 h-8 text-[#ffaa00] mx-auto mb-3" />
          <h2 className="text-2xl font-black text-white mb-2">Implement GENESIS-1</h2>
          <p className="text-[rgba(255,255,255,0.6)] text-[13px] mb-5 max-w-xl mx-auto">
            Three reference SDKs (TypeScript, Python, Go) coming Q3 2026. To early-adopt, ping the editor.
          </p>
          <a href="mailto:daman.sharma.2310@gmail.com?subject=GENESIS-1%20protocol%20adoption"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-[12px] uppercase tracking-[0.15em] font-black"
            style={{ background: 'linear-gradient(135deg, #ffaa00 0%, #ff7700 100%)', color: '#000', boxShadow: '0 0 24px rgba(255,170,0,0.4)' }}>
            <ExternalLink className="w-4 h-4" /> Adopt the protocol
          </a>
        </section>

      </div>
    </div>
  )
}
