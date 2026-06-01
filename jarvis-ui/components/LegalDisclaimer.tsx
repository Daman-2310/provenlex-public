import Link from 'next/link'
import { Info } from 'lucide-react'

interface Props {
  variant?: 'compact' | 'full'
}

/**
 * Legal safe-harbor disclaimer used on /book, /prophecy, /court, /eye and
 * any other page that publishes AI-generated risk assessments on named entities.
 *
 * Intent (with future legal review):
 *  - Frame outputs as analytical/educational, not investment advice
 *  - Explicit no-warranty stance
 *  - Editorial fair-comment positioning under EU jurisprudence
 *  - Clear opt-out (right to erasure) pointer
 */
export default function LegalDisclaimer({ variant = 'compact' }: Props) {
  if (variant === 'full') {
    return (
      <div className="rounded-xl p-5 text-[11px] leading-relaxed text-[rgba(255,255,255,0.6)]"
        style={{ background: 'rgba(255,170,0,0.03)', border: '1px solid rgba(255,170,0,0.18)' }}>
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[#ffaa00] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-2">
            <p>
              <strong className="text-[#ffaa00] uppercase tracking-wider text-[9px]">Analytical output · not advice</strong>{' '}
              The content on this page is AI-generated operational-risk analysis intended for educational and research purposes only.
              It is <strong className="text-white">not investment advice</strong>, not a credit rating, and not a legal verdict.
              No warranty of accuracy, completeness, or fitness for any purpose is given or implied.
            </p>
            <p>
              Historical archetypes (Wirecard, Archegos, FTX, Greensill, Madoff) are referenced as <strong className="text-white">analytical patterns</strong>{' '}
              only — never as factual accusations against any named subject. Named entities are referenced under editorial fair-comment
              for the purpose of public-interest financial-risk modeling.
            </p>
            <p>
              Subjects of analysis may request correction or removal of their public Genesis dossier by emailing{' '}
              <a href="mailto:daman.sharma.2310@gmail.com?subject=Genesis%20Swarm%20%E2%80%94%20Erasure%2FCorrection%20request"
                className="text-[#4a9eff] hover:underline">daman.sharma.2310@gmail.com</a>{' '}
              with the subject "Erasure/Correction request". Requests are honored within 30 days.{' '}
              <Link href="/legal" className="text-[#4a9eff] hover:underline">Full terms →</Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="text-[10px] leading-relaxed text-center text-[rgba(255,255,255,0.4)] px-4 py-3 mt-8 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <Info className="w-3 h-3 inline-block mr-1.5 mb-0.5 text-[rgba(255,170,0,0.6)]" />
      AI-generated operational-risk analysis · for educational and research purposes only · not investment advice ·
      no warranty of accuracy · references to historical archetypes are analytical patterns, not accusations ·{' '}
      <Link href="/legal" className="text-[#4a9eff] hover:underline">terms &amp; right-to-erasure →</Link>
    </div>
  )
}
