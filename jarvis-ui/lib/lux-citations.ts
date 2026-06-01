// Regulatory provenance for every verdict the Lux engines emit.
//
// Deliberately framework-level: we cite the instrument and the exact formula
// the engine computes, not invented article numbers. A compliance officer can
// verify the basis against the named source; the formula is what the code runs.
// This is the "why?" behind each PASS/FAIL — it turns a demo into something a
// regulator-facing buyer can audit.

export interface Citation {
  framework: string   // the instrument / circular
  basis: string       // plain-English requirement
  formula: string     // the exact computation the engine performs
  source: string      // official portal for the instrument
}

const EURLEX = 'https://eur-lex.europa.eu'
const CSSF = 'https://www.cssf.lu'
const GLEIF = 'https://www.gleif.org'

// AIFMD II trade checks (lib/lux-engines.ts → simulateTrade)
export const AIFMD_CITATIONS: Record<string, Citation> = {
  LEVERAGE_CAP: {
    framework: 'AIFMD II — Directive (EU) 2024/927 (loan-originating AIFs)',
    basis: 'Leverage of a loan-originating AIF is capped relative to NAV: 175% for open-ended, 300% for closed-ended funds (commitment method).',
    formula: 'post-trade gross exposure ÷ NAV ≤ cap',
    source: EURLEX,
  },
  LOAN_RETENTION_5PCT: {
    framework: 'AIFMD II — Directive (EU) 2024/927 (risk retention)',
    basis: 'The AIFM must retain economic interest in the loans it originates — a minimum 5% of the notional value of each originated loan.',
    formula: 'retained amount ÷ loan nominal ≥ 5%',
    source: EURLEX,
  },
  SINGLE_FI_CONCENTRATION_20PCT: {
    framework: 'AIFMD II — Directive (EU) 2024/927 (concentration)',
    basis: 'Exposure to a single borrower that is a financial institution is capped at 20% of the fund’s capital to limit interconnectedness risk.',
    formula: 'borrower exposure ÷ NAV ≤ 20%',
    source: EURLEX,
  },
}

// CSSF e-Identification pre-flight fields (preflightValidate)
export const EID_CITATIONS: Record<string, Citation> = {
  legal_name: { framework: 'CSSF e-Identification (eDesk transmission)', basis: 'Mandatory identifying metadata for any document submitted to the CSSF.', formula: 'field is non-empty', source: CSSF },
  management_company: { framework: 'CSSF e-Identification (eDesk transmission)', basis: 'The responsible ManCo must be named on every regulated transmission.', formula: 'field is non-empty', source: CSSF },
  depositary: { framework: 'AIFMD / UCITS depositary regime', basis: 'A single depositary must be identified for the fund.', formula: 'field is non-empty', source: EURLEX },
  document_title: { framework: 'CSSF e-Identification (eDesk transmission)', basis: 'The document must declare its own title for the filing index.', formula: 'field is non-empty', source: CSSF },
  document_sha256: { framework: 'Document-integrity control', basis: 'A SHA-256 content digest binds the filing to its exact bytes so any later change is detectable.', formula: 'matches /^[0-9a-f]{64}$/i', source: CSSF },
  eidas_signature: { framework: 'eIDAS — Regulation (EU) 910/2014', basis: 'Electronic transmissions require a qualified electronic signature for legal equivalence to a handwritten one.', formula: 'signature length ≥ 64 (well-formed)', source: EURLEX },
  lei: { framework: 'ISO 17442 — Legal Entity Identifier', basis: 'The entity must carry a valid 20-character LEI (18 alphanumerics + 2 check digits).', formula: 'matches /^[A-Z0-9]{18}[0-9]{2}$/', source: GLEIF },
}

// Cross-departmental reconciliation discrepancies (reconcile)
export const RECON_CITATIONS: Record<string, Citation> = {
  NAV_ASSET_SUM_MISMATCH: { framework: 'NAV calculation control', basis: 'The sum of independently-valued assets must reconcile to the reported NAV within tolerance.', formula: '|Σ asset values − reported NAV| ÷ NAV ≤ 0.5%', source: CSSF },
  LIQUIDITY_COVERAGE_SHORTFALL: { framework: 'AIFMD liquidity management', basis: 'The liquidity buffer must be able to meet redemption obligations.', formula: 'liquidity buffer ÷ redemption obligations ≥ 1.0', source: EURLEX },
  VAR_EXCEEDS_BUFFER: { framework: 'Risk-management process', basis: 'A 95% Value-at-Risk that exceeds the liquidity buffer flags a tail-risk coverage gap.', formula: '95% VaR > liquidity buffer', source: EURLEX },
  WEIGHTS_DO_NOT_SUM: { framework: 'Portfolio-allocation integrity', basis: 'Reported position weights must sum to ~100%; a gap indicates a data or valuation error.', formula: '|Σ weights − 1.0| ≤ 1%', source: CSSF },
  PROSPECTUS_WEIGHT_BREACH: { framework: 'Prospectus / UCITS investment restrictions', basis: 'No position may exceed the maximum weight the fund committed to in its prospectus.', formula: 'position weight > prospectus maximum', source: EURLEX },
}

// Delegation oversight scoring drivers (scoreDelegate)
export const DELEGATION_CITATION: Citation = {
  framework: 'CSSF Circular 18/698 — delegation & oversight',
  basis: 'A ManCo retains responsibility for delegated functions and must continuously monitor critical vendors; a critical vendor falling below the health floor must be escalated.',
  formula: 'score = 100 − Σ penalties(SLA, compliance, security, findings, staleness); breach if score < floor',
  source: CSSF,
}

export const SUBSTANCE_CITATION: Citation = {
  framework: 'CSSF Circular 24/856 — substance & central administration',
  basis: 'Key decisions (e.g. board sign-off) must demonstrably originate from within Luxembourg to evidence genuine substance.',
  formula: 'point-in-polygon test of (lat, lon) against the Luxembourg border',
  source: CSSF,
}
