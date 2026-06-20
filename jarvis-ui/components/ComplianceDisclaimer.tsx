import { Scale } from 'lucide-react'

/**
 * Decision-support disclaimer. Shown wherever the product emits a compliance
 * "verdict" so reliance is properly framed: ProvenLex is an analytical tool, the
 * regulated entity retains responsibility. This is liability hygiene — a tool
 * that hands out verdicts without it invites exactly the wrong kind of attention.
 */
export default function ComplianceDisclaimer({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl p-3 flex items-start gap-2.5 ${className}`}
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <Scale className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[rgba(255,255,255,0.4)]" />
      <p className="text-[9px] leading-relaxed text-[rgba(255,255,255,0.45)]">
        <span className="font-bold text-[rgba(255,255,255,0.6)] uppercase tracking-wider">Decision-support, not advice.</span>{' '}
        ProvenLex is an analytical tool. Its outputs are informational and do not constitute legal,
        regulatory, investment, or compliance advice, and are not a substitute for the judgement of a
        qualified professional. The AIFM / management company retains sole responsibility for its regulatory
        obligations. Verify all findings against the primary regulatory sources before acting.
      </p>
    </div>
  )
}
