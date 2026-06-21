import Link from 'next/link'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import CosmicBackground from '@/components/CosmicBackground'
import RulePlayground from '@/components/RulePlayground'

export const metadata = {
  title: 'AIFMD II Rule Playground — watch the limits bite, live',
  description:
    'Drag the AIFMD II quantitative variables — leverage (175/300%), risk retention (5%), single-borrower concentration (20%) — and watch the real deterministic engine flag breaches in real time. Free, no signup, runs entirely in your browser. The loan-origination toggle shows why those caps bind only loan-originating AIFs (and why flagging a general AIF is a false positive).',
}

export default function PlaygroundPage() {
  return (
    <div className="min-h-screen text-white relative">
      <CosmicBackground variant="calm" accent="#10D982" />

      <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.06)] px-6 py-3 print:hidden"
        style={{ background: 'rgba(5,5,12,0.78)', backdropFilter: 'blur(20px) saturate(140%)' }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)] hover:text-white">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)]" />
          <SlidersHorizontal className="w-4 h-4 text-[#10D982]" />
          <span className="text-sm font-bold tracking-[0.18em] text-[#10D982]">RULE PLAYGROUND</span>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-sans normal-case text-3xl sm:text-4xl font-black tracking-tight leading-tight mb-4 text-white">
          See AIFMD II actually bite.
        </h1>
        <p className="font-sans normal-case text-[15px] text-[rgba(255,255,255,0.65)] leading-relaxed mb-8 max-w-2xl">
          Drag the dials and watch the <strong className="text-white">real deterministic engine</strong> rule in
          real time — the same one behind the scanner. The key lesson is the
          <strong className="text-white"> loan-originating</strong> toggle: AIFMD II&apos;s 175/300% leverage,
          5% retention and 20% single-borrower caps bind <em>only</em> loan-originating AIFs. Turn it off and
          a fund at 400% leverage is perfectly compliant — flagging it would be a false positive.
        </p>

        <RulePlayground />

        <p className="font-sans normal-case mt-8 text-[12px] text-[rgba(255,255,255,0.4)] leading-relaxed">
          This is an aid to understanding, not legal advice; several AIFMD II details remain subject to ESMA&apos;s
          final RTS/ITS. To check a real document, paste or upload it on the{' '}
          <Link href="/scan" className="text-[#10D982] hover:underline">scanner</Link>, or read the{' '}
          <Link href="/research/report-01-aifmd2-readiness" className="text-[#10D982] hover:underline">2027 AIFMD II Readiness Report</Link>.
        </p>
      </main>
    </div>
  )
}
