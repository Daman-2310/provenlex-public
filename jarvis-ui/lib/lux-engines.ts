// In-browser TypeScript port of the five Luxembourg RegTech engines.
//
// These mirror the production Python services (src/genesis_swarm/lux_regtech/)
// closely enough to demonstrate the real logic live on the marketing site —
// no backend round-trip, so a VC demo never depends on a cold Space waking up.
// The Python suite remains the production system of record.

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 1 — Substance Audit (CSSF 24/856): geofence + hash chain
// ─────────────────────────────────────────────────────────────────────────────

const LU_BBOX = { latMin: 49.448, latMax: 50.1827, lonMin: 5.7357, lonMax: 6.5316 }
const LU_POLYGON: Array<[number, number]> = [
  [49.4969, 5.8946], [49.6446, 5.7357], [49.8538, 6.1067], [50.1827, 6.1389],
  [50.0998, 6.4286], [49.8714, 6.5316], [49.6112, 6.4286], [49.448, 6.3658],
  [49.452, 6.1067], [49.4969, 5.8946],
]

function pointInPolygon(lat: number, lon: number, poly: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [latI, lonI] = poly[i]
    const [latJ, lonJ] = poly[j]
    const intersects = (lonI > lon) !== (lonJ > lon) &&
      lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI + 1e-12) + latI
    if (intersects) inside = !inside
  }
  return inside
}

export function verifyInLuxembourg(lat: number, lon: number): { inside: boolean; method: string } {
  if (lat < LU_BBOX.latMin || lat > LU_BBOX.latMax || lon < LU_BBOX.lonMin || lon > LU_BBOX.lonMax) {
    return { inside: false, method: 'coordinate_bbox_reject' }
  }
  return { inside: pointInPolygon(lat, lon, LU_POLYGON), method: 'coordinate_polygon' }
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const d = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export interface ChainLink { index: number; payload: Record<string, unknown>; prevHash: string; entryHash: string }

export async function appendChain(chain: ChainLink[], payload: Record<string, unknown>): Promise<ChainLink> {
  const prevHash = chain.length ? chain[chain.length - 1].entryHash : '0'.repeat(64)
  const index = chain.length
  const bound = JSON.stringify({ ...payload, _index: index }, Object.keys({ ...payload, _index: index }).sort())
  const entryHash = await sha256Hex(prevHash + bound)
  const link: ChainLink = { index, payload, prevHash, entryHash }
  chain.push(link)
  return link
}

export async function verifyChain(chain: ChainLink[]): Promise<{ intact: boolean; brokenAt: number | null }> {
  let prevHash = '0'.repeat(64)
  for (const link of chain) {
    const bound = JSON.stringify({ ...link.payload, _index: link.index }, Object.keys({ ...link.payload, _index: link.index }).sort())
    const expected = await sha256Hex(prevHash + bound)
    if (expected !== link.entryHash || link.prevHash !== prevHash) return { intact: false, brokenAt: link.index }
    prevHash = link.entryHash
  }
  return { intact: true, brokenAt: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 2 — Cross-Departmental Discrepancy Engine
// ─────────────────────────────────────────────────────────────────────────────

const NAV_LIQUIDITY_TOLERANCE = 0.005

export interface ReconInput {
  reportedNavEur: number
  assets: Array<{ id: string; valueEur: number }>
  liquidityBufferEur: number
  var95Eur: number
  redemptionObligationsEur: number
  weights: Array<{ id: string; weight: number; prospectusMax: number }>
}

export interface Discrepancy { code: string; severity: 'warning' | 'critical'; detail: string }

export function reconcile(inp: ReconInput): { clean: boolean; discrepancies: Discrepancy[]; computed: Record<string, number> } {
  const ds: Discrepancy[] = []
  const summed = inp.assets.reduce((s, a) => s + a.valueEur, 0)
  const navGap = Math.abs(summed - inp.reportedNavEur) / inp.reportedNavEur
  if (navGap > NAV_LIQUIDITY_TOLERANCE) {
    ds.push({ code: 'NAV_ASSET_SUM_MISMATCH', severity: 'critical', detail: `Asset sum €${summed.toLocaleString()} deviates ${(navGap * 100).toFixed(2)}% from reported NAV.` })
  }
  const coverage = inp.redemptionObligationsEur > 0 ? inp.liquidityBufferEur / inp.redemptionObligationsEur : Infinity
  const bufferGap = Math.abs(inp.liquidityBufferEur - inp.redemptionObligationsEur) / inp.reportedNavEur
  if (coverage < 1 && bufferGap > NAV_LIQUIDITY_TOLERANCE) {
    ds.push({ code: 'LIQUIDITY_COVERAGE_SHORTFALL', severity: 'critical', detail: `Buffer covers only ${(coverage * 100).toFixed(1)}% of redemptions; NAV-relative gap ${(bufferGap * 100).toFixed(2)}%.` })
  }
  if (inp.var95Eur > inp.liquidityBufferEur) {
    ds.push({ code: 'VAR_EXCEEDS_BUFFER', severity: 'warning', detail: `95% VaR €${inp.var95Eur.toLocaleString()} exceeds liquidity buffer €${inp.liquidityBufferEur.toLocaleString()}.` })
  }
  const totalWeight = inp.weights.reduce((s, w) => s + w.weight, 0)
  if (Math.abs(totalWeight - 1) > 0.01) {
    ds.push({ code: 'WEIGHTS_DO_NOT_SUM', severity: 'warning', detail: `Weights sum to ${totalWeight.toFixed(4)}, expected ~1.0.` })
  }
  for (const w of inp.weights) {
    if (w.weight > w.prospectusMax + 1e-6) {
      ds.push({ code: 'PROSPECTUS_WEIGHT_BREACH', severity: 'critical', detail: `${w.id} weight ${(w.weight * 100).toFixed(1)}% breaches prospectus limit ${(w.prospectusMax * 100).toFixed(1)}%.` })
    }
  }
  return {
    clean: ds.length === 0,
    discrepancies: ds,
    computed: { summedAssetsEur: summed, navGapPct: +(navGap * 100).toFixed(4), liquidityCoverage: coverage === Infinity ? -1 : +coverage.toFixed(4), totalWeight: +totalWeight.toFixed(4) },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 3 — AIFMD II limit monitor
// ─────────────────────────────────────────────────────────────────────────────

export const LEVERAGE_CAP_CLOSED = 3.0
export const LEVERAGE_CAP_OPEN = 1.75
export const MIN_LOAN_RETENTION = 0.05
export const MAX_SINGLE_FI_CONCENTRATION = 0.2

export interface TradeSimInput {
  structure: 'open_ended' | 'closed_ended'
  navEur: number
  grossExposureEur: number
  priorBorrowerExposureEur: number
  borrowerIsFI: boolean
  loanNominalEur: number
  retainedEur: number
  addedExposureEur: number
}

export interface RuleCheck { rule: string; passed: boolean; detail: string; limit: number; observed: number; headroomEur: number }

export function simulateTrade(inp: TradeSimInput): { allowed: boolean; checks: RuleCheck[]; postTrade: Record<string, number> } {
  const checks: RuleCheck[] = []
  const cap = inp.structure === 'closed_ended' ? LEVERAGE_CAP_CLOSED : LEVERAGE_CAP_OPEN
  const postGross = inp.grossExposureEur + inp.addedExposureEur
  const postLeverage = postGross / inp.navEur
  checks.push({
    rule: 'LEVERAGE_CAP', passed: postLeverage <= cap + 1e-9,
    detail: `${inp.structure} cap ${(cap * 100).toFixed(0)}%; post-trade ${(postLeverage * 100).toFixed(2)}%.`,
    limit: cap, observed: +postLeverage.toFixed(4), headroomEur: +(cap * inp.navEur - postGross).toFixed(0),
  })
  const retentionRatio = inp.retainedEur / inp.loanNominalEur
  checks.push({
    rule: 'LOAN_RETENTION_5PCT', passed: retentionRatio >= MIN_LOAN_RETENTION - 1e-9,
    detail: `Retained ${(retentionRatio * 100).toFixed(2)}% of nominal; minimum 5%.`,
    limit: MIN_LOAN_RETENTION, observed: +retentionRatio.toFixed(4), headroomEur: +(retentionRatio - MIN_LOAN_RETENTION).toFixed(4),
  })
  const postBorrower = inp.priorBorrowerExposureEur + inp.addedExposureEur
  if (inp.borrowerIsFI) {
    const concentration = postBorrower / inp.navEur
    checks.push({
      rule: 'SINGLE_FI_CONCENTRATION_20PCT', passed: concentration <= MAX_SINGLE_FI_CONCENTRATION + 1e-9,
      detail: `FI borrower post-trade ${(concentration * 100).toFixed(2)}% of NAV; cap 20%.`,
      limit: MAX_SINGLE_FI_CONCENTRATION, observed: +concentration.toFixed(4), headroomEur: +(MAX_SINGLE_FI_CONCENTRATION * inp.navEur - postBorrower).toFixed(0),
    })
  } else {
    checks.push({ rule: 'SINGLE_FI_CONCENTRATION_20PCT', passed: true, detail: 'Borrower not a financial institution; cap N/A.', limit: MAX_SINGLE_FI_CONCENTRATION, observed: 0, headroomEur: +(MAX_SINGLE_FI_CONCENTRATION * inp.navEur).toFixed(0) })
  }
  return {
    allowed: checks.every(c => c.passed),
    checks,
    postTrade: { leveragePct: +(postLeverage * 100).toFixed(2), leverageCapPct: cap * 100, borrowerExposureEur: +postBorrower.toFixed(0), retentionPct: +(retentionRatio * 100).toFixed(2) },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 4 — CSSF e-ID pre-flight validation
// ─────────────────────────────────────────────────────────────────────────────

const SHA256_RE = /^[a-fA-F0-9]{64}$/
const LEI_RE = /^[A-Z0-9]{18}[0-9]{2}$/

export interface EidInput {
  legalName: string
  managementCompany: string
  depositary: string
  documentTitle: string
  documentSha256: string
  eidasSignature: string
  lei: string
}

export interface EidFinding { field: string; ok: boolean; message: string }

export function preflightValidate(inp: EidInput): { valid: boolean; findings: EidFinding[] } {
  const f: EidFinding[] = []
  for (const [name, val] of [['legal_name', inp.legalName], ['management_company', inp.managementCompany], ['depositary', inp.depositary], ['document_title', inp.documentTitle]] as const) {
    f.push({ field: name, ok: !!val.trim(), message: val.trim() ? 'present' : 'MANDATORY field empty' })
  }
  const hashOk = SHA256_RE.test(inp.documentSha256)
  f.push({ field: 'document_sha256', ok: hashOk, message: hashOk ? 'valid 64-hex digest' : 'not a 64-char hex SHA-256' })
  const sigOk = inp.eidasSignature.length >= 64
  f.push({ field: 'eidas_signature', ok: sigOk, message: sigOk ? 'eIDAS signature present' : 'MISSING or too-short eIDAS signature' })
  if (inp.lei) {
    const leiOk = LEI_RE.test(inp.lei)
    f.push({ field: 'lei', ok: leiOk, message: leiOk ? 'valid ISO 17442 LEI' : 'malformed LEI' })
  }
  return { valid: f.every(x => x.ok), findings: f }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 5 — Delegation oversight risk scoring (CSSF 18/698)
// ─────────────────────────────────────────────────────────────────────────────

export const RISK_ESCALATION_THRESHOLD = 60
export const CRITICAL_VENDOR_FLOOR = 70

export interface DelegateInput {
  name: string
  isCritical: boolean
  slaUptimePct: number
  compliancePassRate: number
  securityIncidents90d: number
  openFindings: number
  daysSinceLastReview: number
}

export function scoreDelegate(d: DelegateInput): { score: number; healthy: boolean; floor: number; action: string; drivers: Record<string, number> } {
  const drivers: Record<string, number> = {}
  drivers.slaPenalty = d.slaUptimePct >= 99.9 ? 0 : +Math.min(30, (99.9 - d.slaUptimePct) * 6).toFixed(2)
  drivers.compliancePenalty = +(25 * (1 - d.compliancePassRate)).toFixed(2)
  drivers.securityPenalty = Math.min(24, d.securityIncidents90d * 8)
  drivers.findingsPenalty = Math.min(15, d.openFindings * 3)
  drivers.stalenessPenalty = +Math.min(15, Math.max(0, (d.daysSinceLastReview - 180) / 12)).toFixed(2)
  const score = Math.max(0, Math.min(100, 100 - Object.values(drivers).reduce((s, v) => s + v, 0)))
  const floor = d.isCritical ? CRITICAL_VENDOR_FLOOR : RISK_ESCALATION_THRESHOLD
  const healthy = score >= floor
  const action = healthy ? 'none' : score >= floor - 15 ? 'enhanced_monitoring' : 'escalate_to_board'
  return { score: +score.toFixed(2), healthy, floor, action, drivers }
}
