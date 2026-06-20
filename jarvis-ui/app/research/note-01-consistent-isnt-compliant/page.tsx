import Link from 'next/link'
import { ArrowLeft, FileText, Calendar, Hash, ScanLine } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'NOTE-01 · Consistent Isn\'t Compliant — teaching software to read fund prospectuses',
  description:
    'A practitioner field note on building a deterministic AIFMD II prospectus checker: why internal consistency is not legal compliance, why the same rule is written many ways, and the honest limits of deterministic checking.',
}

export default function Note01Page() {
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
          <span className="text-sm font-bold tracking-[0.18em] text-[#5B8DEF]">NOTE-01</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">field note · CC-BY 4.0</span>
        </div>
      </header>

      <article className="relative max-w-3xl mx-auto px-6 py-12 prose-paper">

        <div className="mb-10 pb-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#5B8DEF] font-mono font-bold mb-3">
            PROVENLEX · FIELD NOTE 01 · 2026
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight mb-5">
            {`Consistent Isn't Compliant`}<br />
            <span className="text-[rgba(255,255,255,0.65)] font-bold">Teaching software to read fund prospectuses</span>
          </h1>
          <div className="text-[12px] text-[rgba(255,255,255,0.6)] mb-1">
            <strong className="text-white">Daman Sharma</strong>
            <span className="mx-2">·</span>
            ProvenLex
            <span className="mx-2">·</span>
            <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#5B8DEF] hover:underline">daman.sharma.2310@gmail.com</a>
          </div>
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.45)] mt-4">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 7 June 2026</span>
            <span>CC-BY 4.0</span>
          </div>
        </div>

        <Section h="Abstract">
          <P>{`A practitioner's note on building a deterministic AIFMD II prospectus checker — software that reads a fund prospectus and tests it against the law, with no LLM in the decision path. Three findings, none of which I expected when I started.`}</P>
        </Section>

        <Section h="1. Consistent and compliant are different questions">
          <P>{`Most document checks ask one thing: does this prospectus agree with itself? Do the numbers in the table match the numbers in the text. That is useful, but it is not the question the regulator is asking. The regulator asks whether the document agrees with AIFMD.`}</P>
          <P>{`A prospectus can be internally flawless — every figure ties out — and still breach the law. Leverage stated at 200% reads fine on its own; against the 175% statutory cap for an open-ended loan-originating AIF, it is a breach. A self-consistency check waves it straight through. That gap is the whole reason I built this.`}</P>
        </Section>

        <Section h="2. The same rule is written a hundred ways">
          <P>{`Nobody warns you about this part. "Retain 5% of the notional" shows up as "5 per cent.", "five percent", "a 5% economic interest". Leverage shows up as "200% of NAV", "2x NAV", "gross exposure of 2.0 times net assets". To a person these are obviously the same number. To software, each is a separate parsing problem.`}</P>
          <P>{`And if you miss one, you do not raise a false alarm — you do something worse. You report nothing, and the document looks clean. I learned this the hard way and spent a day widening the parser. The lesson stuck: in compliance tooling, the dangerous failure is not a wrong answer. It is a confident silence.`}</P>
        </Section>

        <Section h="3. The honest limit: numbers, not structure">
          <P>{`The checker catches quantitative breaches — leverage, retention, single-borrower concentration — because those are arithmetic, and arithmetic is reproducible. What it does not yet catch are the structural rules: whether a loan-originating AIF should be closed-ended, whether it is lending to related parties. Those need judgment the engine does not have.`}</P>
          <P>{`I would rather say that plainly than pretend otherwise. A compliance tool you cannot trust on its own limits is not a compliance tool.`}</P>
        </Section>

        <Section h="4. Why deterministic, not AI">
          <P>{`A compliance officer cannot put their name behind "the AI said so." So the design rule is simple: same document in, same verdict out, every time — with the exact line the engine read and a SHA-256 hash you can re-check. No black box in the decision path. That is the only kind of automation I would trust near a regulator, so it is the only kind I am willing to build.`}</P>
          <P>{`I am building this in the open, from India, aimed at Luxembourg. If you work in fund compliance and think I have got something wrong, I genuinely want to hear it. That is worth more to me than a compliment.`}</P>
        </Section>

        <div className="flex flex-wrap gap-3 mb-10">
          <Link href="/shadow" className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] uppercase tracking-wider font-bold"
            style={{ background: 'rgba(91,141,239,0.12)', border: '1px solid rgba(91,141,239,0.3)', color: '#5B8DEF' }}>
            <ScanLine className="w-3.5 h-3.5" /> See the engine run
          </Link>
        </div>

        <section className="rounded-2xl p-5" style={{ background: 'rgba(91,141,239,0.04)', border: '1px solid rgba(91,141,239,0.25)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-[#5B8DEF]" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#5B8DEF]">Cite as</span>
          </div>
          <pre className="text-[11px] font-mono text-[rgba(255,255,255,0.85)] bg-black/40 rounded p-3 overflow-x-auto">
{`Sharma, D. (2026). "Consistent Isn't Compliant: Teaching Software to
Read Fund Prospectuses." ProvenLex Field Note NOTE-01.
Luxembourg. 7 June 2026.`}
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
