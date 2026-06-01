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
          <Shield className="w-4 h-4 text-[#00ff88]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00ff88]">PRIVACY POLICY</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="text-3xl md:text-4xl font-black mb-3">Privacy Policy</h1>
        <p className="text-[rgba(255,255,255,0.45)] text-sm mb-10">Effective 2026-05-29 · Last updated 2026-05-29</p>

        <div className="prose-custom space-y-8 text-[14px] leading-relaxed text-[rgba(255,255,255,0.75)]">

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">DATA WE COLLECT</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong className="text-white">Email address</strong> — when you sign in via magic link. Stored in encrypted session cookies (iron-session, HttpOnly, SameSite=Lax).</li>
              <li><strong className="text-white">Fund analyses you save</strong> — title, score, verdict, jurisdiction. Stored in Vercel KV keyed by your email.</li>
              <li><strong className="text-white">Audit packs and legal opinions you generate</strong> — question text, output, Merkle hash. Stored in Vercel KV.</li>
              <li><strong className="text-white">Alert preferences</strong> — Slack webhook URL, opt-in toggles. Stored in Vercel KV.</li>
              <li><strong className="text-white">API key usage</strong> — request counts per hour for rate limiting. Stored in Vercel KV, expires after 24 hours.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">DATA WE DO NOT COLLECT</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li>We do not collect analytics, cookies, or third-party trackers.</li>
              <li>We do not collect your prospectus PDFs after analysis. PDFs are sent to Groq for text extraction, then discarded.</li>
              <li>We do not collect IP addresses beyond Vercel&apos;s standard request logging (retained 7 days).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">THIRD PARTIES</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong className="text-white">Groq</strong> (llama-3.3-70b inference) — receives compliance questions, prospectus text, audit requests. Used for response generation only. Groq does not retain data per their privacy policy.</li>
              <li><strong className="text-white">Resend</strong> — sends magic-link sign-in emails and daily briefings. Receives your email address only.</li>
              <li><strong className="text-white">Vercel</strong> — hosts the application. Standard hosting logs retained per Vercel&apos;s policy.</li>
              <li><strong className="text-white">OFAC SDN</strong>, <strong className="text-white">GLEIF</strong>, <strong className="text-white">Frankfurter/ECB</strong> — public data sources we query, no personal data sent.</li>
              <li><strong className="text-white">Stripe</strong> (if you upgrade) — handles payment data per their PCI-DSS Level 1 certification.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">YOUR RIGHTS (GDPR)</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong className="text-white">Right to access</strong> — email <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#00ff88]">daman.sharma.2310@gmail.com</a> for a JSON export of all your data.</li>
              <li><strong className="text-white">Right to deletion</strong> — sign out and email us; we delete your KV records within 7 days.</li>
              <li><strong className="text-white">Right to rectification</strong> — update saved analyses via the dashboard.</li>
              <li><strong className="text-white">Right to portability</strong> — your saved analyses and audit packs are downloadable as signed PDFs.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">SECURITY</h2>
            <p>All traffic is HTTPS. Session cookies are signed with a 64-byte secret and rotated on the server. API keys are stored hashed (SHA-256) — the plaintext is shown to you once on creation and never retrievable. Every audit/opinion PDF is Merkle-anchored with cryptographic proof, so you can verify nothing was tampered with after generation.</p>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#00ff88] font-black mb-3">CONTACT</h2>
            <p>Genesis Swarm RegTech AI — Luxembourg. Privacy questions: <a href="mailto:daman.sharma.2310@gmail.com" className="text-[#00ff88]">daman.sharma.2310@gmail.com</a></p>
          </section>

        </div>
      </div>
    </div>
  )
}
