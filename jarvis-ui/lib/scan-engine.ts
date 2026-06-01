// GENESIS LIVE COMPLIANCE SCAN — deterministic, client-side, no backend, no LLM.
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

// EU statutory references the scan enforces (loan-originating AIF regime).
export const STATUTORY = {
  LEVERAGE_CAP_OPEN_PCT: 175,
  LEVERAGE_CAP_CLOSED_PCT: 300,
  MIN_RETENTION_PCT: 5,
  SINGLE_ISSUER_CONCENTRATION_PCT: 20,
}

export interface Holding { name: string; weightPct: number }

export interface ExtractedDoc {
  fundName: string | null
  structure: 'open_ended' | 'closed_ended' | 'unknown'
  declaredLeverageCapPct: number | null
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
}

// ── Extraction ────────────────────────────────────────────────────────────────

function firstMatch(text: string, re: RegExp): { value: number; line: string } | null {
  const m = re.exec(text)
  if (!m) return null
  const value = parseFloat(m[1].replace(/,/g, ''))
  if (Number.isNaN(value)) return null
  // Recover the source line for provenance.
  const idx = m.index
  const start = text.lastIndexOf('\n', idx) + 1
  const end = text.indexOf('\n', idx)
  const line = text.slice(start, end === -1 ? undefined : end).trim()
  return { value, line }
}

export function extractDocument(raw: string): ExtractedDoc {
  const text = raw.replace(/\r/g, '')
  const provenance: string[] = []

  // Fund name: first "... Fund ..." / SICAV / SICAF / RAIF line.
  const nameMatch = /^.*\b(?:Fund|SICAV|SICAF|RAIF|FCP|SIF)\b.*$/im.exec(text)
  const fundName = nameMatch ? nameMatch[0].trim().slice(0, 120) : null

  const structure: ExtractedDoc['structure'] =
    /closed[-\s]?ended/i.test(text) ? 'closed_ended'
    : /open[-\s]?ended/i.test(text) ? 'open_ended'
    : 'unknown'

  // Declared leverage cap: "leverage ... up to 200%", "maximum leverage of 175%".
  const lev = firstMatch(text, /(?:maximum\s+)?leverage[^.\n]*?(?:of|up to|:|=|capped at)?\s*(\d{2,4}(?:\.\d+)?)\s?%/i)
    ?? firstMatch(text, /gross\s+exposure[^.\n]*?(\d{2,4}(?:\.\d+)?)\s?%/i)
  if (lev) provenance.push(`leverage cap ← "${lev.line}"`)

  // Declared single-issuer concentration cap.
  const conc = firstMatch(text, /(?:no more than|maximum|max\.?|up to)\s*(\d{1,2}(?:\.\d+)?)\s?%[^.\n]*(?:single|any one|per|each)?\s*(?:issuer|counterparty|borrower|name)/i)
    ?? firstMatch(text, /(?:issuer|counterparty|borrower)\s+concentration[^.\n]*?(\d{1,2}(?:\.\d+)?)\s?%/i)
  if (conc) provenance.push(`concentration cap ← "${conc.line}"`)

  // Declared risk-retention.
  const ret = firstMatch(text, /retain[^.\n]*?(\d{1,2}(?:\.\d+)?)\s?%/i)
    ?? firstMatch(text, /(\d{1,2}(?:\.\d+)?)\s?%[^.\n]*retention/i)
  if (ret) provenance.push(`retention ← "${ret.line}"`)

  // Holdings: lines like "Acme Corp — 22%", "Position: Beta SA  30% of NAV".
  const holdings: Holding[] = []
  for (const line of text.split('\n')) {
    const hm = /^[\s•\-*]*([A-Za-z][A-Za-z0-9 .,&'/()-]{2,60}?)\s*[—:\-–]?\s*(\d{1,2}(?:\.\d+)?)\s?%/.exec(line.trim())
    if (hm) {
      const name = hm[1].replace(/[—:\-–]+$/, '').trim()
      const weightPct = parseFloat(hm[2])
      // Skip lines that are clearly the limit declarations we already parsed.
      if (/leverage|retention|concentration|maximum|no more than|cap/i.test(name)) continue
      if (weightPct > 0 && weightPct <= 100 && name.length >= 3) holdings.push({ name, weightPct })
    }
  }

  return {
    fundName,
    structure,
    declaredLeverageCapPct: lev?.value ?? null,
    declaredConcentrationCapPct: conc?.value ?? null,
    declaredRetentionPct: ret?.value ?? null,
    holdings,
    provenance,
  }
}

// ── Compliance scan ─────────────────────────────────────────────────────────────

export function scanCompliance(doc: ExtractedDoc): Omit<ScanResult, 'doc'> {
  const findings: Finding[] = []
  const statutoryLeverage = doc.structure === 'closed_ended'
    ? STATUTORY.LEVERAGE_CAP_CLOSED_PCT : STATUTORY.LEVERAGE_CAP_OPEN_PCT

  // 1. The standout: does the prospectus permit MORE leverage than the law?
  if (doc.declaredLeverageCapPct != null) {
    const over = doc.declaredLeverageCapPct > statutoryLeverage + 1e-9
    findings.push({
      code: 'PROSPECTUS_LEVERAGE_EXCEEDS_STATUTE',
      severity: over ? 'critical' : 'ok',
      basis: 'eu-statutory',
      title: 'Declared leverage cap vs AIFMD II statutory cap',
      detail: over
        ? `Prospectus permits ${doc.declaredLeverageCapPct}% leverage, but AIFMD II caps a ${doc.structure.replace('_', '-')} loan-originating AIF at ${statutoryLeverage}%. The document is non-compliant against the regime it is filed under.`
        : `Declared leverage cap ${doc.declaredLeverageCapPct}% is within the AIFMD II ${statutoryLeverage}% statutory limit.`,
      observed: doc.declaredLeverageCapPct,
      limit: statutoryLeverage,
    })
  }

  // 2. Risk retention vs 5% statutory minimum.
  if (doc.declaredRetentionPct != null) {
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
    if (h.weightPct > STATUTORY.SINGLE_ISSUER_CONCENTRATION_PCT + 1e-9) {
      findings.push({
        code: 'STATUTORY_CONCENTRATION_BREACH',
        severity: 'critical',
        basis: 'eu-statutory',
        title: `${h.name} breaches the single-issuer concentration guideline`,
        detail: `${h.name} is ${h.weightPct}% of NAV, above the ${STATUTORY.SINGLE_ISSUER_CONCENTRATION_PCT}% single-issuer concentration guideline for diversified funds.`,
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

  const criticalCount = findings.filter(f => f.severity === 'critical').length
  const warningCount = findings.filter(f => f.severity === 'warning').length
  return {
    findings,
    compliant: criticalCount === 0,
    criticalCount,
    warningCount,
    checkedAt: new Date().toISOString(),
  }
}

// Seal the full scan into a tamper-evident SHA-256 verdict hash.
export async function sealVerdict(result: ScanResult): Promise<string> {
  const canonical = JSON.stringify(result, Object.keys(result).sort())
  return sha256Hex(canonical)
}

// A clean, deliberately non-compliant sample so the demo always lands.
export const SAMPLE_PROSPECTUS = `GENESIS LUX CREDIT OPPORTUNITIES FUND — SICAV-RAIF
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
