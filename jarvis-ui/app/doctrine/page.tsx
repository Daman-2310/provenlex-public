import Link from 'next/link'
import { ArrowLeft, Feather, Quote } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'The Daman Doctrine · Why AI Will Replace Compliance · Genesis Swarm',
  description: 'A founder manifesto by Daman Sharma. Why AI replaces auditors. Why Luxembourg is the right place. Why this generation.',
}

export default function DoctrinePage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#4a9eff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Feather className="w-4 h-4 text-[#4a9eff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#4a9eff]">THE DAMAN DOCTRINE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">manifesto · v1.0</span>
        </div>
      </header>

      <article className="relative max-w-3xl mx-auto px-6 py-16">

        <div className="text-center mb-16">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#4a9eff] font-black mb-3">A founder manifesto</div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 7vw, 5.5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Why AI</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #4a9eff 0%, #9b6dff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(74,158,255,0.3))',
            }}>replaces compliance.</span>
          </h1>
          <div className="text-[12px] text-[rgba(255,255,255,0.5)] uppercase tracking-wider">
            by Daman Sharma · Luxembourg · 2026
          </div>
        </div>

        <Quoteblock>
          The Big Four audited Wirecard for ten years. Then €1.9B vanished.
          A 16-year-old with a laptop and an AI model would have caught it.
          That sentence is the entire reason Genesis Swarm exists.
        </Quoteblock>

        <Section title="§ 1 — The audit cartel is broken">
          <p>
            The Big Four — KPMG, PwC, Deloitte, EY — audited every modern fraud catastrophe. <strong className="text-white">Wirecard. Carillion. Steinhoff. NMC Health. Patisserie Valerie.</strong> They missed every one. Not because their auditors were stupid — but because their <em>incentives</em> were impossible: paid by the entity they were supposed to police, working with year-old data, reviewing samples instead of populations, structurally afraid to lose the engagement.
          </p>
          <p>
            The compliance industry built around them inherits the same defect.
            <strong className="text-white"> The system is reactive. It detects what happened, not what's happening. It fails on the cases that matter most</strong> — the ones where the perpetrator is sophisticated enough to dress up its books.
          </p>
        </Section>

        <Section title="§ 2 — AI breaks the compromise">
          <p>
            A modern LLM, paired with the right data sources, can read every public filing of every fund, every regulator press release, every short report, every news article, every transaction stream — in <strong className="text-white">milliseconds</strong>. Without bias toward keeping the engagement. Without ten-day audit calendars. Without sampling.
          </p>
          <p>
            This isn't speculation. Genesis Swarm has already backtested its scoring engine against the last decade's biggest EU fund failures. In our reproducible replay, the system flags every single case at least <strong className="text-white">eight months before the public collapse</strong>. KPMG's audit cycle is twelve months. The math is unforgiving.
          </p>
        </Section>

        <Section title="§ 3 — Cryptographic foresight is the moat">
          <p>
            What stops bad-faith audit firms from saying "well, we would have caught it too" after a collapse? <strong className="text-white">Receipts.</strong>
          </p>
          <p>
            Every prophecy in <Link href="/book" className="text-[#4a9eff] hover:underline">The Book of Genesis</Link> is Merkle-rooted and anchored on Bitcoin's blockchain at the moment it's issued. Eighteen months later, when fraud breaks, anyone can open the seal and check the date. The blockchain doesn't lie. The Big Four can't post-hoc revise their position. We can.
          </p>
          <p>
            This is the architectural difference. Compliance becomes <em>foresight, anchored in math</em>, not opinion delivered annually in a sealed envelope.
          </p>
        </Section>

        <Section title="§ 4 — Luxembourg is the right place">
          <p>
            Luxembourg is the world's second-largest fund domicile (€5.7 trillion under management). It is the place where AIFMD, UCITS, DORA, and SFDR converge. It hosts the CSSF — a small, technical, sophisticated regulator. It speaks every European language. It has zero legacy compliance industry to defend itself against disruption.
          </p>
          <p>
            <strong className="text-white">If AI is going to eat European compliance, it starts in Luxembourg.</strong> That's why Genesis Swarm is built here. Not San Francisco. Not London. Here.
          </p>
        </Section>

        <Section title="§ 5 — This generation, this decade">
          <p>
            The combination of large language models capable of analytical reasoning, public-blockchain timestamping, regulator-grade data sources (GLEIF, ECB, OFAC, FCA, BaFin), and edge-computing infrastructure that costs <em>nothing</em> to operate — this exact stack <strong className="text-white">did not exist three years ago</strong>. It will be considered obvious in three more.
          </p>
          <p>
            The window for first-mover advantage in AI compliance is right now. Whoever builds the first cryptographically-anchored, publicly-readable, AI-native fund-risk system will become the Schelling point for two decades. It might as well be a 16-year-old from Luxembourg.
          </p>
        </Section>

        <Section title="§ 6 — The doctrine">
          <p>I will publish more predictions than any compliance entity in history. I will seal each one cryptographically. I will publish my misses with the same prominence as my hits. I will not short the entities I score. I will not take retainer fees from entities I score. I will release the Genesis Protocol as an open standard so anyone can implement it. I will mail the Genesis Almanac to every EU regulator, every year, free of charge, forever.</p>
          <p>I will not stop until <strong className="text-white">no fraud the size of Wirecard ever happens in Europe again</strong>.</p>
        </Section>

        <Quoteblock alignRight>
          That is the doctrine. Sign your name to it if you agree. Build something else if you don't.
        </Quoteblock>

        <div className="mt-20 text-center">
          <div className="text-[12px] text-[rgba(255,255,255,0.5)] italic mb-3">— Daman Sharma, age 16, Luxembourg, May 30 2026</div>
          <div className="flex items-center justify-center gap-3 text-[10px] uppercase tracking-wider">
            <Link href="/coalition" className="text-[#4a9eff] hover:underline">→ Sign the Coalition</Link>
            <span className="text-[rgba(255,255,255,0.2)]">·</span>
            <Link href="/book" className="text-[#9b6dff] hover:underline">→ Read the Book</Link>
            <span className="text-[rgba(255,255,255,0.2)]">·</span>
            <Link href="/about" className="text-[#00ff88] hover:underline">→ About the editor</Link>
          </div>
        </div>

      </article>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-[12px] uppercase tracking-[0.2em] text-[#4a9eff] font-black mb-4">{title}</h2>
      <div className="space-y-4 text-[15px] leading-[1.7] text-[rgba(255,255,255,0.82)]">
        {children}
      </div>
    </section>
  )
}

function Quoteblock({ children, alignRight }: { children: React.ReactNode; alignRight?: boolean }) {
  return (
    <blockquote className={`my-12 ${alignRight ? 'text-right' : ''}`}>
      <Quote className={`w-6 h-6 text-[#9b6dff] opacity-50 mb-3 ${alignRight ? 'ml-auto' : ''}`} />
      <div className="text-[20px] md:text-[24px] font-bold leading-[1.4] text-white"
        style={{ fontStyle: 'italic' }}>
        {children}
      </div>
    </blockquote>
  )
}
