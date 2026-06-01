import Link from 'next/link'
import { ArrowLeft, ScrollText } from 'lucide-react'

export const metadata = {
  title: 'Terms of Service · Genesis Swarm',
  description: 'Terms governing use of Genesis Swarm services, the Book of Genesis, the Watch List, and the public risk-scoring API.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <ScrollText className="w-4 h-4 text-[#9b6dff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#9b6dff]">TERMS OF SERVICE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">Effective 2026-05-30 · v1.0</span>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-14 prose prose-invert">
        <h1 className="text-3xl md:text-4xl font-black mb-3">Terms of Service</h1>
        <p className="text-[rgba(255,255,255,0.5)] text-[12px] mb-10">Last updated: 30 May 2026 · Effective immediately</p>

        <Section h="1. Acceptance of Terms">
          <p>By accessing or using Genesis Swarm (the &ldquo;Service&rdquo;) at genesis-swarm-rgq5.vercel.app, you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree, do not use the Service.</p>
        </Section>

        <Section h="2. The Service">
          <p>Genesis Swarm provides AI-driven operational-risk scoring of European financial entities through public ledgers (the Book of Genesis, the Watch List, the Foresight Lab) and a set of APIs. All scoring is published as analytical opinion based on public-record sources and is provided free of charge for non-commercial use.</p>
          <p>Commercial use of bulk API data, redistribution of the Book of Genesis ledger, or integration into a competing product requires a separate written licence — contact <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#9b6dff]">daman.sharma.2310@gmail.com</a>.</p>
        </Section>

        <Section h="3. Analytical Opinion · Not Investment Advice">
          <p>All Pre-Crime Index scores, Watch List entries, Mirror drift assessments, Twin stress simulations, Network contagion metrics, and Obituary backcasts published on the Service constitute <strong>analytical opinion</strong> under freedom-of-expression protections (Article 10 ECHR, Article 11 EU Charter of Fundamental Rights).</p>
          <p>Nothing on the Service constitutes investment advice, legal advice, accounting advice, or any other form of regulated advice. No content on the Service should be relied on as a basis for any investment decision, divestment decision, regulatory filing, or commercial transaction. You should consult a qualified independent advisor before taking any action based on Service content.</p>
        </Section>

        <Section h="4. No Allegation of Wrongdoing">
          <p>The Service does not allege fraud, criminal conduct, insolvency, regulatory violation, or wrongdoing by any named entity. References to historical archetypes (Wirecard, Greensill, Archegos, FTX, SVB, Madoff) are intended as structural-pattern analogies and do not impute any conduct to the analogised entity.</p>
          <p>Affected entities have an unrestricted right of reply at <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#9b6dff]">daman.sharma.2310@gmail.com</a>. Factual corrections will be published as footnotes on the affected entry within seven days of substantiation.</p>
        </Section>

        <Section h="5. Acceptable Use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1 text-[14px]">
            <li>Use the Service for high-frequency automated querying that materially exceeds the rate-limiting bounds documented on the API endpoints (currently 60 requests per minute per IP for unauthenticated access)</li>
            <li>Reverse-engineer, mirror, or republish the Book of Genesis ledger in bulk without a written licence</li>
            <li>Submit false, defamatory, or unverifiable tips to the Whistleblower endpoint</li>
            <li>Use the Service in any manner that violates applicable law in your jurisdiction</li>
          </ul>
        </Section>

        <Section h="6. No Warranty">
          <p>The Service is provided &ldquo;as is&rdquo; without warranty of any kind. Genesis Swarm makes no representation that any score, prediction, or analysis is accurate, complete, current, or fit for any particular purpose. Predictions may fail to vindicate within their stated reveal window; in which case the affected edition is publicly retired and explained.</p>
        </Section>

        <Section h="7. Limitation of Liability">
          <p>To the maximum extent permitted by applicable law, Genesis Swarm and its founder Daman Sharma shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or in connection with your use of the Service. Aggregate liability shall not exceed one hundred euros (€100) per claimant.</p>
        </Section>

        <Section h="8. Governing Law · Jurisdiction">
          <p>These Terms are governed by the laws of the Grand Duchy of Luxembourg. Any dispute arising out of or in connection with these Terms shall be submitted to the exclusive jurisdiction of the Tribunal d&apos;Arrondissement de et à Luxembourg, save where mandatory consumer-protection law confers concurrent jurisdiction.</p>
        </Section>

        <Section h="9. Changes to the Service">
          <p>Genesis Swarm reserves the right to modify, suspend, or discontinue the Service at any time. Material changes to these Terms will be announced at least thirty (30) days in advance with version history at the top of this page.</p>
        </Section>

        <Section h="10. Contact">
          <p>Questions about these Terms can be sent to <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#9b6dff]">daman.sharma.2310@gmail.com</a>.</p>
        </Section>

        <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-12">
          See also: <Link href="/privacy" className="text-[#9b6dff] hover:underline">Privacy Policy</Link> · <Link href="/dpa" className="text-[#9b6dff] hover:underline">Data Processing Agreement</Link> · <Link href="/legal" className="text-[#9b6dff] hover:underline">Legal disclaimer</Link>
        </div>
      </article>
    </div>
  )
}

function Section({ h, children }: { h: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-white mb-3">{h}</h2>
      <div className="text-[14px] text-[rgba(255,255,255,0.78)] leading-relaxed space-y-3">{children}</div>
    </section>
  )
}
