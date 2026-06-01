import Link from 'next/link'
import { ArrowLeft, Boxes, KeyRound } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import ClearingConsole from './ClearingConsole'

export const metadata = {
  title: 'Autonomous Clearing Matrix · Live Crypto · Genesis Swarm',
  description: 'Three deep-tech layers running live in your browser: programmatic escrow circuit-breaker, multi-institutional proof-of-substance ring, and real Paillier homomorphic dark-pool compute.',
}

export default function ClearingPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="void" accent="#00d8ff" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Boxes className="w-4 h-4 text-[#00d8ff]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#00d8ff]">CLEARING MATRIX</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">3 layers · real crypto in-browser</span>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-14">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(0,216,255,0.08)', border: '1px solid rgba(0,216,255,0.3)' }}>
            <KeyRound className="w-3 h-3 text-[#00d8ff]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#00d8ff]">Watch the cryptography execute — live, no backend</span>
          </div>
          <h1 className="font-black tracking-tight mb-5" style={{ fontSize: 'clamp(2.2rem, 6vw, 4.5rem)', lineHeight: 0.95 }}>
            <span className="text-white">An un-competable</span><br />
            <span style={{ background: 'linear-gradient(90deg, #00d8ff 0%, #9b6dff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 24px rgba(0,216,255,0.3))' }}>
              financial clearing matrix.
            </span>
          </h1>
          <p className="text-[rgba(255,255,255,0.65)] text-base max-w-3xl mx-auto leading-relaxed">
            Three layers above the BFT RegTech core. The escrow gate freezes non-compliant capital
            before settlement finality; the verifier ring makes spoofing local substance impossible;
            the homomorphic moat computes global risk over data it never decrypts. The Paillier panel
            below runs <strong className="text-white">real homomorphic encryption in your browser</strong> —
            encrypted numbers summed without ever being decrypted.
          </p>
        </div>

        <ClearingConsole />

        <section className="rounded-2xl p-6 mt-10"
          style={{ background: 'rgba(0,216,255,0.04)', border: '1px solid rgba(0,216,255,0.25)', backdropFilter: 'blur(10px)' }}>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#00d8ff] font-black mb-3">What you just saw</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            Layer 3 is not a mock — it is a genuine Paillier additively-homomorphic cryptosystem (key
            generation, encryption, ciphertext-space addition, decryption) implemented in native
            BigInt and executed entirely client-side. The server architecture computes cumulative
            concentration and risk velocity over a bank&apos;s private order book without the data ever
            leaving ciphertext.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            Production system of record: a Solidity escrow gateway (M-of-N BFT multi-sig), a
            three-node co-signing verifier ring, and a Paillier service with full PostgreSQL DDL —
            deployed as distributed microservices. This page is the in-browser proof so the
            cryptography is always inspectable on demand. <Link href="/lux" className="text-[#00d8ff] hover:underline">The Luxembourg RegTech engines</Link> and{' '}
            <Link href="/architecture" className="text-[#00d8ff] hover:underline">the 7-pillar kernel</Link> sit alongside it.
          </p>
        </section>
      </div>
    </div>
  )
}
