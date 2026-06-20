import Link from 'next/link'
import { ArrowLeft, FileText, Calendar, Hash, ScanLine, Check, AlertTriangle } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import PrintButton from './PrintButton'

export const metadata = {
  title: 'REPORT-01 · The 2027 AIFMD II Prospectus Readiness Report',
  description:
    'A practical, cited readiness guide for Luxembourg ManCos and AIFMs: what AIFMD II (Directive (EU) 2024/927) changed for fund prospectuses, the quantitative limits that now bind, a self-check, and the deterministic method behind it. No LLM, reproducible, CC-BY 4.0.',
}

export default function Report01Page() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#10D982" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 print:hidden"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/research" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> All papers
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <FileText className="w-4 h-4 text-[#10D982]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#10D982]">REPORT-01</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">readiness report · v1.0 · CC-BY 4.0</span>
        </div>
      </header>

      <article className="relative max-w-3xl mx-auto px-6 py-12 prose-paper">

        <div className="mb-10 pb-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#10D982] font-mono font-bold mb-3">
            PROVENLEX · READINESS REPORT 01 · 2026
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight mb-5">
            The 2027 AIFMD II Prospectus<br />
            <span className="text-[rgba(255,255,255,0.65)] font-bold">Readiness Report</span>
          </h1>
          <div className="text-[12px] text-[rgba(255,255,255,0.6)] mb-1">
            <strong className="text-white">Daman Sharma</strong>
            <span className="mx-2">·</span>
            ProvenLex
            <span className="mx-2">·</span>
            <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#10D982] hover:underline">daman.sharma.2310@gmail.com</a>
          </div>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.45)] mt-4 mb-6">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 14 June 2026</span>
            <span>v1.0</span>
            <span>CC-BY 4.0</span>
          </div>
          <PrintButton />
        </div>

        <Section h="Executive summary">
          <P>{`Three dates frame everything in this report. AIFMD II — Directive (EU) 2024/927 — applies from 16 April 2026. ESMA's final regulatory and implementing technical standards are expected in the second half of 2026. The first reporting cycle under the new regime falls in Q1 2027. Between those dates sits a quiet problem: a great many fund prospectuses were written against the old rules and have not been re-checked against the new quantitative limits.`}</P>
          <P>{`This report is a practical readiness guide for AIFMs and management companies — written with smaller Luxembourg ManCos in mind, because they carry the same obligation as the largest houses on a fraction of the budget. It sets out what changed, what now has to be true in a prospectus, a self-check you can run today, and the deterministic method behind it.`}</P>
          <P>{`The central message is one line: internal consistency is not legal compliance. A prospectus whose figures all tie out can still breach the law — and the most dangerous failure is not a wrong number but a silent omission, a limit that simply isn't stated.`}</P>
        </Section>

        <Section h="1. What AIFMD II changed">
          <P>{`AIFMD II is an amending directive, not a rewrite. For prospectus purposes, the changes that matter most are concentrated in a few areas.`}</P>

          <H3>Loan-originating AIFs — new quantitative limits</H3>
          <P>{`The most consequential change. Funds that originate loans now face hard, numeric constraints:`}</P>
          <ul className="list-disc pl-5 space-y-1.5 text-[14px] text-[rgba(255,255,255,0.82)]">
            <li><strong className="text-white">Leverage caps.</strong> An open-ended loan-originating AIF is limited to 175% leverage; a closed-ended one to 300% — measured as the ratio of exposure to net asset value on the commitment method.</li>
            <li><strong className="text-white">Risk retention.</strong> The fund must retain 5% of the notional value of loans it originates and then sells on the secondary market.</li>
            <li><strong className="text-white">Concentration.</strong> Exposure to a single borrower is capped (20% of capital where the borrower is a financial undertaking, fund, or similar) — the precise perimeter is subject to the final RTS.</li>
          </ul>

          <Callout>
            {`The false-positive trap: these caps bind ONLY loan-originating AIFs. A general private-equity or hedge AIF can legitimately run far higher leverage, and asserting a "breach" against it is simply wrong. Any check worth trusting must first establish that the fund is loan-originating before applying these numbers. (Ours does — it will not raise the cap against a fund that isn't one.)`}
          </Callout>

          <H3>Liquidity management tools (open-ended AIFs)</H3>
          <P>{`Open-ended AIFs must select liquidity management tools from a harmonised list and disclose them. Exact selection and disclosure mechanics are being finalised in the RTS, but the prospectus should already name the tools the fund can use.`}</P>

          <H3>Delegation and substance</H3>
          <P>{`Enhanced requirements on delegation arrangements and on demonstrating genuine substance in the management company. These are largely structural — they shape what must be evidenced to the regulator, and what the prospectus and supporting documentation should reflect.`}</P>

          <H3>Annex IV reporting</H3>
          <P>{`The supervisory reporting template is extended. The detail is RTS-dependent, but the direction is clear: more granular data, first due in the Q1 2027 cycle.`}</P>

          <H3>UCITS — unchanged, included for completeness</H3>
          <P>{`The UCITS diversification limits are not changed by AIFMD II: the 5/10/40 rule and the 10% single-issuer cap (Directive 2009/65/EC, Art. 52) still stand. Many houses run both UCITS and AIFs, so a readiness review should cover both.`}</P>
        </Section>

        <Section h="2. The prospectus angle — where documents fall short">
          <P>{`Each requirement above implies something that must appear, and be consistent, in the prospectus. In practice, four failure modes recur:`}</P>
          <ol className="list-decimal pl-5 space-y-2 text-[14px] text-[rgba(255,255,255,0.82)]">
            <li><strong className="text-white">Silent omission.</strong> A quantitative limit is not stated at all. The document reads cleanly and a consistency check waves it through — this is the dangerous one.</li>
            <li><strong className="text-white">Explicit breach.</strong> A declared cap exceeds the statutory limit (e.g. leverage stated at 200% for an open-ended loan-originating AIF against the 175% ceiling).</li>
            <li><strong className="text-white">Internal inconsistency.</strong> Holdings or figures contradict the fund's own declared caps.</li>
            <li><strong className="text-white">Untyped fund.</strong> The document doesn't clearly state what kind of fund it is — so the wrong regime gets applied, in either direction.</li>
          </ol>
        </Section>

        <Section h="3. The readiness self-check">
          <P>{`A practical list you can run against a prospectus today — the human-readable version of what an automated check tests. If you cannot answer "yes" to one of these, that is where to look first.`}</P>

          <ChecklistGroup title="Fund type & regime">
            <Item>The document clearly states whether the fund is open-ended or closed-ended.</Item>
            <Item>It states clearly whether the fund originates loans (and so falls under the loan-origination regime).</Item>
          </ChecklistGroup>

          <ChecklistGroup title="If loan-originating">
            <Item>A leverage limit is stated, and it is within 175% (open-ended) / 300% (closed-ended) on the commitment method.</Item>
            <Item>A 5% risk-retention commitment is stated for originated loans sold on.</Item>
            <Item>Single-borrower concentration limits are stated and within the applicable cap.</Item>
          </ChecklistGroup>

          <ChecklistGroup title="If open-ended">
            <Item>The liquidity management tools the fund can use are named and disclosed.</Item>
          </ChecklistGroup>

          <ChecklistGroup title="If UCITS">
            <Item>The 10% single-issuer cap and the 5/10/40 rule are reflected in the diversification policy.</Item>
            <Item>Disclosed holdings are consistent with those limits.</Item>
          </ChecklistGroup>

          <ChecklistGroup title="Across the board">
            <Item>Every quantitative limit appears explicitly — no limit is left to be inferred.</Item>
            <Item>The numbers in the tables agree with the numbers in the text.</Item>
          </ChecklistGroup>
        </Section>

        <Section h="4. What we're seeing (patterns)">
          <P className="italic">{`This section grows as the pilot cohort grows. The patterns below are the failure modes the check is built to catch, drawn from the structure of the rules — not yet a statistical sample. As prospectuses are checked in pilots, this will be replaced with anonymised, aggregate findings (counts and percentages, never naming a fund). If you'd like your fund included in the cohort, see the offer below.`}</P>
          <P>{`The pattern we expect to dominate is silent omission rather than explicit breach: firms rarely state a limit that breaks the law, but they frequently leave a newly-required limit unstated — which under the new regime is itself the gap to close.`}</P>
        </Section>

        <Section h="5. Method — why deterministic">
          <P>{`Every check in this report is reproducible. The engine extracts the declared limits and holdings and tests them with rules and arithmetic — there is no large language model in the decision path. The same document produces the same verdict every time, with the exact source line cited for each finding.`}</P>
          <P>{`Each verdict is SHA-256 sealed and stamped with the dated ruleset version that produced it (currently v2026.1, effective 16 April 2026). That means a verdict stays re-verifiable against a named body of rules even after the law moves on — an auditor or the regulator can re-run it and get the identical answer. For the reasoning behind the deterministic design, see `}<Link href="/research/note-01-consistent-isnt-compliant" className="text-[#10D982] hover:underline">NOTE-01</Link>{`.`}</P>
        </Section>

        <Section h="6. The honest limits">
          <P>{`Deterministic checking reaches quantitative questions — declared-versus-statutory limits and internal consistency. It does not reach structural or qualitative judgment: whether a loan-originating AIF ought to be closed-ended, whether lending is to related parties, whether a disclosure captures the spirit of a rule. Those need a person.`}</P>
          <P>{`So this is an aid to review, not a substitute for your advisor or the primary text. The standards are summaries; several details remain subject to ESMA's final RTS/ITS. Always verify against the regulation itself. A tool you can't trust on its own limits isn't one worth using.`}</P>
        </Section>

        {/* CTA — turn a reader into a pilot */}
        <section className="rounded-2xl p-6 mb-10 print:hidden" style={{ background: 'rgba(16,217,130,0.05)', border: '1px solid rgba(16,217,130,0.28)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#10D982] font-black mb-2">Run the check yourself</div>
          <p className="text-[14px] text-[rgba(255,255,255,0.82)] leading-relaxed mb-4">
            {`Paste a prospectus into the scanner and get a sealed, cited verdict in seconds — it runs entirely in your browser, and nothing is uploaded. Compliance teams can request a free 6-week pilot.`}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/scan" className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] uppercase tracking-wider font-bold"
              style={{ background: '#10D982', color: '#04130b' }}>
              <ScanLine className="w-3.5 h-3.5" /> Run a free scan
            </Link>
            <a href="mailto:daman.sharma.2310@gmail.com?subject=AIFMD%20II%20readiness%20pilot&body=Hi%20Daman%2C%20we%27d%20like%20to%20try%20the%20free%20pilot%20on%20our%20fund%20documentation."
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] uppercase tracking-wider font-bold"
              style={{ background: 'rgba(16,217,130,0.1)', border: '1px solid rgba(16,217,130,0.3)', color: '#10D982' }}>
              Request a free pilot
            </a>
          </div>
        </section>

        <section className="rounded-2xl p-5" style={{ background: 'rgba(91,141,239,0.04)', border: '1px solid rgba(91,141,239,0.25)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-[#5B8DEF]" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#5B8DEF]">Cite as</span>
          </div>
          <pre className="text-[11px] font-mono text-[rgba(255,255,255,0.85)] bg-black/40 rounded p-3 overflow-x-auto">
{`Sharma, D. (2026). "The 2027 AIFMD II Prospectus Readiness Report"
(v1.0). ProvenLex, Luxembourg. 14 June 2026.`}
          </pre>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mt-4">
            Released under Creative Commons Attribution 4.0 International. Reproduce, distribute,
            and build on it with attribution. Information only — not legal advice.
          </p>
        </section>

      </article>
    </div>
  )
}

function Section({ h, children }: { h: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-black text-white tracking-tight mb-4 mt-8">{h}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-bold text-white mt-6 mb-1">{children}</h3>
}

function P({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[14px] text-[rgba(255,255,255,0.82)] leading-relaxed ${className}`}>{children}</p>
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 my-4 flex gap-3" style={{ background: 'rgba(245,165,36,0.06)', border: '1px solid rgba(245,165,36,0.3)' }}>
      <AlertTriangle className="w-4 h-4 text-[#F5A524] shrink-0 mt-0.5" />
      <p className="text-[13px] text-[rgba(255,255,255,0.8)] leading-relaxed">{children}</p>
    </div>
  )
}

function ChecklistGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#10D982] mb-2">{title}</div>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  )
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-[14px] text-[rgba(255,255,255,0.82)] leading-relaxed">
      <Check className="w-3.5 h-3.5 text-[#10D982] shrink-0 mt-1" />
      <span>{children}</span>
    </li>
  )
}
