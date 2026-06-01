// THE FOUNDATIONAL LOOP — unified orchestration across all 7 pillars.
//
// Wires the pillars into one deterministic pass:
//   state + rulebook → [3] compile + evaluate → verdict
//                    → [2] red-team the verdict → attack vectors
//                    → [1] ZK-prove the verdict privately → proof bundle
//                    → [4] precedent sim on the worst failure → enforcement prior
//                    → [6] regulatory twin read for the jurisdiction → posture
//                    → [7] derive signed remediation intents → action queue
//   (topology [5] runs over the rulebook graph separately — structural layer)
//
// This is the single control loop the architecture page demonstrates live.

import { compileRulebook, type Rule } from './code-to-law'
import { redTeam } from './redteam'
import { proveCompliance, verifyBundle } from './zk-vault'
import { simulatePrecedent } from './precedent'
import { readTwin, type BreachProfile } from './regulatory-twin'
import { deriveIntents } from './kinetic'

export interface LoopInput {
  state: Record<string, unknown>
  rulebook: Rule[]
  jurisdiction: string          // CSSF | BaFin | FCA | AMF | AFM
  private_fields?: Record<string, number>  // for the ZK vault demo
  zk_predicates?: Array<{ field: string; op: '>=' | '<=' | '>' | '<'; threshold: number }>
}

export async function runLoop(input: LoopInput) {
  // [3] Code-to-Law
  const evaluate = compileRulebook(input.rulebook)
  const verdict = await evaluate(input.state)

  // [2] Red-team
  const redteam = await redTeam(input.rulebook, input.state, { steps: 120 })

  // [1] ZK Vault (if private fields supplied)
  let zk = null
  if (input.private_fields && input.zk_predicates) {
    const bundle = await proveCompliance(input.private_fields, input.zk_predicates)
    const verification = await verifyBundle(bundle)
    zk = { bundle, verification }
  }

  // [4] Precedent — simulate enforcement for the most severe failed obligation
  const worstFail = verdict.failed_obligations.find(o => o.severity === 'critical') ?? verdict.failed_obligations[0]
  const jurMap: Record<string, string> = { CSSF: 'LU', BaFin: 'DE', FCA: 'GB', AMF: 'FR', AFM: 'NL' }
  const precedent = simulatePrecedent({
    obligation: worstFail?.rule_id ?? 'baseline',
    jurisdiction: jurMap[input.jurisdiction] ?? 'LU',
    severity: verdict.critical_failures > 0 ? 0.85 : verdict.failed > 0 ? 0.5 : 0.15,
    samples: 5000,
  })

  // [6] Regulatory Twin
  const worstKey = `${worstFail?.rule_id ?? ''} ${worstFail?.trigger_field ?? ''}`
  const breach: BreachProfile = {
    theme: /aml|sanction|screen/i.test(worstKey) ? 'AML'
         : /tier1|capital|leverage/i.test(worstKey) ? 'governance'
         : /lcr|liquid/i.test(worstKey) ? 'liquidity' : 'governance',
    severity: verdict.critical_failures > 0 ? 0.85 : verdict.failed > 0 ? 0.5 : 0.15,
    public_signal: 0.3,
  }
  const twin = readTwin(input.jurisdiction, breach)

  // [7] Kinetic — derive remediation intents
  const intents = await deriveIntents(verdict, redteam)

  return { verdict, redteam, zk, precedent, twin, intents }
}
