// PILLAR 7 — Kinetic Compliance
//
// An event-driven engine that turns a compliance verdict + red-team report
// into a queue of signed, human-gated REMEDIATION INTENTS — the "autonomous
// nervous system" that proposes how to rewire fund flows / limits / exposures
// when a regulation changes or a breach approaches.
//
// CRITICAL DESIGN: intents are PROPOSED and SIGNED, never auto-executed. Every
// intent carries a required-approval gate. Autonomy is in the detection and
// proposal; a human (or a policy with explicit pre-authorisation) ratifies
// before any effector fires. This is the only safe design for moving real money.

import type { Verdict } from './code-to-law'
import type { RedTeamReport } from './redteam'

export type IntentKind =
  | 'reduce_exposure'
  | 'raise_capital_buffer'
  | 'rebalance_liquidity'
  | 'freeze_counterparty'
  | 'file_disclosure'
  | 'escalate_to_board'
  | 'open_remediation_ticket'

export interface RemediationIntent {
  id: string
  kind: IntentKind
  target: string                 // field / counterparty / fund
  rationale: string
  urgency: 'immediate' | 'high' | 'normal' | 'watch'
  requires_approval: 'board' | 'cro' | 'compliance_officer' | 'auto_preauthorised'
  reversible: boolean
  estimated_effect: string
  signature: string              // HMAC binding the intent to its inputs
  created_at: string
}

async function sign(payload: string): Promise<string> {
  const secret = process.env.KINETIC_SIGNING_SECRET ?? 'genesis-kinetic-v1'
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

function uid(): string {
  return 'INT-' + Math.random().toString(36).slice(2, 10).toUpperCase()
}

// Map a failing rule / attack vector to a concrete remediation intent.
export async function deriveIntents(verdict: Verdict, redteam?: RedTeamReport): Promise<RemediationIntent[]> {
  const intents: RemediationIntent[] = []

  // 1. Hard failures from the verdict → immediate intents.
  // Uses failed_obligations (top-level, combinator-correct) so `none`-style
  // rules that correctly don't match never trigger a false remediation.
  for (const f of verdict.failed_obligations) {
    const critical = f.severity === 'critical'
    const key = `${f.rule_id} ${f.trigger_field ?? ''} ${f.detail}`
    let kind: IntentKind = 'open_remediation_ticket'
    let target = f.rule_id
    let effect = 'Restore the breached obligation into compliant range.'

    if (/tier1|capital|leverage/i.test(key)) { kind = 'raise_capital_buffer'; target = 'capital'; effect = 'Inject capital or de-risk RWA to restore ratio above limit.' }
    else if (/lcr|liquid/i.test(key)) { kind = 'rebalance_liquidity'; target = 'liquidity'; effect = 'Shift assets into HQLA to restore coverage.' }
    else if (/concentration|issuer|exposure/i.test(key)) { kind = 'reduce_exposure'; target = 'risk'; effect = 'Trim single-issuer position below concentration limit.' }
    else if (/ofac|sanction|screen/i.test(key)) { kind = 'freeze_counterparty'; target = 'screening'; effect = 'Freeze flagged counterparty and file SAR.' }

    const payload = `${kind}|${target}|${f.rule_id}|${verdict.state_hash}`
    intents.push({
      id: uid(),
      kind,
      target,
      rationale: `Obligation ${f.rule_id} failed: ${f.detail}${f.citation ? ` (${f.citation})` : ''}`,
      urgency: critical ? 'immediate' : 'high',
      requires_approval: critical ? 'board' : 'cro',
      reversible: kind !== 'freeze_counterparty',
      estimated_effect: effect,
      signature: await sign(payload),
      created_at: new Date().toISOString(),
    })
  }

  // 2. Near-misses from red-team (compliant now, but thin margin) → watch intents
  if (redteam) {
    for (const v of redteam.vectors.filter(v => Math.abs(v.delta_pct) < 10).slice(0, 5)) {
      const payload = `watch|${v.field}|${v.rule_id}|${verdict.state_hash}`
      intents.push({
        id: uid(),
        kind: 'open_remediation_ticket',
        target: v.field,
        rationale: `Thin margin: ${v.field} is only ${Math.abs(v.delta_pct).toFixed(1)}% from breaching ${v.rule_id}. ${v.patch_suggestion}`,
        urgency: 'watch',
        requires_approval: 'compliance_officer',
        reversible: true,
        estimated_effect: 'Pre-emptive buffer to avoid imminent breach.',
        signature: await sign(payload),
        created_at: new Date().toISOString(),
      })
    }
  }

  // 3. If clean and robust → escalate nothing, emit a single all-clear
  if (intents.length === 0) {
    const payload = `all_clear|${verdict.state_hash}`
    intents.push({
      id: uid(),
      kind: 'open_remediation_ticket',
      target: 'none',
      rationale: 'All obligations satisfied with adequate margin. No action required.',
      urgency: 'watch',
      requires_approval: 'auto_preauthorised',
      reversible: true,
      estimated_effect: 'Maintain monitoring cadence.',
      signature: await sign(payload),
      created_at: new Date().toISOString(),
    })
  }

  const order = { immediate: 0, high: 1, normal: 2, watch: 3 }
  return intents.sort((a, b) => order[a.urgency] - order[b.urgency])
}
