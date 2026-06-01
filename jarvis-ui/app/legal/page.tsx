import Link from 'next/link'
import { ArrowLeft, ScrollText, ShieldCheck, AlertOctagon, Mail, Lock, FileText, Hash } from 'lucide-react'

export const metadata = {
  title: 'Legal · Terms · Right to Erasure · Genesis Swarm',
  description: 'Terms of use, AI disclaimer, GDPR notice, and right-to-erasure procedure for Genesis Swarm operational-risk analysis platform.',
}

export default function LegalPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <ScrollText className="w-4 h-4 text-[#ffaa00]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ffaa00]">LEGAL</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">v1.0 · effective 2026-05-30</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{ background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.3)' }}>
            <ShieldCheck className="w-3 h-3 text-[#ffaa00]" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#ffaa00]">
              Plain-English terms · binding when you use Genesis Swarm
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'clamp(2.5rem, 5vw, 3.5rem)', lineHeight: 1.05 }}>
            <span className="text-white">Terms of use,</span>
            <br />
            <span style={{ background: 'linear-gradient(90deg, #ffaa00 0%, #ff7700 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              honestly written.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.55)] text-sm max-w-2xl mx-auto leading-relaxed">
            What we do, what we don't do, your rights, and how to ask us to stop.
          </p>
        </div>

        {/* THE BIG DISCLAIMER */}
        <Section icon={AlertOctagon} accent="#ff3366" title="§ 1 — What Genesis Swarm is and is not">
          <p>
            <strong className="text-white">Genesis Swarm is an experimental AI research platform</strong> that produces
            operational-risk analyses, forecasts, and forensic-style narratives about financial entities, using public
            data and large language models (Groq llama-3.3-70b primarily).
          </p>
          <p>
            Outputs on Genesis Swarm <strong className="text-white">are not</strong>:
          </p>
          <ul className="space-y-1.5 text-[rgba(255,255,255,0.7)]">
            <li>— a credit rating (we are not registered under the EU CRA Regulation)</li>
            <li>— investment, legal, tax, or accounting advice</li>
            <li>— a regulatory determination by any supervisory authority</li>
            <li>— a factual accusation of fraud, wrongdoing, or criminality against any named entity</li>
            <li>— a recommendation to buy, sell, hold, or short any financial instrument</li>
          </ul>
          <p className="mt-3">
            Outputs <strong className="text-white">are</strong>: AI-generated analytical content, probabilistic in nature,
            with no warranty of accuracy or completeness, intended for educational, research, and journalistic purposes
            under principles of <em>editorial fair comment</em>.
          </p>
        </Section>

        {/* HISTORICAL ARCHETYPES */}
        <Section icon={FileText} accent="#9b6dff" title="§ 2 — On historical archetypes">
          <p>
            Several Genesis Swarm features reference historical fraud cases (Wirecard, Archegos, FTX, Greensill, Madoff).
            These are referenced <strong className="text-white">as analytical pattern templates only</strong> — never as
            assertions that any current subject of analysis is engaged in similar conduct.
          </p>
          <p>
            When the system reports a "pattern match" against an archetype, this means that one or more structural
            features (e.g. concentration, opacity, leverage profile) statistically resembles the archetype's known
            structure. It does <strong className="text-white">not</strong> mean that the subject is committing the same conduct.
          </p>
        </Section>

        {/* THE COURT */}
        <Section icon={Hash} accent="#4a9eff" title="§ 3 — On the Constitutional Court">
          <p>
            The "Constitutional Court" feature simulates a three-AI deliberation (Prosecution, Defense, Chief Justice)
            on a subject entity. The Court's <strong className="text-white">assessments</strong> (CRITICAL, CONCERNED,
            MONITORED, CLEARED) are AI-generated analytical conclusions about <strong className="text-white">operational-risk
            posture</strong>, not legal verdicts. The Court has no judicial authority and no findings of fact are made.
          </p>
          <p>
            The Court never alleges fraud, criminality, or guilt. Subjects appearing before the Court may{' '}
            <a href="#erasure" className="text-[#4a9eff] hover:underline">request that their assessment be removed</a>.
          </p>
        </Section>

        {/* GDPR + RIGHT TO ERASURE */}
        <Section icon={Lock} accent="#00ff88" title="§ 4 — GDPR, personal data, and your rights" id="erasure">
          <p>
            Where Genesis Swarm processes personal data of identifiable individuals (e.g. named executives in a public
            dossier), the lawful basis is <strong className="text-white">Article 6(1)(f) of the GDPR</strong> — legitimate
            interest in research, journalism, and public-interest financial transparency, balanced against the data
            subject's rights.
          </p>
          <p>
            You have the right under GDPR Articles 15-22 to:
          </p>
          <ul className="space-y-1.5 text-[rgba(255,255,255,0.7)]">
            <li>— access the personal data we hold about you</li>
            <li>— request correction of inaccurate data</li>
            <li>— request erasure ("right to be forgotten") under Article 17</li>
            <li>— object to processing under Article 21</li>
            <li>— lodge a complaint with the Luxembourg CNPD (Commission nationale pour la protection des données)</li>
          </ul>
          <div className="mt-4 rounded-lg p-4"
            style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 text-[#00ff88]" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-[#00ff88] font-black">How to make a request</span>
            </div>
            <p className="text-[12px] text-[rgba(255,255,255,0.8)] mb-2">
              Email <a href="mailto:daman.sharma.2310@gmail.com?subject=Genesis%20Swarm%20%E2%80%94%20GDPR%2FErasure%20request"
                className="text-[#00ff88] font-bold hover:underline">daman.sharma.2310@gmail.com</a> with the subject{' '}
              <span className="font-mono text-[#00ff88]">"GDPR/Erasure request"</span>.
            </p>
            <p className="text-[11px] text-[rgba(255,255,255,0.6)]">
              Include: the URL or entity name, the nature of your request, and (if helpful) proof of identity or authority
              to act for the subject. We process requests within <strong className="text-white">30 days</strong>, free of
              charge for first requests.
            </p>
          </div>
        </Section>

        {/* AI WARNINGS */}
        <Section icon={AlertOctagon} accent="#ffaa00" title="§ 5 — AI-specific limitations">
          <p>
            All scoring, narratives, and verdicts are produced by large language models. These models:
          </p>
          <ul className="space-y-1.5 text-[rgba(255,255,255,0.7)]">
            <li>— may hallucinate facts, dates, names, or causal claims</li>
            <li>— have training-data cutoffs and may reference outdated information</li>
            <li>— may exhibit systematic biases not fully understood by the operator</li>
            <li>— are probabilistic — outputs can vary between identical-looking requests</li>
          </ul>
          <p className="mt-3">
            <strong className="text-white">Do not</strong> rely on Genesis Swarm output as your sole basis for
            any consequential decision. Verify independently before acting.
          </p>
        </Section>

        {/* LIABILITY */}
        <Section icon={ShieldCheck} accent="#ff7700" title="§ 6 — Liability limitation">
          <p>
            To the maximum extent permitted by law, Genesis Swarm and its editor are <strong className="text-white">not liable</strong> for:
          </p>
          <ul className="space-y-1.5 text-[rgba(255,255,255,0.7)]">
            <li>— losses arising from reliance on platform output</li>
            <li>— losses arising from inability to access the platform</li>
            <li>— indirect, consequential, or punitive damages</li>
          </ul>
          <p className="mt-3 text-[12px]">
            Some jurisdictions do not allow exclusion of certain warranties or liability limitations — in those
            jurisdictions, our liability is limited to the maximum extent permitted.
          </p>
        </Section>

        {/* GOVERNING LAW */}
        <Section icon={ScrollText} accent="#9b6dff" title="§ 7 — Governing law &amp; contact">
          <p>
            These terms are governed by the laws of the Grand Duchy of Luxembourg. Disputes shall be brought
            before the courts of the city of Luxembourg, without prejudice to mandatory consumer-protection
            provisions of the user's residence.
          </p>
          <p>
            Editor and operator: Daman Sharma · Luxembourg.{' '}
            <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#9b6dff] hover:underline">
              daman.sharma.2310@gmail.com
            </a>
          </p>
          <p className="text-[11px] text-[rgba(255,255,255,0.5)] italic mt-2">
            These terms are provided as good-faith protective scaffolding pending professional legal review.
            They are not a substitute for advice from a qualified attorney. Last reviewed by editor: 2026-05-30.
          </p>
        </Section>

      </div>
    </div>
  )
}

function Section({ icon: Icon, accent, title, id, children }: { icon: React.ElementType; accent: string; title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 rounded-2xl p-6 scroll-mt-20"
      style={{ background: `${accent}04`, border: `1px solid ${accent}20` }}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5" style={{ color: accent }} />
        <h2 className="text-[18px] font-black" style={{ color: accent }}>{title}</h2>
      </div>
      <div className="space-y-3 text-[13px] leading-relaxed text-[rgba(255,255,255,0.78)]">
        {children}
      </div>
    </section>
  )
}
