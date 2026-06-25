import Link from 'next/link'
import { ArrowLeft, FileText, Calendar, Hash, SlidersHorizontal } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'NOTE-03 · The Number That Misleads — how real prospectuses disclose leverage, and why the scariest figure means the least',
  description:
    'A practitioner field note from running a deterministic extraction over seven real public Luxembourg fund prospectuses. Leverage method is disclosed well; but the most visible leverage number — gross/VaR leverage, sometimes 500% — is the one most likely to be misread as an AIFMD II breach, while the figure that maps to the cap is often absent. Why reading leverage requires knowing the method, not pattern-matching a percent sign.',
}

export default function Note03Page() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#5B8DEF" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 print:hidden"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/research" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> All papers
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <FileText className="w-4 h-4 text-[#5B8DEF]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#5B8DEF]">NOTE-03</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">field note · CC-BY 4.0</span>
        </div>
      </header>

      <article className="relative max-w-3xl mx-auto px-6 py-12 prose-paper">

        <div className="mb-10 pb-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#5B8DEF] font-mono font-bold mb-3">
            PROVENLEX · FIELD NOTE 03 · 2026
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight mb-5">
            {`The Number That Misleads`}<br />
            <span className="text-[rgba(255,255,255,0.65)] font-bold">In real prospectuses, the scariest leverage figure is the one that means the least</span>
          </h1>
          <div className="text-[12px] text-[rgba(255,255,255,0.6)] mb-1">
            <strong className="text-white">Daman Sharma</strong>
            <span className="mx-2">·</span>
            ProvenLex
            <span className="mx-2">·</span>
            <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#5B8DEF] hover:underline">daman.sharma.2310@gmail.com</a>
          </div>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.45)] mt-4">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 25 June 2026</span>
            <span>CC-BY 4.0</span>
          </div>
        </div>

        <Section h="Abstract">
          <P>{`I ran seven real, public Luxembourg fund prospectuses through the same deterministic text extraction the scanner uses, and recorded how each discloses leverage, loan-origination status, risk retention and concentration. The headline: leverage method is disclosed well — every document named its method. But the leverage number that is most visible — gross or value-at-risk leverage, in places 500% — is the one most likely to be misread as an AIFMD II breach, while the figure that actually maps to the cap is frequently not stated as a single headline at all. Reading a prospectus for leverage is not pattern-matching a percent sign near the word "leverage." It requires knowing the method — which is exactly the judgment a language model fakes and a deterministic, method-aware check gets right. This is a disclosure-clarity field note, not a compliance assessment of any fund.`}</P>
        </Section>

        <Section h="1. What I did">
          <P>{`Seven public prospectuses from real managers — large UCITS SICAVs, a SIF, an FIS — downloaded and text-extracted with an open library. No OCR, no model. Then a deterministic keyword pass for each disclosure point, recording what appeared in the extracted main text. The sample is small and selection-biased toward large publishers, for a reason I come back to at the end.`}</P>
          <P>{`A note on what this is and is not: it measures disclosure clarity and machine-readability, not compliance. "Not surfaced" means a statement did not appear in the extracted text — never that it is missing from the document or that a fund is in breach. No fund is named.`}</P>
        </Section>

        <Section h="2. Method disclosure is the strong part">
          <P>{`All seven named their leverage calculation method — commitment, gross, or absolute VaR. On the fundamentals, this part of the market does its job: a reader is told how leverage is being measured. The trouble starts with the number that comes next.`}</P>
        </Section>

        <Section h="3. The most visible number is the most misleading">
          <P>{`The funds that use absolute VaR disclose an expected or maximum gross leverage figure — and in several it reads 500%. To anyone scanning for "the leverage number," that looks like a three-to-five-times breach of the AIFMD II loan-origination caps: 175% of NAV for open-ended funds, 300% for closed-ended. It is not a breach. Gross and VaR leverage are a different measure from the commitment-method ratio those caps are written against, and high gross figures are normal for a fund that uses derivatives.`}</P>
          <P>{`Meanwhile the funds that use the commitment method often disclose no single headline leverage number at all — it is implicit in their cap. So the most machine-visible number is the one most likely to be mis-flagged, and the number that maps to the rule is frequently the one that is absent.`}</P>
          <P>{`This is the entire argument for keeping a model out of the decision path, in one data point. A tool that pattern-matches a percent sign near the word "leverage" — which is, under the hood, what a language model does — will confidently flag a compliant VaR fund as a 500% breach. A deterministic check that knows which method it is reading will not, because the method is the whole point. Read leverage by method, not by percent sign.`}</P>
        </Section>

        <Section h="4. Classification is the hinge">
          <P>{`Loan-origination status ranged across the sample from a clean yes (a prospectus describing loans "originated or acquired"), to a clean no ("not allowed to grant loans"), to genuinely ambiguous wording buried in investment restrictions, to "private debt" language that is easily mistaken for origination but is not the same thing.`}</P>
          <P>{`This matters because AIFMD II's leverage, retention and concentration limits for loan originators bind only loan-originating AIFs. The classification decides whether the limits apply at all. Get it wrong in one direction and you miss a real breach; get it wrong in the other and you raise a false breach against a perfectly compliant fund — and one false breach is enough for a compliance officer to stop trusting a tool. The hard part is rarely the arithmetic. It is knowing which rules are even in scope.`}</P>
        </Section>

        <Section h="5. The transparency paradox">
          <P>{`There is a structural reason this sample skews to large UCITS. The funds AIFMD II targets most directly — loan-originating private-credit RAIFs and SIFs — publish their prospectuses privately, to professional investors. They are not web-downloadable. A public sample necessarily under-represents exactly the funds the new rules are written for.`}</P>
          <P>{`That selection bias is itself a finding: the funds where the limits bite hardest are the least publicly transparent — which is precisely where a fast, private, in-browser check that never sends a document anywhere has the most to offer.`}</P>
        </Section>

        <Section h="6. Conclusion">
          <P>{`Every pattern here is a place a confident wrong answer does damage: a false "500% breach," a general fund mis-classified as an originator, a statement that is elsewhere in a document read as "missing." Determinism does not make those mistakes look authoritative. It shows its working, cites the line it read, and — when it cannot read a document cleanly — says so instead of guessing.`}</P>
          <P>{`The rules were never the hard part, and they were never the moat. Reading the document honestly is. I am building this in the open, from India, aimed at Luxembourg. If you work in fund compliance and think I have read any of this wrong, I genuinely want to hear it — that is worth more to me than agreement.`}</P>
        </Section>

        <div className="flex flex-wrap gap-3 mb-10">
          <Link href="/playground" className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] uppercase tracking-wider font-bold"
            style={{ background: 'rgba(91,141,239,0.12)', border: '1px solid rgba(91,141,239,0.3)', color: '#5B8DEF' }}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> Try the engine yourself
          </Link>
        </div>

        <section className="rounded-2xl p-5" style={{ background: 'rgba(91,141,239,0.04)', border: '1px solid rgba(91,141,239,0.25)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-[#5B8DEF]" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#5B8DEF]">Cite as</span>
          </div>
          <pre className="text-[11px] font-mono text-[rgba(255,255,255,0.85)] bg-black/40 rounded p-3 overflow-x-auto">
{`Sharma, D. (2026). "The Number That Misleads: How Real Prospectuses
Disclose Leverage, and Why the Scariest Figure Means the Least."
ProvenLex Field Note NOTE-03. Luxembourg. 25 June 2026.`}
          </pre>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mt-4">
            Released under Creative Commons Attribution 4.0 International. Reproduce, distribute,
            and build on it with attribution.
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
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-[rgba(255,255,255,0.82)] leading-relaxed">{children}</p>
}
