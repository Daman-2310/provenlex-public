import Link from 'next/link'
import { ArrowLeft, Gavel, Stamp, FileText } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import WitnessInterface from './WitnessInterface'
import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'

export const metadata = {
  title: 'Genesis Witness · Board Liability Attestations · Genesis Swarm',
  description: 'Board members publicly attest to having reviewed Genesis prophecies. Creates a timestamped paper trail of due diligence — protective for those who sign, exposing for those who don\'t.',
}

export default function WitnessPage() {
  const slim = BOOK_SNAPSHOT_ENTRIES.map(e => ({
    prophecy_id: e.prophecy_id,
    entity: e.candidate.name,
    jurisdiction: e.candidate.jurisdiction,
    category: e.candidate.category,
    pre_crime_index: e.pre_crime_index,
    trajectory: e.trajectory,
    pattern_match: e.pattern_match ?? null,
  }))

  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#ffd86b" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <Gavel className="w-4 h-4 text-[#ffd86b]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#ffd86b]">WITNESS</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
            Public attestation · timestamped · D&O protective
          </span>
        </div>
      </header>

      <div className="relative max-w-5xl mx-auto px-6 py-14">

        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
            style={{ background: 'rgba(255,216,107,0.08)', border: '1px solid rgba(255,216,107,0.3)' }}>
            <Stamp className="w-3 h-3 text-[#ffd86b]" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#ffd86b]">
              D&O insurance protocol every board must subscribe to
            </span>
          </div>
          <h1 className="font-black tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', lineHeight: 0.95 }}>
            <span className="text-white">Sign now,</span>{' '}
            <span style={{
              background: 'linear-gradient(90deg, #ffd86b 0%, #ff7a00 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(255,216,107,0.3))',
            }}>protect yourself later.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base max-w-2xl mx-auto leading-relaxed">
            Board members publicly attest to having reviewed a Genesis prophecy on their
            counterparty. Each signature is timestamped on the public ledger.
            If the entity later collapses, signers have a verified paper trail of due diligence.
            Non-signers face the inverse.
          </p>
        </div>

        {/* HOW IT WORKS */}
        <section className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Step num="1" title="Pick a prophecy"
                desc="Choose any of the 100 sealed Book entries. Most useful for entities your fund has direct exposure to." />
          <Step num="2" title="Sign with your name + role"
                desc="Public record. Your name, fund, role, and explicit acknowledgement of having reviewed the risk indicators." />
          <Step num="3" title="Timestamped on public ledger"
                desc="Anyone — including future regulators, plaintiff lawyers, and your D&O carrier — can verify the date you signed." />
        </section>

        <WitnessInterface prophecies={slim} />

        {/* WHY MATTERS */}
        <section className="rounded-2xl p-6 mt-10"
          style={{ background: 'rgba(255,216,107,0.04)', border: '1px solid rgba(255,216,107,0.25)', backdropFilter: 'blur(10px)' }}>
          <FileText className="w-5 h-5 text-[#ffd86b] mb-3" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#ffd86b] font-black mb-2">Why board members will demand their fund adopt Genesis</div>
          <p className="text-[13px] text-[rgba(255,255,255,0.75)] leading-relaxed mb-3">
            Personal liability under AIFMD II, the Luxembourg Law of 2010, and EU corporate-governance
            rules has expanded year over year. Directors of failed funds face personal claims and
            disqualification.
            <strong className="text-white"> Documented due-diligence is the single strongest defence.</strong>
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.6)] leading-relaxed mb-3">
            Genesis Witness is a free, public, time-stamped record that you reviewed a specific
            third-party risk assessment before the event. That record either protects you or
            its absence accuses you. Either way, every board member at every regulated EU fund
            has a personal incentive to engage with it.
          </p>
          <p className="text-[12px] text-[rgba(255,255,255,0.55)] leading-relaxed">
            Strategically: this creates <strong className="text-white">demand-pull from inside the customer.</strong>
            Funds don&apos;t adopt Genesis because the compliance officer asked. They adopt because
            their board members started signing personally and the fund had to follow.
          </p>
        </section>

        {/* LEGAL */}
        <div className="mt-8 rounded p-4 text-[11px] text-[rgba(255,255,255,0.55)] leading-relaxed"
          style={{ background: 'rgba(255,170,0,0.04)', border: '1px solid rgba(255,170,0,0.2)' }}>
          <strong className="text-[#ffaa00] uppercase tracking-wider text-[10px]">Disclaimer</strong>
          <br />
          Genesis Witness is an unofficial public attestation service. Signatures are time-stamped
          records of your acknowledgement; they are not regulatory filings and do not by themselves
          constitute compliance with AIFMD, CSSF, BaFin, or any other supervisory requirement.
          Consult your D&O insurance carrier and legal counsel before relying on Witness records
          in any formal proceeding. We do not verify signer identity; impersonation is fraud and
          may carry separate civil and criminal consequences.
        </div>

      </div>
    </div>
  )
}

function Step({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl p-4 relative"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,216,107,0.2)', backdropFilter: 'blur(10px)' }}>
      <div className="absolute top-3 right-4 text-[44px] font-black opacity-10" style={{ color: '#ffd86b' }}>{num}</div>
      <div className="text-[12px] font-bold text-white mb-1.5">{title}</div>
      <div className="text-[11px] text-[rgba(255,255,255,0.65)] leading-relaxed">{desc}</div>
    </div>
  )
}
