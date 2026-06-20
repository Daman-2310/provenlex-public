import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(ellipse at top, #0a0a1a 0%, #050508 50%, #000 100%)' }}>
      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Shield className="w-4 h-4 text-[#10D982]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#10D982]">PRIVACY POLICY</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="text-3xl md:text-4xl font-black mb-3">Privacy Policy</h1>
        <p className="text-[rgba(255,255,255,0.45)] text-sm mb-10">Effective 2026-06-13 · Last updated 2026-06-13</p>

        <div className="prose-custom space-y-8 text-[14px] leading-relaxed text-[rgba(255,255,255,0.75)]">

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">THE SHORT VERSION</h2>
            <p>The compliance scanner runs <strong className="text-white">entirely in your browser</strong>. The prospectus or document you paste is analysed locally with deterministic JavaScript — it is <strong className="text-white">never uploaded to a server, and never sent to any AI/LLM</strong>. If you only use the scanner and don&apos;t create an account, we hold no personal data about you.</p>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">WHAT NEVER LEAVES YOUR BROWSER</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong className="text-white">Document text you scan</strong> — the prospectus you paste into <Link href="/scan" className="text-[#10D982]">/scan</Link> is parsed client-side. It is not transmitted to us or to anyone.</li>
              <li><strong className="text-white">No LLM, anywhere.</strong> We do not operate, and do not send your data to, any large language model or AI inference provider. Every verdict is produced by reproducible arithmetic and regex.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">DATA WE COLLECT (ONLY IF YOU OPT IN)</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong className="text-white">Email address</strong> — only if you sign in via magic link. Held in an encrypted, HttpOnly, SameSite session cookie. <span className="text-[rgba(255,255,255,0.55)]">Lawful basis: performance of a contract (giving you an account).</span></li>
              <li><strong className="text-white">Scan results you choose to save</strong> — title, score, verdict, jurisdiction. Stored in Vercel KV keyed to your email. You can delete them at any time.</li>
              <li><strong className="text-white">Alert preferences</strong> — any opt-in toggles you set. Stored in Vercel KV.</li>
              <li><strong className="text-white">API-key usage counts</strong> — per-hour request counts for rate limiting. Stored in Vercel KV and expire within 24 hours.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">ANALYTICS</h2>
            <p>We use <strong className="text-white">Vercel Web Analytics</strong>, which is privacy-friendly and <strong className="text-white">cookieless</strong>: it records aggregate page views, approximate country, and device type. It sets no tracking cookies, builds no advertising profile, and does not follow you across other sites. We use no Google Analytics and no third-party advertising trackers.</p>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">SUB-PROCESSORS</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong className="text-white">Vercel</strong> — hosting and cookieless analytics. Standard request logs.</li>
              <li><strong className="text-white">Upstash / Vercel KV</strong> — stores your saved scans and preferences (only if you have an account).</li>
              <li><strong className="text-white">Resend</strong> — sends magic-link sign-in emails. Receives your email address only.</li>
              <li><strong className="text-white">Stripe</strong> (only if you subscribe) — handles payment data under its PCI-DSS Level 1 certification. We never see your card details.</li>
              <li><strong className="text-white">OFAC SDN</strong>, <strong className="text-white">GLEIF</strong>, <strong className="text-white">ECB / Frankfurter</strong> — public reference sources. Sanctions and LEI lookups send only the public identifier you query; no personal data of yours is sent.</li>
              <li className="text-[rgba(255,255,255,0.6)]">We do <strong className="text-white">not</strong> use Groq, Anthropic, OpenAI, or any other LLM/AI provider as a sub-processor. There is no AI in the data path.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">YOUR RIGHTS (GDPR)</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong className="text-white">Access &amp; portability</strong> — email us for a machine-readable export of any data tied to your account.</li>
              <li><strong className="text-white">Erasure</strong> — email us and we delete your account records within 7 days.</li>
              <li><strong className="text-white">Rectification</strong> — correct or update your saved data from the dashboard.</li>
              <li><strong className="text-white">Objection &amp; restriction</strong> — ask us to stop or limit processing.</li>
              <li><strong className="text-white">Complaint</strong> — you may lodge a complaint with your local data-protection supervisory authority.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">SECURITY</h2>
            <p>All traffic is served over HTTPS. Session cookies are signed and rotated server-side. API keys are stored hashed (SHA-256) — the plaintext is shown once on creation and is never retrievable. Records in the evidence vault are SHA-256 chained and roll up into a Merkle root, so any change is detectable.</p>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#10D982] font-black mb-3">WHO WE ARE &amp; CONTACT</h2>
            <p>ProvenLex is an independent, source-available compliance-tooling project, operated by its founder pending formal incorporation in the EU. For any privacy request or question, contact <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#10D982]">daman.sharma.2310@gmail.com</a>.</p>
          </section>

          <p className="text-[11px] text-[rgba(255,255,255,0.4)] pt-2">See also <Link href="/security" className="text-[#10D982]">Trust &amp; Security</Link> and <Link href="/terms" className="text-[#10D982]">Terms</Link>. This notice is information about our practices, not legal advice.</p>

        </div>
      </div>
    </div>
  )
}
