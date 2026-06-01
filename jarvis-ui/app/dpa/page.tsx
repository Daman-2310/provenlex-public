import Link from 'next/link'
import { ArrowLeft, Lock } from 'lucide-react'

export const metadata = {
  title: 'Data Processing Agreement (DPA) · Genesis Swarm',
  description: 'GDPR Article 28 Data Processing Agreement between Genesis Swarm and its B2B customers.',
}

export default function DpaPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Lock className="w-4 h-4 text-[#4a9eff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#4a9eff]">DATA PROCESSING AGREEMENT</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">GDPR Art. 28 · v1.0</span>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="text-3xl md:text-4xl font-black mb-3">Data Processing Agreement</h1>
        <p className="text-[rgba(255,255,255,0.5)] text-[12px] mb-3">Pursuant to Article 28 of the General Data Protection Regulation (Regulation (EU) 2016/679)</p>
        <p className="text-[rgba(255,255,255,0.5)] text-[12px] mb-10">Last updated: 30 May 2026 · Effective for all B2B customer agreements</p>

        <Box>
          This DPA forms an integral part of any commercial agreement between <strong className="text-white">Genesis Swarm</strong> (the &ldquo;Processor&rdquo;) and a paying customer (the &ldquo;Controller&rdquo;) when the Service involves the Processor processing personal data on behalf of the Controller. By signing a commercial agreement with the Processor, the Controller is deemed to have accepted this DPA.
        </Box>

        <Section h="1. Definitions">
          <p>Terms used in this DPA have the meanings ascribed to them in Article 4 GDPR. In particular: &ldquo;personal data&rdquo;, &ldquo;processing&rdquo;, &ldquo;controller&rdquo;, &ldquo;processor&rdquo;, &ldquo;sub-processor&rdquo;, &ldquo;data subject&rdquo;, and &ldquo;supervisory authority&rdquo; bear their GDPR meanings.</p>
        </Section>

        <Section h="2. Subject Matter and Duration">
          <p>The Processor shall process personal data on behalf of the Controller only for the duration of the commercial agreement and only for the purposes set out in Section 3. Upon termination, the Processor shall delete or return all personal data within thirty (30) days, save where Union or Member State law requires retention.</p>
        </Section>

        <Section h="3. Nature and Purpose of Processing">
          <p>The Processor processes the following categories of personal data:</p>
          <ul className="list-disc pl-6 space-y-1 text-[14px]">
            <li>Names, email addresses, job titles, and professional affiliations of Controller employees authorised to access the Service</li>
            <li>Audit-log entries identifying which Controller user performed which action on the Service</li>
            <li>Names and public-record details of natural persons in their professional capacity as board members, executives, or signatories of regulated entities, where these appear in public regulatory filings</li>
          </ul>
          <p>Processing is performed solely for the purpose of: (a) providing the Service; (b) generating analytical risk scores; (c) maintaining audit records as required by Service terms; (d) complying with applicable law.</p>
        </Section>

        <Section h="4. Processor Obligations">
          <p>The Processor shall:</p>
          <ul className="list-disc pl-6 space-y-1 text-[14px]">
            <li>Process personal data only on documented instructions from the Controller</li>
            <li>Ensure that persons authorised to process the personal data are bound by confidentiality</li>
            <li>Implement appropriate technical and organisational measures pursuant to Article 32 GDPR (see Annex II)</li>
            <li>Assist the Controller in fulfilling its obligations to respond to data-subject rights requests within seventy-two (72) hours of being notified</li>
            <li>Notify the Controller without undue delay (and in any event within 48 hours) upon becoming aware of a personal data breach</li>
            <li>Make available all information necessary to demonstrate compliance with Article 28 GDPR</li>
            <li>Submit to audits by the Controller or a Controller-appointed third-party auditor, with reasonable notice and at reasonable intervals</li>
          </ul>
        </Section>

        <Section h="5. Sub-processors">
          <p>The Controller authorises the Processor to engage the following sub-processors:</p>
          <div className="rounded-xl overflow-hidden my-3" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(74,158,255,0.2)' }}>
            <div className="grid grid-cols-[1fr_1fr_2fr] gap-3 p-3 text-[10px] uppercase tracking-wider font-bold"
              style={{ borderBottom: '1px solid rgba(74,158,255,0.15)', color: '#4a9eff' }}>
              <div>Sub-processor</div>
              <div>Purpose</div>
              <div>Location · transfers</div>
            </div>
            {[
              ['Vercel Inc.',          'Hosting + edge runtime',    'USA · SCCs in place'],
              ['Upstash, Inc.',        'Redis cache + KV store',    'EU (eu-west-1) · no transfer'],
              ['Groq, Inc.',           'LLM inference',             'USA · SCCs in place'],
              ['Anthropic PBC',        'LLM inference (Court)',     'USA · SCCs in place'],
              ['Resend (Pillar 0 Inc)','Transactional email',       'USA · SCCs in place'],
              ['Stripe Payments Europe Ltd', 'Billing',             'Ireland · within EEA'],
              ['Supabase, Inc.',       'Postgres database (planned)','EU (eu-west-1) · no transfer'],
            ].map(row => (
              <div key={row[0]} className="grid grid-cols-[1fr_1fr_2fr] gap-3 p-3 text-[12px] text-[rgba(255,255,255,0.78)]"
                style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="font-bold text-white">{row[0]}</div>
                <div>{row[1]}</div>
                <div>{row[2]}</div>
              </div>
            ))}
          </div>
          <p>The Processor shall inform the Controller of any intended changes to this sub-processor list with at least thirty (30) days&apos; notice and the Controller may object. Where the Controller objects on reasonable grounds, the Processor shall either decline to engage the proposed sub-processor or permit the Controller to terminate the relevant Services without penalty.</p>
        </Section>

        <Section h="6. International Transfers">
          <p>Where personal data is transferred outside the EEA, transfers occur on the basis of either an adequacy decision (Art. 45 GDPR) or appropriate safeguards including Standard Contractual Clauses (Commission Implementing Decision (EU) 2021/914). The Processor maintains documentation of all transfer instruments.</p>
        </Section>

        <Section h="7. Data-Subject Rights">
          <p>The Processor shall assist the Controller, by appropriate technical and organisational measures, in fulfilling the Controller&apos;s obligation to respond to requests for exercising data-subject rights under Articles 15-22 GDPR. Requests are to be initiated via <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#4a9eff]">daman.sharma.2310@gmail.com</a> with subject prefix <code className="font-mono">GDPR:</code>.</p>
        </Section>

        <Section h="8. Annex I — Subject Matter">
          <p><strong>Categories of data subjects:</strong> Authorised users of the Service (Controller employees); natural persons named in public regulatory filings of entities scored by the Service.</p>
          <p><strong>Categories of personal data:</strong> identification data, contact data, professional employment data, audit-trail metadata.</p>
          <p><strong>Special categories of data:</strong> none. The Processor does not process special-category data within the meaning of Article 9 GDPR.</p>
          <p><strong>Frequency:</strong> continuous for as long as the Service is provided.</p>
        </Section>

        <Section h="9. Annex II — Technical and Organisational Measures">
          <ul className="list-disc pl-6 space-y-1 text-[14px]">
            <li>TLS 1.2+ for all data in transit; AES-256 for data at rest in Supabase/Upstash</li>
            <li>Role-based access control with principle of least privilege</li>
            <li>Audit-log retention of 18 months minimum</li>
            <li>Cryptographic commit of Book ledger to Bitcoin via OpenTimestamps</li>
            <li>Quarterly review of sub-processor list and transfer instruments</li>
            <li>Annual SOC 2 Type II assessment (planned · target 2027)</li>
            <li>Incident response plan with 48-hour notification SLA</li>
          </ul>
        </Section>

        <Section h="10. Contact · DPO">
          <p>For DPA-related queries: <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#4a9eff]">daman.sharma.2310@gmail.com</a></p>
          <p>Pending appointment of a Data Protection Officer (planned upon Luxembourg SARL incorporation in August 2026), the founder Daman Sharma serves as the GDPR point of contact.</p>
          <p>Supervisory authority for Luxembourg: <a href="https://cnpd.public.lu" target="_blank" rel="noopener noreferrer" className="text-[#4a9eff] hover:underline">Commission Nationale pour la Protection des Données (CNPD)</a>.</p>
        </Section>

        <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-12">
          See also: <Link href="/privacy" className="text-[#4a9eff] hover:underline">Privacy Policy</Link> · <Link href="/terms" className="text-[#4a9eff] hover:underline">Terms of Service</Link>
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

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 text-[14px] text-[rgba(255,255,255,0.85)] leading-relaxed mb-8"
      style={{ background: 'rgba(74,158,255,0.06)', border: '1px solid rgba(74,158,255,0.2)' }}>
      {children}
    </div>
  )
}
