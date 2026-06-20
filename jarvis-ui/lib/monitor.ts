// CONTINUOUS MONITORING — the pillar that turns a one-time scan into a
// subscription. A monitored fund's declared metrics are stored; the monitor
// re-evaluates them against the CURRENT statutory rules on a schedule and
// alerts the owner when the verdict regresses (e.g. EU tightens a cap, or a
// fund that was compliant no longer is). The re-evaluation reuses the exact
// deterministic engine /scan uses, so monitoring verdicts == scan verdicts.

import { scanCompliance, type ExtractedDoc, type ScanResult, type Finding } from '@/lib/scan-engine'

export interface MonitoredFund {
  id: string
  email: string                       // owner to alert
  fundName: string | null
  structure: 'open_ended' | 'closed_ended' | 'unknown'
  loanOriginating?: boolean              // gates the AIFMD II loan-origination caps
  isUCITS?: boolean                      // gates the UCITS diversification limits
  declaredLeverageCapPct: number | null
  declaredRetentionPct: number | null
  declaredConcentrationCapPct: number | null
  holdings: { name: string; weightPct: number }[]
  lastVerdict: 'compliant' | 'non-compliant' | 'warning'
  lastCriticalCount: number
  lastRulesetVersion?: string            // the ruleset version the last verdict was issued under
}

// Re-run the deterministic engine on a monitored fund's stored metrics.
export function reevaluate(f: MonitoredFund): ScanResult {
  const doc: ExtractedDoc = {
    fundName: f.fundName,
    structure: f.structure,
    loanOriginating: f.loanOriginating,
    isUCITS: f.isUCITS,
    declaredLeverageCapPct: f.declaredLeverageCapPct,
    declaredRetentionPct: f.declaredRetentionPct,
    declaredConcentrationCapPct: f.declaredConcentrationCapPct,
    holdings: f.holdings,
    provenance: [],
  }
  return { doc, ...scanCompliance(doc) }
}

export interface ChangeResult {
  changed: boolean
  regressed: boolean                  // got worse — worth an alert
  rulesetChanged: boolean             // the rules themselves moved since the last verdict
  newVerdict: 'compliant' | 'non-compliant' | 'warning'
  newCriticalCount: number
  newRulesetVersion: string
  reason: string
  newCriticalFindings: Finding[]
}

const verdictOf = (r: ScanResult): 'compliant' | 'non-compliant' | 'warning' =>
  r.compliant ? 'compliant' : r.criticalCount > 0 ? 'non-compliant' : 'warning'

// Compare a fund's stored verdict to a fresh re-evaluation.
export function detectChange(f: MonitoredFund, current: ScanResult): ChangeResult {
  const newVerdict = verdictOf(current)
  const rank = { compliant: 0, warning: 1, 'non-compliant': 2 } as const
  const worse = rank[newVerdict] > rank[f.lastVerdict] || current.criticalCount > f.lastCriticalCount
  const changed = newVerdict !== f.lastVerdict || current.criticalCount !== f.lastCriticalCount
  // The highest-value alert: the RULES moved (a new dated ruleset shipped) and the
  // fund's verdict changed under them — i.e. a fund that was fine is now in breach
  // purely because AIFMD II / UCITS tightened, not because the fund changed.
  const rulesetChanged = f.lastRulesetVersion != null && f.lastRulesetVersion !== current.rulesetVersion
  const rulesetNote = rulesetChanged ? ` (under updated ruleset ${f.lastRulesetVersion} → ${current.rulesetVersion})` : ''
  return {
    changed,
    regressed: worse,
    rulesetChanged,
    newVerdict,
    newCriticalCount: current.criticalCount,
    newRulesetVersion: current.rulesetVersion,
    reason: worse
      ? `Compliance regressed: ${f.lastVerdict} (${f.lastCriticalCount} critical) → ${newVerdict} (${current.criticalCount} critical)${rulesetNote}.`
      : changed
        ? `Status changed: ${f.lastVerdict} → ${newVerdict}${rulesetNote}.`
        : rulesetChanged
          ? `Ruleset updated ${f.lastRulesetVersion} → ${current.rulesetVersion}; verdict unchanged (${newVerdict}).`
          : 'No change.',
    newCriticalFindings: current.findings.filter(x => x.severity === 'critical'),
  }
}

// Build the alert email for a regressed fund.
export function alertEmail(f: MonitoredFund, change: ChangeResult): { subject: string; html: string; text: string } {
  const name = f.fundName ?? 'Your monitored fund'
  const subject = `ProvenLex alert — ${name} is now ${change.newVerdict.toUpperCase()}`
  const findingsList = change.newCriticalFindings
    .map(x => `• ${x.title}: ${x.detail}`)
    .join('\n')
  const text =
    `${change.reason}\n\n` +
    `Fund: ${name}\nNew verdict: ${change.newVerdict} (${change.newCriticalCount} critical)\n\n` +
    `${findingsList || 'No critical findings.'}\n\n` +
    `Re-run the full scan: https://provenlex.vercel.app/scan`
  const html =
    `<p><strong>${change.reason}</strong></p>` +
    `<p>Fund: <strong>${escapeHtml(name)}</strong><br/>New verdict: <strong>${change.newVerdict}</strong> (${change.newCriticalCount} critical)</p>` +
    `<ul>${change.newCriticalFindings.map(x => `<li><strong>${escapeHtml(x.title)}:</strong> ${escapeHtml(x.detail)}</li>`).join('') || '<li>No critical findings.</li>'}</ul>` +
    `<p><a href="https://provenlex.vercel.app/scan">Re-run the full scan →</a></p>`
  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
