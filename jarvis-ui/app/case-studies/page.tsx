import { redirect } from 'next/navigation'

// RETIRED 2026-06-20 — claimed ProvenLex would have "caught" Wirecard, Madoff,
// Greensill and Archegos using fictional detection components (NAV_DETECTOR,
// ORBITAL_BOT, SHADOW_BOT) and invented day-counts. Pure fabrication: the product is
// a deterministic prospectus checker, not a fraud/NAV/trade monitor. Do not rebuild
// without honest, capability-true content.
export default function CaseStudiesRetired() {
  redirect('/scan')
}
