import Link from 'next/link'
import { ArrowLeft, ShieldCheck, Lock, Eye, FileText } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import WhistleblowerInterface from './WhistleblowerInterface'

export const metadata = {
  title: 'Genesis Whistleblower · Cryptographically Sealed Insider Tips · Genesis Swarm',
  description: 'Submit insider tips about EU financial entities. Sealed with SHA-256 commitment. We literally cannot read it. Only revealed when you choose.',
}

export default function WhistleblowerPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#ff3388" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <ShieldCheck className="w-4 h-4 text-[#ff3388]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ff3388]">WHISTLEBLOWER</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            Commit-reveal · SHA-256 · We literally cannot read it
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,51,136,0.08)', border: '1px solid rgba(255,51,136,0.3)' }}>
            <Lock className="w-3 h-3 text-[#ff3388]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#ff3388]">
              Insider trust · Cryptographic skin-in-the-game
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Seal your tip now.</span>
            <br />
            <span style={{
              background: 'linear-gradient(90deg, #ff3388 0%, #ff7a00 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,51,136,0.3))',
            }}>Reveal it when you choose.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Type a tip about your employer or counterparty. Your browser hashes it locally.
            Only the hash leaves your machine — we never see what you wrote.
            If you&apos;re right and the entity later collapses publicly, you reveal the tip and prove
            you called it. If you&apos;re wrong, no one ever sees what you said.
          </p>
        </div>

        {/* HOW IT WORKS */}
        <section className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Step icon={<Lock className="w-4 h-4 text-[#ff3388]" />} num="1" title="You type · browser hashes"
                desc="SHA-256(entity || tip || timestamp || random salt) computed in your browser. The tip never touches our servers." />
          <Step icon={<FileText className="w-4 h-4 text-[#ff3388]" />} num="2" title="Hash is sealed publicly"
                desc="Only the hash + entity + timestamp gets stored. The public ledger shows all sealed commits — no one can read your tip." />
          <Step icon={<Eye className="w-4 h-4 text-[#ff3388]" />} num="3" title="You reveal when ready"
                desc="If your prediction comes true, return with (entity, tip, salt). The recomputed hash proves authenticity — and your tip becomes public." />
        </section>

        <WhistleblowerInterface />

        {/* WHY MATTERS */}
        <section className="rounded-2xl p-6 mt-10"
          style={{ background: 'rgba(255,51,136,0.04)', border: '1px solid rgba(255,51,136,0.25)', backdropFilter: 'blur(10px)' }}>
          <ShieldCheck className="w-5 h-5 text-[#ff3388] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ff3388] font-black mb-2">Why insiders trust this and not us</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            Most whistleblower platforms require the insider to trust the platform&apos;s
            operators not to leak, get hacked, or get subpoenaed.
            <strong className="text-white"> We removed that trust entirely.</strong> The tip
            never leaves your browser until you choose. Mathematically we cannot decrypt it
            because we never had it.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            That removes the only reason an honest insider wouldn&apos;t come forward:
            personal risk before the public truth has emerged. Now they seal a commit anonymously
            and only step forward when their evidence is borne out.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            Strategically: over time, the proportion of vindicated Genesis prophecies that came
            with a sealed insider commit becomes the most valuable signal in the whole stack.
            No bot can match a single insider who was right.
          </p>
        </section>

        {/* LEGAL */}
        <div className="mt-8 rounded p-4 text-[11px] text-[rgba(255,255,255,0.55)] leading-relaxed"
          style={{ background: 'rgba(255,170,0,0.04)', border: '1px solid rgba(255,170,0,0.2)' }}>
          <strong className="text-[#ffaa00] uppercase tracking-wider text-[10px]">Disclaimer</strong>
          <br />
          Genesis Swarm receives only the SHA-256 commitment of your tip and stores it under EU
          jurisdiction. We do not file reports with regulators on your behalf. If you wish to
          formally report wrongdoing, contact CSSF (Luxembourg), BaFin (Germany), or ESMA directly.
          We are a cryptographic timestamping service for tips, not a regulator. Tips revealed
          publicly are your responsibility; do not include personally identifying information
          you do not wish to disclose.
        </div>

      </div>
    </div>
  )
}

function Step({ icon, num, title, desc }: { icon: React.ReactNode; num: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl p-4 relative"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,51,136,0.2)', backdropFilter: 'blur(10px)' }}>
      <div className="absolute top-3 right-4 text-[44px] font-black opacity-10" style={{ color: '#ff3388' }}>{num}</div>
      <div className="mb-2">{icon}</div>
      <div className="text-[12px] font-bold text-white mb-1.5">{title}</div>
      <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">{desc}</div>
    </div>
  )
}
