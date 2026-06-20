import Link from 'next/link'
import { ArrowLeft, ShieldCheck, Lock, Eye, GitBranch, Fingerprint, AlertCircle, Mail } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'

export const metadata = {
  title: 'Trust & Security · ProvenLex',
  description: 'How ProvenLex handles data, what cryptography it uses, what is production vs reference implementation, and how to report a vulnerability.',
}

const ACCENT = '#5B8DEF'

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-5" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2 mb-3" style={{ color: ACCENT }}>
        {icon}
        <h2 className="text-[12px] uppercase tracking-[0.18em] font-black text-white">{title}</h2>
      </div>
      <div className="text-[12px] text-[rgba(255,255,255,0.7)] leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function SecurityPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="void" accent={ACCENT} />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <ShieldCheck className="w-4 h-4" style={{ color: ACCENT }} />
          <span className="text-sm font-bold tracking-[0.18em]" style={{ color: ACCENT }}>TRUST & SECURITY</span>
        </div>
      </header>

      <div className="relative max-w-3xl mx-auto px-6 py-12 space-y-4">
        <div className="mb-4">
          <h1 className="font-black tracking-tight mb-3" style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)', lineHeight: 1 }}>Trust, stated plainly.</h1>
          <p className="text-[rgba(255,255,255,0.6)] text-sm leading-relaxed">
            Compliance software is only worth trusting if it tells you exactly how it works and what it doesn&apos;t do.
            Here is the unembellished version — including which parts are production and which are reference implementations.
          </p>
        </div>

        <Section icon={<Eye className="w-4 h-4" />} title="Data handling">
          <p>The <Link href="/scan" className="underline hover:text-white">compliance scanner</Link> runs <b className="text-white">entirely in your browser</b>. The document you paste is never uploaded to a server — it is analysed locally with deterministic JavaScript.</p>
          <p>The <Link href="/vault" className="underline hover:text-white">Evidence Vault</Link> is stored in your browser&apos;s local storage. The only outbound call the analytical tools make is the optional <b className="text-white">live LEI lookup</b>, which sends a 20-character LEI (public data) to the GLEIF registry.</p>
        </Section>

        <Section icon={<Fingerprint className="w-4 h-4" />} title="Cryptography">
          <p>• <b className="text-white">Integrity:</b> records are hashed with SHA-256 and chained; a vault rolls up into a binary <b className="text-white">Merkle root</b>, so any change to any record changes the root.</p>
          <p>• <b className="text-white">Authorship:</b> the root can be signed with a real <b className="text-white">Ed25519</b> signature. The public key is served at <span className="font-mono text-[rgba(255,255,255,0.6)]">/api/sign</span> (GET) and any signature verifies with standard Ed25519 — no ProvenLex code required.</p>
          <p>• <b className="text-white">Provenance:</b> every verdict is stamped with the dated ruleset version (and a UTC timestamp) that produced it, so a result stays re-verifiable against a named body of rules even after the law changes.</p>
        </Section>

        <Section icon={<ShieldCheck className="w-4 h-4" />} title="No LLM. Anywhere.">
          <p>The compliance engines (<Link href="/scan" className="underline hover:text-white">/scan</Link>, <Link href="/lux" className="underline hover:text-white">/lux</Link>) are pure arithmetic and regex — <b className="text-white">no large language model decides a verdict</b>, so every result is reproducible and auditable.</p>
          <p>This goes further than the verdict path. <b className="text-white">There is no LLM anywhere in this product</b> — no chat, no document reader, no background AI. We removed every third-party model integration (Groq, Anthropic, and others). Nothing you submit is ever sent to an AI provider, because there is no code path to one.</p>
        </Section>

        <Section icon={<GitBranch className="w-4 h-4" />} title="Source available">
          <p>The engine code is public for inspection — no NDA required for technical review:{' '}
            <a href="https://github.com/Daman-2310/genesis-swarm-public" target="_blank" rel="noopener noreferrer" className="underline hover:text-white" style={{ color: ACCENT }}>github.com/Daman-2310/genesis-swarm-public</a>. The test suite verifies the engines against worked examples.</p>
        </Section>

        <Section icon={<AlertCircle className="w-4 h-4" />} title="Production vs reference implementation (read this)">
          <p>Radical honesty, because a compliance buyer deserves it:</p>
          <p>• <b className="text-white">Production-grade today:</b> the deterministic compliance engines, the regulatory citations, SHA-256/Merkle integrity, Ed25519 signing, and the live GLEIF lookup.</p>
          <p>• <b className="text-white">Reference implementation (not yet the system of record):</b> the Evidence Vault currently persists in your browser, and the peer benchmark uses a labelled reference distribution layered with anonymised local samples. The production system of record is a server-persisted, per-tenant ledger with a KMS-held signing key — on the near-term roadmap, not live yet.</p>
          <p>We would rather tell you this than have you discover it.</p>
        </Section>

        <Section icon={<Mail className="w-4 h-4" />} title="Responsible disclosure">
          <p>Found a security issue or a flaw in an engine&apos;s logic? Please email{' '}
            <a href="mailto:daman.sharma.2310@gmail.com" className="underline hover:text-white" style={{ color: ACCENT }}>daman.sharma.2310@gmail.com</a>{' '}
            before disclosing publicly. We respond quickly and credit reporters.</p>
        </Section>

        <div className="text-[10px] text-[rgba(255,255,255,0.35)] pt-2">
          See also <Link href="/privacy" className="underline hover:text-white">privacy</Link> and <Link href="/terms" className="underline hover:text-white">terms</Link>.
        </div>
      </div>
    </div>
  )
}
