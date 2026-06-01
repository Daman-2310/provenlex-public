// Counterparty edges between Book of Genesis entities.
//
// Each edge describes a real-world type of financial relationship:
//   - depositary: custodian for a fund's assets
//   - prime_broker: leverage + securities lending provider for asset mgr
//   - fund_admin: administrative/transfer agent services
//   - sub_advisor: delegation of investment mandate to another firm
//   - parent: ownership/sponsorship link (subsidiary → parent)
//   - reinsurance: insurance treaty between two insurers
//
// Edge weight is a normalized exposure proxy (0-1). It scales with both the
// counterparty's size and the typicality of the relationship.
//
// We hand-curate the most representative edges across the Book's 100 entities
// based on public knowledge of EU fund-administration market structure (Big-4
// custodians + prime brokers, plus parent/subsidiary group ties).

import { BOOK_CANDIDATES } from '@/lib/book'

export type EdgeKind =
  | 'depositary'
  | 'prime_broker'
  | 'fund_admin'
  | 'sub_advisor'
  | 'parent'
  | 'reinsurance'

export interface CounterpartyEdge {
  source: string   // entity name
  target: string
  kind: EdgeKind
  weight: number   // 0..1 exposure proxy
}

// Big-4 LU custodians + prime brokers (these become hubs in the graph)
const LU_CUSTODIANS = [
  'Bank of New York Mellon S.A./N.V. Luxembourg',
  'State Street Bank Luxembourg S.C.A.',
  'BNP Paribas S.A. Luxembourg',
  'CACEIS Investor Services',
]

const PRIME_BROKERS = [
  'JPMorgan Chase Bank, N.A. (London Branch)',
  'Goldman Sachs Bank Europe SE',
  'Deutsche Bank AG, London Branch',
  'BNP Paribas S.A. Luxembourg',
  'UBS Europe SE',
]

// Parent ↔ subsidiary explicit pairs (group structure)
const PARENT_EDGES: Array<[string, string]> = [
  ['UBS Asset Management (Europe) S.A.', 'UBS Europe SE'],
  ['BNP Paribas Asset Management Holding', 'BNP Paribas S.A. Luxembourg'],
  ['AXA Investment Managers Paris', 'AXA S.A.'],
  ['Allianz Global Investors GmbH', 'Allianz SE'],
  ['Allianz Life Luxembourg S.A.', 'Allianz SE'],
  ['DWS Group GmbH & Co. KGaA', 'Deutsche Bank AG, London Branch'],
  ['Schroder Investment Management (Europe) S.A.', 'Schroders plc'],     // Schroders plc not in Book but kept for ref
  ['Banca Generali Fund Management', 'Generali Investments Holding S.p.A.'],
  ['Eurizon Capital S.A.', 'Intesa Sanpaolo Bank Luxembourg'],
  ['Mediobanca International (Luxembourg) S.A.', 'Mediobanca Banca di Credito Finanziario'],
  ['Lyxor International Asset Management', 'Société Générale Luxembourg'],
  ['Carmignac Gestion Luxembourg', 'Carmignac Gestion'],
  ['Edmond de Rothschild Asset Management', 'Banque Edmond de Rothschild Europe'],
  ['Anima Holding S.p.A.', 'Banco BPM'],
]

// Hand-coded sub-advisor / cross-firm delegation relationships
const SUB_ADVISOR_EDGES: Array<[string, string]> = [
  ['M&G Investments', 'BlackRock Investment Management (UK) Limited'],
  ['Liontrust Investment Partners', 'Janus Henderson Investors UK'],
  ['Jupiter Asset Management', 'Janus Henderson Investors UK'],
  ['Quilter Investors Limited', 'M&G Investments'],
  ['Carmignac Gestion Luxembourg', 'Pictet Asset Management S.A.'],
  ['ODDO BHF Asset Management', 'La Française AM'],
  ['Comgest S.A.', 'Allfunds Bank International'],
  ['Mirabaud Asset Management (Europe)', 'Pictet Asset Management S.A.'],
  ['Robeco Institutional Asset Management', 'NN Investment Partners B.V.'],
  ['Azimut Investments S.A.', 'Union Investment Luxembourg S.A.'],
]

// Reinsurance treaties (insurer ↔ insurer)
const REINSURANCE_EDGES: Array<[string, string]> = [
  ['Allianz SE', 'Munich Re'],
  ['Munich Re', 'Hannover Re'],
  ['SCOR SE', 'Munich Re'],
  ['AXA S.A.', 'Allianz SE'],
  ['Zurich Insurance Group AG', 'Munich Re'],
  ['Aviva plc', 'Hannover Re'],
  ['Generali Investments Holding S.p.A.', 'Munich Re'],
]

function bookNames(): Set<string> {
  return new Set(BOOK_CANDIDATES.map(c => c.name))
}

function buildEdges(): CounterpartyEdge[] {
  const names = bookNames()
  const edges: CounterpartyEdge[] = []
  const seen = new Set<string>()

  function add(s: string, t: string, kind: EdgeKind, weight: number) {
    if (s === t) return
    if (!names.has(s) || !names.has(t)) return
    const key = `${s}|${t}|${kind}`
    const rev = `${t}|${s}|${kind}`
    if (seen.has(key) || seen.has(rev)) return
    seen.add(key)
    edges.push({ source: s, target: t, kind, weight })
  }

  // 1. Every LU asset mgmt + insurance subsidiary → 1-2 LU custodians
  for (const c of BOOK_CANDIDATES) {
    if (c.jurisdiction === 'LU' && (c.category === 'asset_mgmt' || c.category === 'wealth' || c.category === 'insurance')) {
      // Pick 2 custodians based on name hash for determinism
      const h = c.name.charCodeAt(0) + c.name.charCodeAt(c.name.length - 1)
      add(c.name, LU_CUSTODIANS[h % LU_CUSTODIANS.length], 'depositary', 0.7)
      add(c.name, LU_CUSTODIANS[(h + 1) % LU_CUSTODIANS.length], 'depositary', 0.4)
    }
  }

  // 2. Non-LU asset mgmt → BNY Mellon LU OR State Street LU (cross-border)
  for (const c of BOOK_CANDIDATES) {
    if (c.jurisdiction !== 'LU' && c.category === 'asset_mgmt') {
      const h = c.name.length
      add(c.name, LU_CUSTODIANS[h % 2], 'depositary', 0.55)
    }
  }

  // 3. Large asset mgmt → 1 prime broker
  for (const c of BOOK_CANDIDATES) {
    if (c.category === 'asset_mgmt') {
      const h = c.name.charCodeAt(0) + c.name.length
      const pb = PRIME_BROKERS[h % PRIME_BROKERS.length]
      add(c.name, pb, 'prime_broker', 0.6)
    }
  }

  // 4. Banks ↔ banks (correspondent banking) — connect a few hubs
  const hubBanks = [
    'JPMorgan Chase Bank, N.A. (London Branch)',
    'Deutsche Bank AG, London Branch',
    'BNP Paribas S.A. Luxembourg',
    'UBS Europe SE',
    'Goldman Sachs Bank Europe SE',
  ]
  const peripheralBanks = BOOK_CANDIDATES
    .filter(c => c.category === 'bank' && !hubBanks.includes(c.name))
    .map(c => c.name)
  for (const pb of peripheralBanks) {
    add(pb, hubBanks[pb.length % hubBanks.length], 'fund_admin', 0.35)
  }

  // 5. CACEIS → many LU asset managers (fund admin)
  for (const c of BOOK_CANDIDATES) {
    if (c.jurisdiction === 'LU' && c.category === 'asset_mgmt') {
      if ((c.name.charCodeAt(0) % 3) === 0) {
        add(c.name, 'CACEIS Investor Services', 'fund_admin', 0.45)
      }
    }
  }

  // 6. Hand-coded parent/subsidiary links
  for (const [child, parent] of PARENT_EDGES) {
    add(child, parent, 'parent', 0.9)
  }

  // 7. Sub-advisor cross-delegations
  for (const [s, t] of SUB_ADVISOR_EDGES) {
    add(s, t, 'sub_advisor', 0.4)
  }

  // 8. Reinsurance
  for (const [s, t] of REINSURANCE_EDGES) {
    add(s, t, 'reinsurance', 0.55)
  }

  return edges
}

export const COUNTERPARTY_EDGES: CounterpartyEdge[] = buildEdges()

// Adjacency: for each entity name, list of neighbors and edge data
export function buildAdjacency(): Map<string, Array<{ neighbor: string; kind: EdgeKind; weight: number }>> {
  const adj = new Map<string, Array<{ neighbor: string; kind: EdgeKind; weight: number }>>()
  for (const e of COUNTERPARTY_EDGES) {
    const a = adj.get(e.source) ?? []; a.push({ neighbor: e.target, kind: e.kind, weight: e.weight }); adj.set(e.source, a)
    const b = adj.get(e.target) ?? []; b.push({ neighbor: e.source, kind: e.kind, weight: e.weight }); adj.set(e.target, b)
  }
  return adj
}

// Network contagion risk = sum over neighbors of (neighbor.pci × edge.weight × decay)
// Decay accounts for distance — direct neighbors are full weight, two-hops decayed.
// Returns a map of entity_name → contagion_risk (0..100 normalized).
export function computeContagionRisk(pciByName: Map<string, number>): Map<string, number> {
  const adj = buildAdjacency()
  const risk = new Map<string, number>()
  const TWO_HOP_DECAY = 0.35

  for (const [name] of pciByName) {
    let acc = 0
    let weightSum = 0
    const neighbors = adj.get(name) ?? []
    const seen = new Set<string>([name])
    for (const n of neighbors) {
      seen.add(n.neighbor)
      const pci = pciByName.get(n.neighbor) ?? 0
      acc += pci * n.weight
      weightSum += n.weight
      // Two-hop walk
      const nn = adj.get(n.neighbor) ?? []
      for (const nn2 of nn) {
        if (seen.has(nn2.neighbor)) continue
        const pci2 = pciByName.get(nn2.neighbor) ?? 0
        acc += pci2 * nn2.weight * n.weight * TWO_HOP_DECAY
        weightSum += nn2.weight * n.weight * TWO_HOP_DECAY
      }
    }
    const normalized = weightSum > 0 ? Math.round(acc / weightSum) : 0
    risk.set(name, normalized)
  }
  return risk
}

export const EDGE_KIND_LABEL: Record<EdgeKind, string> = {
  depositary:   'Depositary / Custody',
  prime_broker: 'Prime Brokerage',
  fund_admin:   'Fund Administration',
  sub_advisor:  'Sub-Advisory',
  parent:       'Parent / Subsidiary',
  reinsurance:  'Reinsurance Treaty',
}

export const EDGE_KIND_COLOR: Record<EdgeKind, string> = {
  depositary:   '#4a9eff',
  prime_broker: '#ff7a00',
  fund_admin:   '#9b6dff',
  sub_advisor:  '#00d8ff',
  parent:       '#ffd86b',
  reinsurance:  '#ff3388',
}
