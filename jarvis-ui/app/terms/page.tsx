import Link from 'next/link'
import { ArrowLeft, ScrollText } from 'lucide-react'

export const metadata = {
  title: 'Terms of Service · ProvenLex',
  description: 'Terms governing use of the ProvenLex deterministic compliance scanner and its public-data lookups.',
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
          <ScrollText className="w-4 h-4 text-[#5B8DEF]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#5B8DEF]">TERMS OF SERVICE</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">Effective 2026-06-14 · v2.0</span>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-14 prose prose-invert">
        <h1 className="text-3xl md:text-4xl font-black mb-3">Terms of Service</h1>
        <p className="text-[rgba(255,255,255,0.5)] text-[12px] mb-10">Last updated: 14 June 2026 · Effective immediately</p>

        <Section h="1. Acceptance of Terms">
          <p>By accessing or using ProvenLex (the &ldquo;Service&rdquo;) at genesis-swarm.vercel.app, you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree, do not use the Service.</p>
        </Section>

        <Section h="2. The Service">
          <p>ProvenLex is a <strong>deterministic compliance-checking tool</strong>. It reads a fund document you paste or upload and checks the limits it declares (and its holdings) against the document&apos;s own caps and the AIFMD&nbsp;II / UCITS statutory limits. The analysis runs <strong>entirely in your browser using arithmetic and the regulation text — there is no large language model involved</strong>, so every result is reproducible.</p>
          <p>The Service also offers look-ups of public reference data (OFAC / EU sanctions lists, GLEIF legal-entity identifiers, ECB reference rates). It is provided free of charge. It does not publish risk scores, predictions, or assessments about any third-party entity.</p>
        </Section>

        <Section h="3. Information Only · Not Advice">
          <p>All output of the Service is <strong>information only</strong>: a deterministic analysis of the document you provide, with citations to the relevant provisions. Nothing on the Service constitutes investment advice, legal advice, accounting advice, or any other regulated advice, and nothing should be relied upon as the sole basis for any regulatory filing, investment decision, or commercial transaction.</p>
          <p>You remain responsible for your own compliance. Consult a qualified independent advisor before acting on any result. The Service is an aid to review, not a substitute for professional judgement.</p>
        </Section>

        <Section h="4. Your Documents">
          <p>Documents you paste or upload into the scanner are processed <strong>locally in your browser and are not transmitted to or stored by us</strong>. If you create an account, data you choose to save (e.g. saved scan results) is handled as described in our <Link href="/privacy" className="text-[#5B8DEF]">Privacy Policy</Link>.</p>
        </Section>

        <Section h="5. Acceptable Use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1 text-[14px]">
            <li>Exceed the documented rate limits on the public API endpoints</li>
            <li>Reverse-engineer the Service other than as permitted by the source-available licence of the published engine code</li>
            <li>Use the Service in any manner that violates applicable law in your jurisdiction</li>
            <li>Represent the Service&apos;s output as regulated advice or as a guarantee of compliance</li>
          </ul>
        </Section>

        <Section h="6. No Warranty">
          <p>The Service is provided &ldquo;as is&rdquo; without warranty of any kind. While the engine is deterministic and reproducible, ProvenLex makes no representation that any result is accurate, complete, current, or fit for a particular purpose — extraction from real-world documents can be incomplete, and the statutory references are summaries, not the official text. Always verify against the primary regulation and your own advisors.</p>
        </Section>

        <Section h="7. Limitation of Liability">
          <p>To the maximum extent permitted by applicable law, ProvenLex and its founder Daman Sharma shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or in connection with your use of the Service. Aggregate liability shall not exceed one hundred euros (€100) per claimant.</p>
        </Section>

        <Section h="8. Governing Law · Jurisdiction">
          <p>These Terms are governed by the laws of the Grand Duchy of Luxembourg. Any dispute arising out of or in connection with these Terms shall be submitted to the exclusive jurisdiction of the Tribunal d&apos;Arrondissement de et à Luxembourg, save where mandatory consumer-protection law confers concurrent jurisdiction.</p>
        </Section>

        <Section h="9. Changes to the Service">
          <p>ProvenLex reserves the right to modify, suspend, or discontinue the Service at any time. Material changes to these Terms will be announced with version history at the top of this page.</p>
        </Section>

        <Section h="10. Contact">
          <p>Questions about these Terms can be sent to <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#5B8DEF]">daman.sharma.2310@gmail.com</a>.</p>
        </Section>

        <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-12">
          See also: <Link href="/privacy" className="text-[#5B8DEF] hover:underline">Privacy Policy</Link> · <Link href="/dpa" className="text-[#5B8DEF] hover:underline">Data Processing Agreement</Link> · <Link href="/security" className="text-[#5B8DEF] hover:underline">Trust &amp; Security</Link>
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
