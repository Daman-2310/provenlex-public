// PROVENLEX LIVE COMPLIANCE SCAN — deterministic, client-side, no backend, no LLM.
//
// Reads a fund prospectus / fact-sheet (pasted text), extracts the limits the
// document *declares for itself* plus its actual holdings, then checks those
// against (a) the document's own stated caps and (b) the EU statutory caps.
// The standout finding: a prospectus that permits MORE than the law allows —
// the document is non-compliant against the regime it is filed under.
//
// Everything is deterministic regex + arithmetic so a compliance officer can
// trust every number; the result is sealed into a SHA-256 verdict hash so the
// analysis is tamper-evident and independently re-verifiable.

import { sha256Hex } from '@/lib/lux-engines'

// EU statutory references the scan enforces.
export const STATUTORY = {
  // AIFMD II — loan-originating AIF regime.
  LEVERAGE_CAP_OPEN_PCT: 175,
  LEVERAGE_CAP_CLOSED_PCT: 300,
  MIN_RETENTION_PCT: 5,
  SINGLE_ISSUER_CONCENTRATION_PCT: 20,
  // UCITS — quantitative diversification limits (Directive 2009/65/EC, Art. 52).
  UCITS_SINGLE_ISSUER_CAP_PCT: 10,   // the "10" in the 5/10/40 rule
  UCITS_5_10_40_THRESHOLD_PCT: 5,    // positions above this count toward the bucket
  UCITS_5_10_40_BUCKET_CAP_PCT: 40,  // aggregate of >5% positions may not exceed 40%
}

// ── Versioned ruleset ───────────────────────────────────────────────────────────
// Every verdict is stamped with the EXACT ruleset version that produced it, and
// that version is bound into the SHA-256 seal (it is a top-level field of
// ScanResult). This is the audit-grade core of the product: AIFMD II is a moving
// target — ESMA/CSSF Q&A and RTS can change an interpretation after a verdict is
// issued — so a verdict is only defensible if it says *which* dated body of rules
// decided it and can prove those rules were not altered. That single property is
// what a regulator (SupTech), an auditor, and an acquirer's diligence each ask for.
// Bump `version` (and the date) whenever STATUTORY or the rule logic changes.
export const RULESET = {
  version: '2026.1',
  effective: '2026-04-16',                       // AIFMD II application date
  framework: 'AIFMD II + UCITS (Directive 2009/65/EC)',
  statutory: STATUTORY,
  sources: [
    'Directive (EU) 2024/927 (AIFMD II)',
    'Directive 2011/61/EU (AIFMD), Art. 15 & 23',
    'Directive 2009/65/EC (UCITS), Art. 52 — 5/10/40 rule',
  ],
} as const

// Deterministic SHA-256 of the ruleset definition — lets anyone prove the body of
// rules behind a given version has not been altered. Stable across runs.
export async function rulesetHash(): Promise<string> {
  return sha256Hex(JSON.stringify(RULESET))
}

export interface Holding { name: string; weightPct: number }

export interface ExtractedDoc {
  fundName: string | null
  structure: 'open_ended' | 'closed_ended' | 'unknown'
  isUCITS?: boolean
  loanOriginating?: boolean
  declaredLeverageCapPct: number | null
  leverageBasis?: 'commitment' | 'gross' | 'unknown'
  declaredConcentrationCapPct: number | null
  declaredRetentionPct: number | null
  holdings: Holding[]
  provenance: string[]   // the exact source lines each value came from
}

export type Severity = 'critical' | 'warning' | 'ok'

export interface Finding {
  code: string
  severity: Severity
  title: string
  detail: string
  basis: 'own-prospectus' | 'eu-statutory'
  observed: number
  limit: number
}

export interface ScanResult {
  doc: ExtractedDoc
  findings: Finding[]
  compliant: boolean
  criticalCount: number
  warningCount: number
  checkedAt: string
  rulesetVersion: string    // which dated body of rules produced this verdict…
  rulesetEffective: string  // …and the date that ruleset took legal effect
}

// ── Extraction ────────────────────────────────────────────────────────────────

function firstMatch(text: string, re: RegExp, scale = 1): { value: number; line: string; lineNo: number } | null {
  const m = re.exec(text)
  if (!m) return null
  const raw = parseFloat(m[1].replace(/,/g, '')) * scale
  if (Number.isNaN(raw)) return null
  const value = Math.round(raw * 100) / 100
  // Recover the source line (text + 1-based line number) for audit-grade provenance.
  const idx = m.index
  const start = text.lastIndexOf('\n', idx) + 1
  const end = text.indexOf('\n', idx)
  const line = text.slice(start, end === -1 ? undefined : end).trim()
  const lineNo = text.slice(0, idx).split('\n').length
  return { value, line, lineNo }
}

// Bound the work the extraction regexes do — a prospectus is well under this;
// the cap stops a pathologically large paste/PDF from hanging the main thread.
const MAX_SCAN_CHARS = 500_000

export function extractDocument(raw: string): ExtractedDoc {
  const text = raw.replace(/\r/g, '').slice(0, MAX_SCAN_CHARS)
  const provenance: string[] = []

  // Fund name: first "... Fund ..." / SICAV / SICAF / RAIF line.
  const nameMatch = /^.*\b(?:Fund|SICAV|SICAF|RAIF|FCP|SIF)\b.*$/im.exec(text)
  const fundName = nameMatch ? nameMatch[0].trim().slice(0, 120) : null

  const structure: ExtractedDoc['structure'] =
    /closed[-\s]?ended/i.test(text) ? 'closed_ended'
    : /open[-\s]?ended/i.test(text) ? 'open_ended'
    : 'unknown'

  // UCITS funds are bound by the diversification limits below; auto-detect so we
  // only apply them when the regime is actually UCITS (not a loan-originating AIF).
  const isUCITS = /\bUCITS\b/i.test(text)

  // Loan-originating AIF detection. CRITICAL: AIFMD II's 175%/300% leverage cap, the
  // 5% risk-retention rule and the 20% single-borrower limit apply ONLY to
  // loan-originating AIFs. Applying them to a general AIF / PE / hedge fund is a
  // false positive — those funds legitimately run higher leverage and concentrated
  // positions. Every loan-origination check is gated on this flag.
  // Term of art is decisive; incidental strategy descriptors need 2+ hits, so one
  // "private credit" line in a multi-compartment prospectus can't misclassify it.
  const strongLoanOrig = /loan[-\s]?originat|origination\s+of\s+loans?|originat\w*\s+(?:the\s+)?loans?/i.test(text)
  const weakLoanOrigHits = (text.match(/direct\s+lending|private\s+credit|credit\s+fund|grant(?:s|ing)?\s+loans?/gi) || []).length
  const loanOriginating = strongLoanOrig || weakLoanOrigHits >= 2

  // Declared leverage cap. Real prospectuses phrase this many ways: "leverage up to
  // 200%", "maximum leverage of 175%", "leverage ... shall not exceed 300%",
  // "...calculated pursuant to the commitment method ... 200%", "175 per cent.", or a
  // multiple ("2x NAV", "1.75 times"). A loss-context guard prevents grabbing a
  // "the NAV may fall X%" risk sentence as though it were a leverage cap.
  const LOSS_CONTEXT = /\b(?:fall|falls|decline|declin|loss|lose|losing|drop|adverse|decrease|wiped|down\s+by)\b/i
  const levHit =
       firstMatch(text, /(?:maximum\s+|total\s+|gross\s+)?leverage[^.\n]{0,90}?(?:of|up\s+to|:|=|capped\s+at|shall\s+not\s+exceed|not\s+exceeding|not\s+to\s+exceed|limited\s+to)\s*(\d{2,4}(?:\.\d+)?)\s?(?:%|per\s?cent\.?|percent)/i)
    ?? firstMatch(text, /commitment\s+method[^.\n]{0,70}?(\d{2,4}(?:\.\d+)?)\s?(?:%|per\s?cent\.?|percent)/i)
    ?? firstMatch(text, /(\d{2,4}(?:\.\d+)?)\s?(?:%|per\s?cent\.?|percent)[^.\n]{0,45}?(?:leverage|commitment\s+method|gross\s+exposure)/i)
    ?? firstMatch(text, /gross\s+exposure[^.\n]{0,60}?(\d{2,4}(?:\.\d+)?)\s?(?:%|per\s?cent\.?|percent)/i)
    ?? firstMatch(text, /(?:maximum\s+)?leverage[^.\n]{0,60}?(?:of|up\s+to|:|=)?\s*(\d{1,2}(?:\.\d+)?)\s?(?:x|times)\b/i, 100)
  const lev = levHit && !LOSS_CONTEXT.test(levHit.line) ? levHit : null
  if (lev) provenance.push(`leverage cap ← line ${lev.lineNo}: "${lev.line}"`)

  // Leverage measurement BASIS. The AIFMD II 175/300% caps are written on the
  // COMMITMENT method. A gross / VaR "expected leverage" figure (often 300-650%,
  // and normal for a derivative-using fund) is a different measure and must NOT
  // be compared to those caps — doing so is the exact NOTE-03 misread. Only an
  // explicitly gross/VaR figure is treated as non-comparable; anything else
  // (commitment or unstated) compares as a cap, since that is how caps are drafted.
  let leverageBasis: 'commitment' | 'gross' | 'unknown' = 'unknown'
  if (lev) {
    if (/commitment\s+(?:method|approach)/i.test(lev.line)) leverageBasis = 'commitment'
    else if (/\bgross\b|\bVaR\b|value\s+at\s+risk|expected\s+(?:level\s+of\s+)?leverage|gross\s+exposure/i.test(lev.line)) leverageBasis = 'gross'
  }

  // Declared single-issuer / single-investment / single-borrower concentration cap.
  // Handles "no more than 20% ... single issuer", "limitation of 30% ... in any single
  // investment", "shall not invest more than 10% ... in any one company", and
  // "issuer concentration ... 20%".
  const conc = firstMatch(text, /(?:no more than|maximum|max\.?|up\s+to|limited\s+to|limitation\s+of|not\s+(?:to\s+)?exceed(?:ing)?|(?:shall\s+)?not\s+invest\s+more\s+than)\s*(\d{1,2}(?:\.\d+)?)\s?(?:%|per\s?cent\.?|percent)[^.\n]{0,55}?(?:single|any\s+one|any\s+single|per|each)\s*(?:issuer|counterparty|borrower|investment|company|entity|name)/i)
    ?? firstMatch(text, /(?:single|any\s+one|any\s+single)\s+(?:issuer|investment|borrower|counterparty|company)[^.\n]{0,55}?(\d{1,2}(?:\.\d+)?)\s?(?:%|per\s?cent\.?|percent)/i)
    ?? firstMatch(text, /(?:issuer|counterparty|borrower)\s+concentration[^.\n]{0,40}?(\d{1,2}(?:\.\d+)?)\s?(?:%|per\s?cent\.?|percent)/i)
  if (conc) provenance.push(`concentration cap ← line ${conc.lineNo}: "${conc.line}"`)

  // Declared risk-retention: "retain X% of the notional/loan", "X% retention", or
  // "(net) economic interest of X%". The retain-form requires retention context so a
  // "retain 25% of the management fee" line isn't mistaken for it.
  const ret = firstMatch(text, /retain[^.\n]{0,45}?(\d{1,2}(?:\.\d+)?)\s?(?:%|per\s?cent\.?|percent)[^.\n]{0,40}?(?:notional|economic\s+interest|originat|securitis|loans?\b)/i)
    ?? firstMatch(text, /(?:net\s+)?economic\s+interest[^.\n]{0,45}?(?:of\s+)?(?:at\s+least\s+)?(\d{1,2}(?:\.\d+)?)\s?(?:%|per\s?cent\.?|percent)/i)
    ?? firstMatch(text, /(\d{1,2}(?:\.\d+)?)\s?(?:%|per\s?cent\.?|percent)[^.\n]{0,30}?retention/i)
  if (ret) provenance.push(`retention ← line ${ret.lineNo}: "${ret.line}"`)

  // Holdings only exist in an actual portfolio/holdings listing. A PROSPECTUS
  // states LIMITS, not holdings — so gate extraction to a genuine holdings
  // section. Without this gate, once table extraction improved, every fee or
  // allocation table row became a phantom "holding" and a false breach — the
  // NOTE-02 over-flagging failure mode at scale (a compliant fund's prospectus
  // reporting hundreds of "single-issuer breaches"). A prospectus has no such
  // section, so it now correctly yields no holdings and no phantom breaches;
  // fact sheets / annual reports (which do list holdings) still work.
  const HOLDINGS_SECTION =
    /\b(?:indicative\s+portfolio|portfolio\s+of\s+investments|portfolio\s+holdings|schedule\s+of\s+investments|statement\s+of\s+investments|top\s+\d{1,3}\s+holdings|largest\s+holdings)\b|portfolio\s*\(\s*%/i
  const holdings: Holding[] = []
  let inHoldings = false
  let sinceMarker = 0
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    const isHeader =
      HOLDINGS_SECTION.test(line) ||
      // a short standalone "Holdings" / "Holdings:" / "Holdings (% of NAV)" header
      // (length-bounded so prose containing the word "holdings" never triggers it)
      (line.length <= 40 && /^holdings\b\s*[:.]?\s*(?:\([^)]*\))?\s*$/i.test(line))
    if (isHeader) { inHoldings = true; sinceMarker = 0; continue }
    if (!inHoldings) continue
    if (++sinceMarker > 200) { inHoldings = false; continue } // bound the block
    const hm = /^[\s•\-*]*([A-Za-z][A-Za-z0-9 .,&'/()-]{2,60}?)\s*[—:\-–]?\s*(\d{1,2}(?:\.\d+)?)\s?%/.exec(line)
    if (!hm) continue
    const name = hm[1].replace(/[—:\-–]+$/, '').trim()
    const weightPct = parseFloat(hm[2])
    // Skip lines that are clearly the limit declarations we already parsed.
    if (/leverage|retention|concentration|maximum|no more than|cap/i.test(name)) continue
    if (weightPct > 0 && weightPct <= 100 && name.length >= 3) holdings.push({ name, weightPct })
  }

  return {
    fundName,
    structure,
    isUCITS,
    loanOriginating,
    declaredLeverageCapPct: lev?.value ?? null,
    leverageBasis,
    declaredConcentrationCapPct: conc?.value ?? null,
    declaredRetentionPct: ret?.value ?? null,
    holdings,
    provenance,
  }
}

// ── Compliance scan ─────────────────────────────────────────────────────────────

// ── Manual entry ────────────────────────────────────────────────────────────────
// When a real prospectus PDF flattens its tables and the parser can't extract enough
// (the honesty gate flags INSUFFICIENT_DATA), the user keys the few figures the engine
// needs into a small form. This builds the SAME ExtractedDoc the parser would, so it
// flows through the identical scanCompliance + seal. Provenance is tagged "entered by
// user" so the audit trail never pretends a value was parsed from the document.
export interface ManualEntry {
  fundName?: string
  structure: ExtractedDoc['structure']
  isUCITS: boolean
  loanOriginating: boolean
  declaredLeverageCapPct?: number | null
  declaredConcentrationCapPct?: number | null
  declaredRetentionPct?: number | null
  holdings: Holding[]
}

export function fromManualEntry(m: ManualEntry): ExtractedDoc {
  const num = (x?: number | null) => (x == null || Number.isNaN(x) ? null : x)
  const lev = num(m.declaredLeverageCapPct)
  const conc = num(m.declaredConcentrationCapPct)
  const ret = num(m.declaredRetentionPct)
  const holdings = m.holdings.filter(h => h.name.trim() && Number.isFinite(h.weightPct) && h.weightPct > 0)
  const provenance: string[] = []
  if (lev != null) provenance.push(`leverage cap ← entered by user: ${lev}%`)
  if (conc != null) provenance.push(`concentration cap ← entered by user: ${conc}%`)
  if (ret != null) provenance.push(`retention ← entered by user: ${ret}%`)
  if (holdings.length) provenance.push(`${holdings.length} holding(s) ← entered by user`)
  return {
    fundName: m.fundName?.trim() || null,
    structure: m.structure,
    isUCITS: m.isUCITS,
    loanOriginating: m.loanOriginating,
    declaredLeverageCapPct: lev,
    declaredConcentrationCapPct: conc,
    declaredRetentionPct: ret,
    holdings,
    provenance,
  }
}

export function scanCompliance(doc: ExtractedDoc): Omit<ScanResult, 'doc'> {
  const findings: Finding[] = []
  const loanOriginating = doc.loanOriginating === true
  const statutoryLeverage = doc.structure === 'closed_ended'
    ? STATUTORY.LEVERAGE_CAP_CLOSED_PCT : STATUTORY.LEVERAGE_CAP_OPEN_PCT

  // 1. Leverage. The AIFMD II 175%/300% cap binds ONLY loan-originating AIFs — a
  //    general AIF / PE / hedge fund can legitimately run far higher leverage, so we
  //    must NOT assert a breach against it (that would be a false positive).
  if (doc.declaredLeverageCapPct != null) {
    if (loanOriginating && doc.leverageBasis === 'gross') {
      findings.push({
        code: 'LEVERAGE_BASIS_NOT_COMPARABLE',
        severity: 'warning',
        basis: 'eu-statutory',
        title: 'Leverage disclosed on a gross / VaR basis',
        detail: `Declared leverage ${doc.declaredLeverageCapPct}% is stated on a gross / value-at-risk basis. AIFMD II's ${statutoryLeverage}% cap is written on the commitment method, so this figure is not directly comparable — confirm the commitment-method leverage before concluding. Gross / VaR figures of several hundred percent are normal and not, by themselves, a breach.`,
        observed: doc.declaredLeverageCapPct,
        limit: statutoryLeverage,
      })
    } else if (loanOriginating) {
      const over = doc.declaredLeverageCapPct > statutoryLeverage + 1e-9
      findings.push({
        code: 'PROSPECTUS_LEVERAGE_EXCEEDS_STATUTE',
        severity: over ? 'critical' : 'ok',
        basis: 'eu-statutory',
        title: 'Declared leverage cap vs AIFMD II statutory cap',
        detail: over
          ? `Prospectus permits ${doc.declaredLeverageCapPct}% leverage, but AIFMD II caps a ${doc.structure.replace('_', '-')} loan-originating AIF at ${statutoryLeverage}%. The document is non-compliant against the regime it is filed under.`
          : `Declared leverage cap ${doc.declaredLeverageCapPct}% is within the AIFMD II ${statutoryLeverage}% statutory limit for a loan-originating AIF.`,
        observed: doc.declaredLeverageCapPct,
        limit: statutoryLeverage,
      })
    } else {
      findings.push({
        code: 'LEVERAGE_DISCLOSED_NO_STATUTORY_CAP',
        severity: 'ok',
        basis: 'eu-statutory',
        title: 'Declared leverage — disclosure item, no hard cap',
        detail: `Declared leverage ${doc.declaredLeverageCapPct}%. AIFMD II's 175%/300% cap applies only to loan-originating AIFs; for a general AIF this is an Art. 23 disclosure item, not a statutory cap, so no breach is asserted. (If this IS a loan-originating AIF, make sure the document states so.)`,
        observed: doc.declaredLeverageCapPct,
        limit: 0,
      })
    }
  }

  // 2. Risk retention vs the 5% statutory minimum — loan-originating AIFs only.
  if (doc.declaredRetentionPct != null && loanOriginating) {
    const below = doc.declaredRetentionPct < STATUTORY.MIN_RETENTION_PCT - 1e-9
    findings.push({
      code: 'RETENTION_BELOW_STATUTORY_MINIMUM',
      severity: below ? 'critical' : 'ok',
      basis: 'eu-statutory',
      title: 'Risk retention vs AIFMD II minimum',
      detail: below
        ? `Declared retention ${doc.declaredRetentionPct}% is below the AIFMD II minimum of ${STATUTORY.MIN_RETENTION_PCT}% of originated-loan notional.`
        : `Declared retention ${doc.declaredRetentionPct}% meets the ${STATUTORY.MIN_RETENTION_PCT}% minimum.`,
      observed: doc.declaredRetentionPct,
      limit: STATUTORY.MIN_RETENTION_PCT,
    })
  }

  // 3. Each holding vs the prospectus's own concentration cap AND the statutory cap.
  for (const h of doc.holdings) {
    if (doc.declaredConcentrationCapPct != null && h.weightPct > doc.declaredConcentrationCapPct + 1e-9) {
      findings.push({
        code: 'OWN_CONCENTRATION_BREACH',
        severity: 'critical',
        basis: 'own-prospectus',
        title: `${h.name} breaches the fund's own concentration limit`,
        detail: `${h.name} is ${h.weightPct}% of NAV; the prospectus caps single-issuer exposure at ${doc.declaredConcentrationCapPct}%.`,
        observed: h.weightPct,
        limit: doc.declaredConcentrationCapPct,
      })
    }
    if (loanOriginating && h.weightPct > STATUTORY.SINGLE_ISSUER_CONCENTRATION_PCT + 1e-9) {
      findings.push({
        code: 'STATUTORY_CONCENTRATION_BREACH',
        severity: 'critical',
        basis: 'eu-statutory',
        title: `${h.name} exceeds the AIFMD II single-borrower limit`,
        detail: `${h.name} is ${h.weightPct}% of NAV, above the ${STATUTORY.SINGLE_ISSUER_CONCENTRATION_PCT}% single-borrower limit AIFMD II sets for a loan-originating AIF. (No such statutory cap applies to a general AIF — this check runs only because the document identifies as loan-originating.)`,
        observed: h.weightPct,
        limit: STATUTORY.SINGLE_ISSUER_CONCENTRATION_PCT,
      })
    }
  }

  // 4. Do the holding weights sum sensibly?
  if (doc.holdings.length >= 2) {
    const sum = doc.holdings.reduce((s, h) => s + h.weightPct, 0)
    if (sum > 100 + 1e-9) {
      findings.push({
        code: 'WEIGHTS_OVER_100',
        severity: 'warning',
        basis: 'own-prospectus',
        title: 'Disclosed holding weights exceed 100%',
        detail: `Extracted holdings sum to ${sum.toFixed(1)}% of NAV — a disclosure or valuation inconsistency.`,
        observed: +sum.toFixed(1),
        limit: 100,
      })
    }
  }

  // 5. UCITS diversification — only when the document is a UCITS fund. Both the
  //    10% single-issuer cap and the 5/10/40 forty-percent bucket are exact,
  //    deterministic numeric limits.
  if (doc.isUCITS && doc.holdings.length > 0) {
    for (const h of doc.holdings) {
      if (h.weightPct > STATUTORY.UCITS_SINGLE_ISSUER_CAP_PCT + 1e-9) {
        findings.push({
          code: 'UCITS_SINGLE_ISSUER_BREACH',
          severity: 'critical',
          basis: 'eu-statutory',
          title: `${h.name} breaches the UCITS 10% single-issuer cap`,
          detail: `${h.name} is ${h.weightPct}% of NAV; UCITS caps any single issuer at ${STATUTORY.UCITS_SINGLE_ISSUER_CAP_PCT}% (the "10" in the 5/10/40 rule — government / public-body issuers may qualify for the 35% exception, which this check does not auto-detect).`,
          observed: h.weightPct,
          limit: STATUTORY.UCITS_SINGLE_ISSUER_CAP_PCT,
        })
      }
    }
    const bucket = doc.holdings
      .filter(h => h.weightPct > STATUTORY.UCITS_5_10_40_THRESHOLD_PCT + 1e-9)
      .reduce((s, h) => s + h.weightPct, 0)
    if (bucket > STATUTORY.UCITS_5_10_40_BUCKET_CAP_PCT + 1e-9) {
      findings.push({
        code: 'UCITS_5_10_40_BUCKET_BREACH',
        severity: 'critical',
        basis: 'eu-statutory',
        title: 'UCITS 5/10/40 forty-percent bucket breached',
        detail: `Holdings above 5% of NAV sum to ${bucket.toFixed(1)}%; under the UCITS 5/10/40 rule the aggregate of all positions exceeding 5% may not exceed ${STATUTORY.UCITS_5_10_40_BUCKET_CAP_PCT}% of NAV.`,
        observed: +bucket.toFixed(1),
        limit: STATUTORY.UCITS_5_10_40_BUCKET_CAP_PCT,
      })
    }
  }

  // 6. Honesty guard. A "compliant" verdict must rest on a real basis. Count what was
  //    actually extracted; if it's too thin to judge — the common case for a real,
  //    table-heavy or reflowed prospectus PDF, where the figures live in tables that
  //    text extraction flattens or drops — we must NOT return a clean bill of health.
  //    A false CLEAN is the worst failure a compliance tool can have. (Confirmed on
  //    real Luxembourg SICAV prospectuses: extraction yielded one stray value and the
  //    old guard let the verdict read "compliant" — this gate closes that.)
  const limitsFound =
    (doc.declaredLeverageCapPct != null ? 1 : 0) +
    (doc.declaredRetentionPct != null ? 1 : 0) +
    (doc.declaredConcentrationCapPct != null ? 1 : 0)
  const tooThinToJudge = doc.holdings.length === 0 && limitsFound < 2
  if (tooThinToJudge) {
    findings.push({
      code: 'INSUFFICIENT_DATA',
      severity: 'warning',
      basis: 'own-prospectus',
      title: 'Too little extracted to confirm compliance',
      detail: 'The scanner located no holding weights and fewer than two declared limits — not enough to assert compliance. Real prospectuses keep these figures in tables and sub-fund supplements that text extraction often flattens or drops, so this is NOT a clean bill of health. Paste the relevant section (investment limits / holdings), or treat the document as requiring manual review.',
      observed: limitsFound,
      limit: 2,
    })
  }

  const criticalCount = findings.filter(f => f.severity === 'critical').length
  const warningCount = findings.filter(f => f.severity === 'warning').length
  return {
    findings,
    compliant: criticalCount === 0 && !tooThinToJudge,
    criticalCount,
    warningCount,
    checkedAt: new Date().toISOString(),
    rulesetVersion: RULESET.version,
    rulesetEffective: RULESET.effective,
  }
}

// Seal the full scan into a tamper-evident SHA-256 verdict hash.
export async function sealVerdict(result: ScanResult): Promise<string> {
  const canonical = JSON.stringify(result, Object.keys(result).sort())
  return sha256Hex(canonical)
}

// A clean, deliberately non-compliant sample so the demo always lands.
export const SAMPLE_PROSPECTUS = `PROVENLEX LUX CREDIT OPPORTUNITIES FUND — SICAV-RAIF
Domicile: Luxembourg
Structure: open-ended loan-originating alternative investment fund

Investment policy and limits:
- The Fund may employ leverage up to 200% of net asset value (commitment method).
- The AIFM will retain 3% of the notional value of each originated loan.
- No more than 15% of NAV may be exposed to any single issuer.

Indicative portfolio (% of NAV):
Helios Energy SARL — 24%
Northwind Logistics SA — 18%
Banque Continentale (FI) — 22%
Aurora Real Estate — 12%
Meridian Shipping — 9%
Cash and equivalents — 15%
`
