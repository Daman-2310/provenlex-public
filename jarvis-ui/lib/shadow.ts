// Passive Shadow Mode — divergence report (#1)
//
// The single lowest-friction way for an institution to adopt new compliance AI:
// run it *silently, in parallel* with the existing process, take no action, and
// at the end show exactly what it would have caught that the incumbent missed.
//
// We model the "legacy" / incumbent process honestly as a SELF-CONSISTENCY
// check: it validates a prospectus against the limits the document declares for
// itself, but does not independently re-derive the current AIFMD II statutory
// caps. This is the real-world gap — a pre-AIFMD II checklist (or a manual
// reviewer working from the fund's own policy) can pass a document that is
// internally consistent yet still illegal under EU law. No fabricated euro
// figures: the divergence is the concrete set of findings, with their basis.

import type { Finding, ScanResult } from '@/lib/scan-engine'

export type LegacyProfile = 'self_consistency'

export interface DivergenceReport {
  profile: LegacyProfile
  legacyVerdict: 'compliant' | 'non-compliant'
  genesisVerdict: 'compliant' | 'non-compliant'
  legacyCriticalCount: number
  genesisCriticalCount: number
  caughtByBoth: Finding[]      // internal-contradiction breaches the incumbent also sees
  missedByLegacy: Finding[]    // statutory breaches the incumbent never looks for
  delta: number                // extra criticals ProvenLex surfaces
  headline: string
}

// A self-consistency check only catches breaches of the document's OWN declared
// limits. Statutory breaches (basis === 'eu-statutory') are invisible to it.
function legacyCatches(f: Finding): boolean {
  return f.basis === 'own-prospectus'
}

export function buildDivergence(result: ScanResult, profile: LegacyProfile = 'self_consistency'): DivergenceReport {
  const criticals = result.findings.filter(f => f.severity === 'critical')
  const caughtByBoth = criticals.filter(legacyCatches)
  const missedByLegacy = criticals.filter(f => !legacyCatches(f))

  const legacyCriticalCount = caughtByBoth.length
  const genesisCriticalCount = criticals.length
  const legacyVerdict: DivergenceReport['legacyVerdict'] = legacyCriticalCount > 0 ? 'non-compliant' : 'compliant'
  const genesisVerdict: DivergenceReport['genesisVerdict'] = genesisCriticalCount > 0 ? 'non-compliant' : 'compliant'
  const delta = genesisCriticalCount - legacyCriticalCount

  let headline: string
  if (delta === 0 && genesisCriticalCount === 0) {
    headline = 'No divergence — both processes agree the document is compliant.'
  } else if (legacyVerdict === 'compliant' && genesisVerdict === 'non-compliant') {
    headline = `Your current process PASSES this document. ProvenLex flags ${genesisCriticalCount} statutory breach${genesisCriticalCount === 1 ? '' : 'es'} it never checks for.`
  } else {
    headline = `Your current process catches ${legacyCriticalCount} of ${genesisCriticalCount}. ProvenLex surfaces ${delta} more — the AIFMD II statutory overlay your checklist isn't looking for.`
  }

  return {
    profile,
    legacyVerdict,
    genesisVerdict,
    legacyCriticalCount,
    genesisCriticalCount,
    caughtByBoth,
    missedByLegacy,
    delta,
    headline,
  }
}

// A prospectus that is perfectly self-consistent (obeys every limit it sets for
// itself) yet breaches AIFMD II statute — the exact case where a self-
// consistency / pre-AIFMD II review passes and ProvenLex does not. Used as the
// default document on the Shadow Mode page so the divergence is unmistakable.
export const SHADOW_SAMPLE = `PROVENLEX LUX PRIVATE CREDIT FUND — SICAV-RAIF
Domicile: Luxembourg
Structure: open-ended loan-originating alternative investment fund

Investment policy and limits (as declared by the Fund):
- The Fund may employ leverage up to 200% of net asset value (commitment method).
- The AIFM will retain 3% of the notional value of each originated loan.
- No more than 25% of NAV may be exposed to any single issuer.

Indicative portfolio (% of NAV) — every line is within the Fund's own 25% cap:
Helios Energy SARL — 22%
Northwind Logistics SA — 20%
Aurora Real Estate — 18%
Meridian Shipping — 15%
Cash and equivalents — 20%
`
