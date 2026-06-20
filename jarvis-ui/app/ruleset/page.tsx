import Link from 'next/link'
import { ArrowLeft, FileCode2, Hash, ScanLine, Scale } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import { STATUTORY, RULESET } from '@/lib/scan-engine'
import RulesetSeal from './RulesetSeal'

export const metadata = {
  title: 'The ProvenLex Ruleset Specification — versioned, citable AIFMD II / UCITS limits',
  description:
    'The public, versioned, deterministic interpretation of the AIFMD II loan-origination limits (175%/300% leverage, 5% retention, 20% single-borrower) and the UCITS 5/10/40 diversification rule. Every rule bound to its statutory source and SHA-256 sealed. The standard behind every ProvenLex verdict — inspect it, cite it, fork it.',
}

const S = STATUTORY

const AIFMD_RULES = [
  {
    id: 'GS-LEV-1', title: 'Leverage cap — loan-originating AIF',
    rule: `Open-ended ≤ ${S.LEVERAGE_CAP_OPEN_PCT}% of NAV · closed-ended ≤ ${S.LEVERAGE_CAP_CLOSED_PCT}% of NAV (commitment method).`,
    scope: 'Loan-originating AIFs only.',
    source: 'AIFMD II (Dir (EU) 2024/927), via Art. 15 of Dir 2011/61/EU.',
    method: 'Declared leverage cap compared to the statutory cap for the fund’s structure.',
  },
  {
    id: 'GS-RET-1', title: 'Risk retention',
    rule: `≥ ${S.MIN_RETENTION_PCT}% of the notional value of each originated loan retained.`,
    scope: 'Loan-originating AIFs only.',
    source: 'AIFMD II, Art. 15 of Dir 2011/61/EU.',
    method: 'Declared retention compared to the statutory minimum; a lower figure is a breach.',
  },
  {
    id: 'GS-CON-1', title: 'Single-borrower concentration',
    rule: `≤ ${S.SINGLE_ISSUER_CONCENTRATION_PCT}% of the AIF’s capital to any single borrower (aggregate).`,
    scope: 'Loan-originating AIFs only.',
    source: 'AIFMD II, Art. 15 of Dir 2011/61/EU.',
    method: 'Largest single-borrower exposure compared to the statutory limit.',
  },
]

const UCITS_RULES = [
  {
    id: 'GS-UC-1', title: 'UCITS single-issuer cap',
    rule: `≤ ${S.UCITS_SINGLE_ISSUER_CAP_PCT}% of NAV in transferable securities of any single issuer.`,
    scope: 'UCITS only.',
    source: 'UCITS Dir 2009/65/EC, Art. 52.',
    method: 'Each disclosed holding compared to the single-issuer cap.',
  },
  {
    id: 'GS-UC-2', title: 'UCITS 5/10/40 concentration',
    rule: `Aggregate of all single-issuer positions above ${S.UCITS_5_10_40_THRESHOLD_PCT}% of NAV may not exceed ${S.UCITS_5_10_40_BUCKET_CAP_PCT}% of NAV.`,
    scope: 'UCITS only.',
    source: 'UCITS Dir 2009/65/EC, Art. 52.',
    method: 'Sum of holdings above the 5% threshold compared to the 40% bucket cap.',
  },
]

const META_RULES = [
  {
    id: 'GS-GATE-1', title: 'Applicability gate',
    rule: 'The AIFMD II caps (GS-LEV-1, GS-RET-1, GS-CON-1) bind ONLY loan-originating AIFs — a fund whose strategy is mainly to originate loans, or whose originated loans are ≥ 50% of NAV.',
    scope: 'All funds.',
    source: 'AIFMD II definition of a loan-originating AIF.',
    method: 'Applying these caps to a general AIF is a false positive and is never asserted.',
  },
  {
    id: 'GS-DATA-1', title: 'Fail loud — insufficient data',
    rule: 'Where a document does not disclose enough to evaluate a rule, the verdict is “insufficient data” — never a clean pass.',
    scope: 'All funds.',
    source: 'ProvenLex design principle.',
    method: 'A confident wrong “compliant” is worse than an honest “cannot judge.”',
  },
]

export default function RulesetPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#10D982" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 print:hidden"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <FileCode2 className="w-4 h-4 text-[#10D982]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#10D982]">RULESET SPEC</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">v{RULESET.version} · CC-BY 4.0</span>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight mb-4">
          The ProvenLex Ruleset Specification
        </h1>
        <p className="text-[15px] text-[rgba(255,255,255,0.65)] leading-relaxed mb-7 max-w-2xl">
          The public, versioned, <strong className="text-white">deterministic</strong> interpretation of the
          AIFMD&nbsp;II loan-origination limits and the UCITS diversification rule — the exact body of rules
          behind every ProvenLex verdict. The engine is one implementation; <em>this</em> is the standard.
          Inspect it, cite it, fork it. No login, nothing to buy.
        </p>

        <RulesetSeal />

        <Group title="AIFMD II — loan-origination regime" rules={AIFMD_RULES} />
        <Group title="UCITS — diversification" rules={UCITS_RULES} />
        <Group title="Applicability & honesty" rules={META_RULES} />

        <section className="rounded-2xl p-5 mt-10" style={{ background: 'rgba(16,217,130,0.04)', border: '1px solid rgba(16,217,130,0.25)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-[#10D982]" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#10D982]">Cite as</span>
          </div>
          <pre className="text-[11px] font-mono text-[rgba(255,255,255,0.85)] bg-black/40 rounded p-3 overflow-x-auto">
{`Sharma, D. (2026). "The ProvenLex Ruleset Specification v${RULESET.version}."
ProvenLex. Effective ${RULESET.effective}.
URL: https://provenlex.vercel.app/ruleset`}
          </pre>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mt-4">
            Sources: {RULESET.sources.join(' · ')}. Released under Creative Commons Attribution 4.0.
            Every verdict is stamped with this version and the hash above, bound into its SHA-256 seal —
            so anyone can prove which dated body of rules decided it, and that those rules were not altered.
          </p>
        </section>

        <div className="flex flex-wrap gap-3 mt-8">
          <Link href="/scan" className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] uppercase tracking-wider font-bold"
            style={{ background: 'linear-gradient(135deg, #10D982 0%, #0B9E63 100%)', color: '#04130b' }}>
            <ScanLine className="w-3.5 h-3.5" /> Run it on a prospectus
          </Link>
          <Link href="/playground" className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] uppercase tracking-wider font-bold"
            style={{ background: 'rgba(16,217,130,0.12)', border: '1px solid rgba(16,217,130,0.3)', color: '#10D982' }}>
            <Scale className="w-3.5 h-3.5" /> Drag the limits in the Playground
          </Link>
        </div>

        <p className="mt-8 text-[12px] text-[rgba(255,255,255,0.4)] leading-relaxed">
          Information only, not legal advice. AIFMD II detail remains subject to ESMA’s final RTS/ITS;
          the version and effective date above record exactly which interpretation applied when a verdict was sealed.
        </p>
      </main>
    </div>
  )
}

function Group({ title, rules }: { title: string; rules: typeof AIFMD_RULES }) {
  return (
    <section className="mt-10">
      <h2 className="text-[11px] uppercase tracking-[0.2em] font-black text-[#10D982] mb-4">{title}</h2>
      <div className="space-y-3">
        {rules.map(r => (
          <div key={r.id} className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-baseline gap-3 mb-1.5">
              <span className="text-[11px] font-mono font-bold text-[#10D982]">{r.id}</span>
              <span className="text-[14px] font-bold text-white">{r.title}</span>
            </div>
            <p className="text-[13px] text-[rgba(255,255,255,0.82)] leading-relaxed mb-2">{r.rule}</p>
            <div className="grid sm:grid-cols-3 gap-2 text-[11px] text-[rgba(255,255,255,0.55)]">
              <div><span className="text-[rgba(255,255,255,0.35)] uppercase tracking-wider">Scope</span><br />{r.scope}</div>
              <div><span className="text-[rgba(255,255,255,0.35)] uppercase tracking-wider">Source</span><br />{r.source}</div>
              <div><span className="text-[rgba(255,255,255,0.35)] uppercase tracking-wider">Method</span><br />{r.method}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
