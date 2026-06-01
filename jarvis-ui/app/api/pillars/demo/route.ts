// Live demonstration of the 7-pillar foundational loop.
//
// GET  /api/pillars/demo            → runs the loop on a built-in stressed state
// POST /api/pillars/demo {state,...} → runs the loop on a caller-supplied state
//
// Also exposes the topology analysis over the example rulebook graph.

import { NextRequest } from 'next/server'
import { runLoop } from '@/lib/pillars/loop'
import { EXAMPLE_RULEBOOK } from '@/lib/pillars/code-to-law'
import { analyzeTopology, type LawNode, type LawEdge } from '@/lib/pillars/topology'
import { enforceRateLimit } from '@/lib/ratelimit'
import { withApiGuard } from '@/lib/api-guard'

// nodejs runtime: the guard's api_keys lookup + audit_log writes use the
// service client. GET stays public (powers the /architecture LoopConsole);
// POST (caller-supplied state) is Bearer-gated.
export const runtime = 'nodejs'

// A deliberately stressed institution: tier1 thin, concentration over limit,
// sanctions clean. Shows the loop catching real failures.
const DEMO_STATE = {
  capital: { tier1_ratio: 11.2, leverage_ratio: 3.4 },
  liquidity: { lcr: 104 },
  risk: { single_issuer_pct: 13.5 },
  screening: { ofac_match: 'false' },
}

// Example obligation graph for topology (regimes + cross-references)
const LAW_NODES: LawNode[] = [
  { id: 'tier1', label: 'Tier-1 ratio', cluster: 'capital' },
  { id: 'leverage', label: 'Leverage ratio', cluster: 'capital' },
  { id: 'lcr', label: 'Liquidity coverage', cluster: 'liquidity' },
  { id: 'nsfr', label: 'Net stable funding', cluster: 'liquidity' },
  { id: 'concentration', label: 'Single-issuer limit', cluster: 'risk' },
  { id: 'large_exp', label: 'Large exposures', cluster: 'risk' },
  { id: 'ofac', label: 'Sanctions screening', cluster: 'conduct' },
  { id: 'aml', label: 'AML/CFT', cluster: 'conduct' },
  { id: 'depositary', label: 'Depositary segregation', cluster: 'custody' },
  { id: 'reporting', label: 'Annex IV reporting', cluster: 'reporting' },
]
const LAW_EDGES: LawEdge[] = [
  { source: 'tier1', target: 'leverage', kind: 'shared_field', weight: 0.9 },
  { source: 'tier1', target: 'large_exp', kind: 'cross_reference', weight: 0.6 },
  { source: 'lcr', target: 'nsfr', kind: 'shared_field', weight: 0.8 },
  { source: 'concentration', target: 'large_exp', kind: 'cross_reference', weight: 0.7 },
  { source: 'ofac', target: 'aml', kind: 'shared_field', weight: 0.9 },
  { source: 'aml', target: 'reporting', kind: 'cross_reference', weight: 0.5 },
  { source: 'depositary', target: 'reporting', kind: 'precedence', weight: 0.4 },
  // the ONLY link between the conduct cluster and the capital/risk world:
  { source: 'large_exp', target: 'aml', kind: 'cross_reference', weight: 0.3 },
  // depositary hangs off reporting only → near-isolated regime
]

const ZK_PRIVATE = { tier1_ratio: 11.2, lcr: 104 }
const ZK_PREDICATES = [
  { field: 'tier1_ratio', op: '>=' as const, threshold: 12 },
  { field: 'lcr', op: '>=' as const, threshold: 100 },
]

async function buildResponse(state: Record<string, unknown>, jurisdiction: string) {
  const loop = await runLoop({
    state,
    rulebook: EXAMPLE_RULEBOOK,
    jurisdiction,
    private_fields: ZK_PRIVATE,
    zk_predicates: ZK_PREDICATES,
  })
  const topology = analyzeTopology(LAW_NODES, LAW_EDGES)
  return {
    ok: true,
    pillars: {
      p3_code_to_law: loop.verdict,
      p2_red_team: loop.redteam,
      p1_zk_vault: loop.zk,
      p4_precedent: loop.precedent,
      p6_regulatory_twin: loop.twin,
      p7_kinetic: loop.intents,
      p5_topology: topology,
    },
    generated_at: new Date().toISOString(),
  }
}

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, { route: 'pillars-demo', limit: 60 })
  if (limited) return limited
  const jur = new URL(req.url).searchParams.get('jurisdiction') ?? 'CSSF'
  const body = await buildResponse(DEMO_STATE, jur)
  return Response.json(body, { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=30' } })
}

// POST is Bearer-gated + PII-scrubbed. Caller supplies their own state vector.
export const POST = withApiGuard(
  async (_req, { body }) => {
    const b = (body ?? {}) as { state?: Record<string, unknown>; jurisdiction?: string }
    const res = await buildResponse(b.state ?? DEMO_STATE, b.jurisdiction ?? 'CSSF')
    return Response.json(res, { headers: { 'Access-Control-Allow-Origin': '*' } })
  },
  { scope: 'evaluate', rateLimit: 60, scrubBody: true },
)
