import Link from 'next/link'
import { ArrowLeft, FileText, Calendar, Hash, SlidersHorizontal } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'NOTE-02 · Extraction Is the Hard Part — why automated AIFMD II checking is harder than the AI vendors admit',
  description:
    'A practitioner field note: the AIFMD II quantitative rules are arithmetic; the hard part is getting the numbers out of a real prospectus. Findings from running a deterministic engine over real public Luxembourg prospectuses — why the figures are present but not machine-readable, why an LLM hides this wall by guessing, and why honest tooling should sometimes refuse to answer.',
}

export default function Note02Page() {
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
          <span className="text-sm font-bold tracking-[0.18em] text-[#5B8DEF]">NOTE-02</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">field note · CC-BY 4.0</span>
        </div>
      </header>

      <article className="relative max-w-3xl mx-auto px-6 py-12 prose-paper">

        <div className="mb-10 pb-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#5B8DEF] font-mono font-bold mb-3">
            PROVENLEX · FIELD NOTE 02 · 2026
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight mb-5">
            {`Extraction Is the Hard Part`}<br />
            <span className="text-[rgba(255,255,255,0.65)] font-bold">Why automated AIFMD&nbsp;II checking is harder than the AI vendors admit</span>
          </h1>
          <div className="text-[12px] text-[rgba(255,255,255,0.6)] mb-1">
            <strong className="text-white">Daman Sharma</strong>
            <span className="mx-2">·</span>
            ProvenLex
            <span className="mx-2">·</span>
            <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#5B8DEF] hover:underline">daman.sharma.2310@gmail.com</a>
          </div>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.45)] mt-4">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 20 June 2026</span>
            <span>CC-BY 4.0</span>
          </div>
        </div>

        <Section h="Abstract">
          <P>{`AIFMD II's quantitative limits are arithmetic — a calculator can apply them. The hard part, the part nobody selling "AI compliance" wants to discuss, is getting the numbers out of a real prospectus. This note reports what I found running a deterministic engine over a handful of real, public Luxembourg fund prospectuses: the figures are present in the documents but rarely machine-readable, an LLM hides that wall by guessing, and naive matching over-flags as readily as naive extraction under-reads. The honest conclusion is uncomfortable — good compliance tooling should sometimes refuse to answer.`}</P>
        </Section>

        <Section h="1. The rules are the easy part">
          <P>{`AIFMD II's quantitative limits are, frankly, arithmetic. A loan-originating AIF's leverage is capped at 175% of NAV if open-ended, 300% if closed-ended. It must retain 5% of the notional of loans it originates and sells. No single borrower may exceed 20% of capital. Check a number against a threshold — that is the whole rule.`}</P>
          <P>{`If applying the rule is a calculator's job, then the rule is not where the difficulty lives. The difficulty is upstream: getting the right number, attached to the right meaning, out of the document. That is the problem worth writing about.`}</P>
        </Section>

        <Section h="2. The numbers are there — they are just not machine-readable">
          <P>{`I ran a deterministic engine over a handful of real, public Luxembourg fund prospectuses to see how the inputs actually behave. Every one extracted as a wall of flattened text — roughly 380,000 to 1.8 million characters each. The figures that matter live in tables, footnotes and appendices, and those structures collapse on extraction. Holding tables came out empty every single time.`}</P>
          <P>{`The disclosures are unmistakably present — each document mentions leverage, the 175/300 thresholds, retention, single-issuer language. But reliably pairing a specific number with its specific meaning, automatically, failed more often than it succeeded. That is the wall. And it is precisely the wall an LLM-based tool hides from you.`}</P>
        </Section>

        <Section h="3. An AI tool does not fail visibly here. It guesses.">
          <P>{`Hand a language model a million characters of messy prospectus and ask "what is the leverage cap?" and it will almost always return a confident, plausible-looking number. In most applications a plausible guess is fine. In compliance it is catastrophic — because a confident wrong answer is indistinguishable from a correct one until a regulator, or an investor's lawyer, finds the gap.`}</P>
          <P>{`The failure is silent. You do not get an error; you get a clean, wrong "compliant." A tool that is wrong loudly is recoverable. A tool that is wrong quietly is the thing you cannot put your name behind.`}</P>
        </Section>

        <Section h="4. Over-flagging is the same problem wearing the opposite mask">
          <P>{`Precision is as dangerous to get wrong as recall. My own first-pass loan-origination detector — keyword-based — flagged three general, non-loan-originating funds as loan-originating AIFs. Why? Because the words "loan", "credit" and "lending" appear somewhere in a half-million-character document.`}</P>
          <P>{`But AIFMD II's leverage, retention and concentration caps bind only loan-originating AIFs. Flag a general fund against them and you have produced a false breach — and a compliance officer who gets one false breach stops trusting the tool entirely. I am reporting my own false positive on purpose: naive matching over-flags exactly as readily as naive extraction under-reads, and pretending otherwise is how trust gets burned.`}</P>
        </Section>

        <Section h="5. The honest answer is unglamorous">
          <P>{`If the rules are easy and the reading is hard, then a trustworthy tool has to be honest about the reading. Three principles fall out of that.`}</P>
          <P>{`Deterministic, not generative. Rules and arithmetic in the decision path — reproducible, inspectable, no guessing. The same document yields the same verdict every time, and you can see exactly which line the engine read.`}</P>
          <P>{`Fail loud. When a document cannot be read cleanly, return insufficient data — never a fabricated verdict. A tool that sometimes says "I cannot read this" is more trustworthy than one that always has an answer.`}</P>
          <P>{`Keep a human in the loop. Where the machine cannot extract a figure, let a person enter it — and run the same rules on it. Accountability stays where it belongs: with the human who signs the report.`}</P>
        </Section>

        <Section h="6. Conclusion">
          <P>{`The uncomfortable conclusion is that good compliance tooling should sometimes refuse to answer. That sounds like a weakness. It is not. In a domain where a Conducting Officer puts their name on the result, a tool that knows the limits of what it can read is not less useful than one that always responds — it is the only kind you can actually use.`}</P>
          <P>{`The rules were never the moat. Honesty about the document is. I am building this in the open, from India, aimed at Luxembourg. If you work in fund compliance and think I have got something wrong, I genuinely want to hear it.`}</P>
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
{`Sharma, D. (2026). "Extraction Is the Hard Part: Why Automated
AIFMD II Checking Is Harder Than the AI Vendors Admit."
ProvenLex Field Note NOTE-02. Luxembourg. 20 June 2026.`}
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
