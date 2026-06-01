// Genesis Mirror — prospectus-vs-reality drift engine.
//
// For each Book entity, derive a set of plausible AIFMD/Pillar-3-style
// claims (what the prospectus or annual report says) and then compute
// a deterministic "observed" value that drifts from the promised value
// in proportion to the entity's Pre-Crime Index.
//
// The claim templates mirror real disclosures: Tier-1 capital ratio, leverage
// ratio, liquidity coverage, concentration limits, NAV deviation caps,
// solvency ratios, etc. These are the metrics LPs actually ask about.
//
// V1: claims are template-derived with deterministic jitter (no real PDF
// ingestion). V2 will ingest live AIFMD filings from CSSF/BaFin.

import { BOOK_SNAPSHOT_ENTRIES } from '@/lib/book-snapshot'
import type { BookEntry } from '@/lib/book'

export type ClaimDirection = 'min' | 'max'

export interface ClaimTemplate {
  metric: string
  label: string
  promised: number
  unit: string
  source: string
  direction: ClaimDirection
  description: string
}

const TEMPLATES: Record<string, ClaimTemplate[]> = {
  bank: [
    { metric: 'tier1_capital_ratio_min', label: 'Tier-1 Capital Ratio',         promised: 12,  unit: '%',  direction: 'min', source: 'Pillar 3 Disclosure §4.2',         description: 'Common equity Tier-1 ratio maintained above stated minimum.' },
    { metric: 'leverage_ratio_max',      label: 'Total Leverage Ratio',         promised: 25,  unit: 'x',  direction: 'max', source: 'Annual Report §6.1 — Risk Mgmt',   description: 'Total assets divided by Tier-1 capital, capped per board policy.' },
    { metric: 'lcr_min',                 label: 'Liquidity Coverage Ratio',     promised: 110, unit: '%',  direction: 'min', source: 'Annual Report §6.3 — Liquidity',   description: 'High-quality liquid assets cover 30-day stressed outflows.' },
    { metric: 'concentration_top10_max', label: 'Top-10 Counterparty Concentration', promised: 40, unit: '%', direction: 'max', source: 'Pillar 3 Disclosure §5.4',     description: 'Exposure to top-10 counterparties as share of total credit risk.' },
    { metric: 'npl_ratio_max',           label: 'Non-Performing Loan Ratio',    promised: 3.5, unit: '%',  direction: 'max', source: 'Annual Report §5.2 — Credit Risk', description: 'Gross NPLs as share of total gross loans.' },
  ],
  asset_mgmt: [
    { metric: 'nav_deviation_max',       label: 'NAV Deviation Cap',            promised: 2.0, unit: '%',  direction: 'max', source: 'Prospectus §11.4 — Pricing',       description: 'Daily NAV deviation from theoretical benchmark.' },
    { metric: 'leverage_aifm_max',       label: 'AIFMD Gross Leverage',         promised: 200, unit: '%',  direction: 'max', source: 'AIFMD Annex IV §4',                description: 'Gross leverage per AIFMD commitment approach.' },
    { metric: 'concentration_top_max',   label: 'Single-Issuer Concentration',  promised: 10,  unit: '%',  direction: 'max', source: 'UCITS Prospectus §15.1',           description: 'Maximum single-issuer exposure within fund NAV.' },
    { metric: 'liquidity_gate_pct',      label: 'Soft Gate Trigger',            promised: 20,  unit: '%',  direction: 'max', source: 'Prospectus §17.2 — Redemptions',   description: 'Daily redemption volume threshold for activating soft gate.' },
    { metric: 'redemption_notice_days_max', label: 'Maximum Redemption Notice', promised: 30,  unit: 'd',  direction: 'max', source: 'Prospectus §17.1 — Redemptions',   description: 'Maximum business-day notice before redemption proceeds.' },
  ],
  insurance: [
    { metric: 'solvency_ratio_min',      label: 'Solvency II Ratio',            promised: 160, unit: '%',  direction: 'min', source: 'SFCR §C — Capital Mgmt',           description: 'Own funds divided by Solvency Capital Requirement.' },
    { metric: 'scr_coverage_min',        label: 'SCR Coverage',                 promised: 145, unit: '%',  direction: 'min', source: 'SFCR §E.1',                        description: 'Eligible own funds covering SCR.' },
    { metric: 'combined_ratio_max',      label: 'Combined Ratio',               promised: 96,  unit: '%',  direction: 'max', source: 'Annual Report §3.1 — P&C',         description: 'Claims + expenses as share of net earned premium.' },
    { metric: 'reserve_adequacy_min',    label: 'Reserve Adequacy',             promised: 105, unit: '%',  direction: 'min', source: 'Actuarial Opinion §4',             description: 'Posted reserves as share of best-estimate liabilities.' },
  ],
  private_equity: [
    { metric: 'leverage_max',            label: 'Fund-Level Leverage',          promised: 150, unit: '%',  direction: 'max', source: 'LPA §6.4 — Borrowing',             description: 'Subscription/NAV borrowing as share of called commitments.' },
    { metric: 'gp_commitment_min',       label: 'GP Commitment',                promised: 2.0, unit: '%',  direction: 'min', source: 'LPA §3.2 — Commitments',           description: 'General Partner commitment as share of total fund size.' },
    { metric: 'single_deal_max',         label: 'Single-Deal Concentration',    promised: 15,  unit: '%',  direction: 'max', source: 'LPA §5.1 — Investment Policy',     description: 'Single portfolio company exposure as share of fund.' },
  ],
  real_estate: [
    { metric: 'ltv_max',                 label: 'Loan-to-Value',                promised: 55,  unit: '%',  direction: 'max', source: 'Annual Report §4.2',               description: 'Portfolio-level loan-to-value.' },
    { metric: 'occupancy_min',           label: 'Occupancy Rate',               promised: 92,  unit: '%',  direction: 'min', source: 'Annual Report §3.1',               description: 'Weighted-average occupancy across portfolio.' },
    { metric: 'dscr_min',                label: 'Debt-Service Coverage',        promised: 1.6, unit: 'x',  direction: 'min', source: 'Annual Report §4.3',               description: 'Net operating income divided by debt service.' },
  ],
  wealth: [
    { metric: 'discretionary_max',       label: 'Discretionary AUM Share',      promised: 70,  unit: '%',  direction: 'max', source: 'Annual Report §2.4',               description: 'Discretionary mandates as share of total AUM.' },
    { metric: 'third_party_custody_min', label: 'Third-Party Custody',          promised: 95,  unit: '%',  direction: 'min', source: 'Annual Report §5.2',               description: 'Client assets held with unaffiliated custodians.' },
  ],
  depositary: [
    { metric: 'segregation_min',         label: 'Asset Segregation Compliance', promised: 99,  unit: '%',  direction: 'min', source: 'CSSF Reg §3.4 — Depositary',       description: 'Per-fund asset segregation as share of holdings.' },
    { metric: 'reconciliation_days_max', label: 'Reconciliation Frequency',     promised: 1,   unit: 'd',  direction: 'max', source: 'Operations Manual §7',             description: 'Maximum days between successive reconciliations.' },
  ],
}

export type Severity = 'ok' | 'watch' | 'breach'

export interface ResolvedClaim {
  metric: string
  label: string
  description: string
  source: string
  unit: string
  direction: ClaimDirection
  promised: number
  observed: number
  delta_pct: number       // signed: positive means observed is higher than promised
  in_breach: boolean      // observed violates the promised direction
  severity: Severity
}

export interface EntityMirror {
  prophecy_id: string
  entity: string
  jurisdiction: string
  category: string
  pre_crime_index: number
  claims: ResolvedClaim[]
  drift_score: number     // aggregate severity: 3 per breach, 1 per watch, 0 per ok
  breach_count: number
  watch_count: number
  ok_count: number
  filing_reference: string
  last_review: string     // ISO date — deterministic per entity
}

function hashSeed(id: string, salt: number): number {
  let h = salt
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// For a given entity, compute the observed values for each template claim.
// Drift scales with Pre-Crime Index: low-PCI entities drift 0-5%, high-PCI
// entities drift 20-60% with a high chance of breach.
function resolveClaim(template: ClaimTemplate, entity: BookEntry, claimIdx: number): ResolvedClaim {
  const r = rng(hashSeed(entity.prophecy_id + template.metric, claimIdx))
  // Promised value: small jitter (entities don't have identical promises)
  const promisedJitter = (r() - 0.5) * 0.08
  const promised = +(template.promised * (1 + promisedJitter)).toFixed(2)

  // PCI-driven drift magnitude
  const pci = entity.pre_crime_index
  const driftMagnitude = pci < 30 ? 0.05 : pci < 50 ? 0.12 : pci < 70 ? 0.25 : 0.45
  // Direction of drift: "max" claims tend to drift UP (worse); "min" claims tend to drift DOWN
  const baseSign = template.direction === 'max' ? 1 : -1
  // But not deterministic — small chance of opposite drift
  const sign = r() < 0.85 ? baseSign : -baseSign
  const drift = sign * driftMagnitude * (0.7 + r() * 0.6)  // 0.7x to 1.3x of base magnitude

  const observed = +(promised * (1 + drift)).toFixed(2)
  const delta_pct = +(((observed - promised) / promised) * 100).toFixed(1)

  // Breach: observed violates the direction
  const in_breach = template.direction === 'max' ? observed > promised : observed < promised

  let severity: Severity = 'ok'
  if (in_breach) {
    severity = Math.abs(delta_pct) >= 15 ? 'breach' : 'watch'
  } else if (Math.abs(delta_pct) >= 10) {
    severity = 'watch'  // close to the limit even if not yet breached
  }

  return {
    metric: template.metric,
    label: template.label,
    description: template.description,
    source: template.source,
    unit: template.unit,
    direction: template.direction,
    promised,
    observed,
    delta_pct,
    in_breach,
    severity,
  }
}

export function buildMirror(entity: BookEntry): EntityMirror {
  const templates = TEMPLATES[entity.candidate.category] ?? []
  const claims = templates.map((t, i) => resolveClaim(t, entity, i))
  const breach_count = claims.filter(c => c.severity === 'breach').length
  const watch_count = claims.filter(c => c.severity === 'watch').length
  const ok_count = claims.filter(c => c.severity === 'ok').length
  const drift_score = breach_count * 3 + watch_count * 1

  // Deterministic filing reference + review date
  const r = rng(hashSeed(entity.prophecy_id, 7))
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Sep', 'Oct', 'Nov']
  const m = months[Math.floor(r() * months.length)]
  const day = Math.floor(r() * 28) + 1
  const filing_reference = `Annual Report ${m} ${day}, 2025`

  // Last review: random day in past 90 days
  const lr = new Date()
  lr.setDate(lr.getDate() - Math.floor(r() * 90))
  const last_review = lr.toISOString().slice(0, 10)

  return {
    prophecy_id: entity.prophecy_id,
    entity: entity.candidate.name,
    jurisdiction: entity.candidate.jurisdiction,
    category: entity.candidate.category,
    pre_crime_index: entity.pre_crime_index,
    claims,
    drift_score,
    breach_count,
    watch_count,
    ok_count,
    filing_reference,
    last_review,
  }
}

export function getAllMirrors(): EntityMirror[] {
  return BOOK_SNAPSHOT_ENTRIES.map(buildMirror)
}

export function getMirrorById(prophecy_id: string): EntityMirror | null {
  const entity = BOOK_SNAPSHOT_ENTRIES.find(e => e.prophecy_id === prophecy_id)
  if (!entity) return null
  return buildMirror(entity)
}
