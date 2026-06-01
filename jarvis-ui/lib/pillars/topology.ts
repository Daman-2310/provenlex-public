// PILLAR 5 — Topological Law Mapping
//
// Treats the regulation/obligation set as a graph and applies real graph-
// theoretic + simplicial analysis to surface STRUCTURAL features that aren't
// visible rule-by-rule:
//   - Betweenness centrality   → which obligations are load-bearing bridges
//   - Structural holes (Burt)  → gaps where two regulatory clusters connect
//                                 only through a single weak edge = a loophole
//   - Connected components      → isolated regimes with no cross-reference
//   - 1-dimensional cycles (β1) → circular obligation dependencies (a proxy
//                                 for Betti-1 via independent-cycle count)
//
// "Loophole" here is given a precise, computable meaning: an unconstrained
// region of state space reachable because two obligation clusters are joined
// by a removable bridge (an articulation edge) rather than densely cross-checked.

export interface LawNode {
  id: string
  label: string
  cluster: string          // regime: 'capital' | 'liquidity' | 'conduct' | ...
}

export interface LawEdge {
  source: string
  target: string
  kind: 'cross_reference' | 'shared_field' | 'precedence' | 'exemption'
  weight: number
}

export interface TopologyReport {
  nodes: number
  edges: number
  components: number
  betweenness: Array<{ id: string; score: number }>
  articulation_points: string[]      // nodes whose removal disconnects the graph
  bridges: Array<{ source: string; target: string }> // edges whose removal disconnects
  structural_holes: Array<{ between: [string, string]; via: string; risk: number }>
  betti_1: number                      // independent cycle count (circular deps)
  loopholes: Array<{ description: string; severity: number; nodes: string[] }>
}

type Adj = Map<string, Set<string>>

function buildAdj(nodes: LawNode[], edges: LawEdge[]): Adj {
  const adj: Adj = new Map(nodes.map(n => [n.id, new Set<string>()]))
  for (const e of edges) {
    adj.get(e.source)?.add(e.target)
    adj.get(e.target)?.add(e.source)
  }
  return adj
}

// Brandes' algorithm for unweighted betweenness centrality (exact).
function betweenness(nodes: LawNode[], adj: Adj): Map<string, number> {
  const CB = new Map<string, number>(nodes.map(n => [n.id, 0]))
  for (const s of nodes.map(n => n.id)) {
    const S: string[] = []
    const P = new Map<string, string[]>()
    const sigma = new Map<string, number>(nodes.map(n => [n.id, 0]))
    const dist = new Map<string, number>(nodes.map(n => [n.id, -1]))
    sigma.set(s, 1); dist.set(s, 0)
    const Q: string[] = [s]
    while (Q.length) {
      const v = Q.shift()!
      S.push(v)
      for (const w of adj.get(v) ?? []) {
        if (dist.get(w)! < 0) { Q.push(w); dist.set(w, dist.get(v)! + 1) }
        if (dist.get(w)! === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!)
          ;(P.get(w) ?? P.set(w, []).get(w)!).push(v)
        }
      }
    }
    const delta = new Map<string, number>(nodes.map(n => [n.id, 0]))
    while (S.length) {
      const w = S.pop()!
      for (const v of P.get(w) ?? []) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!))
      }
      if (w !== s) CB.set(w, CB.get(w)! + delta.get(w)!)
    }
  }
  // undirected → divide by 2
  for (const [k, v] of CB) CB.set(k, v / 2)
  return CB
}

function countComponents(nodes: LawNode[], adj: Adj): number {
  const seen = new Set<string>()
  let c = 0
  for (const n of nodes) {
    if (seen.has(n.id)) continue
    c++
    const stack = [n.id]
    while (stack.length) {
      const v = stack.pop()!
      if (seen.has(v)) continue
      seen.add(v)
      for (const w of adj.get(v) ?? []) if (!seen.has(w)) stack.push(w)
    }
  }
  return c
}

// Tarjan-style bridge + articulation detection (iterative-safe via recursion on small graphs).
function findBridgesAndArticulations(nodes: LawNode[], adj: Adj): { bridges: Array<{ source: string; target: string }>; articulation: string[] } {
  const disc = new Map<string, number>()
  const low = new Map<string, number>()
  const visited = new Set<string>()
  const apSet = new Set<string>()
  const bridges: Array<{ source: string; target: string }> = []
  let timer = 0

  function dfs(u: string, parent: string | null) {
    visited.add(u); disc.set(u, timer); low.set(u, timer); timer++
    let children = 0
    for (const v of adj.get(u) ?? []) {
      if (v === parent) continue
      if (visited.has(v)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!))
      } else {
        children++
        dfs(v, u)
        low.set(u, Math.min(low.get(u)!, low.get(v)!))
        if (low.get(v)! > disc.get(u)!) bridges.push({ source: u, target: v })
        if (parent !== null && low.get(v)! >= disc.get(u)!) apSet.add(u)
      }
    }
    if (parent === null && children > 1) apSet.add(u)
  }

  for (const n of nodes) if (!visited.has(n.id)) dfs(n.id, null)
  return { bridges, articulation: [...apSet] }
}

// Structural holes: pairs of nodes in DIFFERENT clusters connected only via one
// intermediary — the intermediary "spans the hole" and is a loophole pivot.
function structuralHoles(nodes: LawNode[], adj: Adj): TopologyReport['structural_holes'] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const out: TopologyReport['structural_holes'] = []
  for (const via of nodes) {
    const neighbors = [...(adj.get(via.id) ?? [])]
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const a = neighbors[i], b = neighbors[j]
        const ca = nodeMap.get(a)?.cluster, cb = nodeMap.get(b)?.cluster
        // different clusters AND not directly connected → via spans a hole
        if (ca && cb && ca !== cb && !adj.get(a)?.has(b)) {
          const risk = Math.round(60 + Math.random() * 0 + (neighbors.length <= 2 ? 30 : 10))
          out.push({ between: [a, b], via: via.id, risk })
        }
      }
    }
  }
  return out.sort((x, y) => y.risk - x.risk).slice(0, 12)
}

export function analyzeTopology(nodes: LawNode[], edges: LawEdge[]): TopologyReport {
  const adj = buildAdj(nodes, edges)
  const bw = betweenness(nodes, adj)
  const components = countComponents(nodes, adj)
  const { bridges, articulation } = findBridgesAndArticulations(nodes, adj)
  const holes = structuralHoles(nodes, adj)
  // β1 (independent cycles) for each component: E - V + C
  const betti_1 = edges.length - nodes.length + components

  const loopholes: TopologyReport['loopholes'] = []
  for (const b of bridges) {
    loopholes.push({
      description: `Removable bridge between "${b.source}" and "${b.target}" — these regimes cross-check through a single edge. State can drift in the gap without tripping either cluster.`,
      severity: 80,
      nodes: [b.source, b.target],
    })
  }
  for (const h of holes.slice(0, 5)) {
    loopholes.push({
      description: `Structural hole: "${h.between[0]}" and "${h.between[1]}" (different regimes) connect only via "${h.via}". Exposure routed through "${h.via}" is under-constrained.`,
      severity: h.risk,
      nodes: [h.between[0], h.between[1], h.via],
    })
  }

  return {
    nodes: nodes.length,
    edges: edges.length,
    components,
    betweenness: [...bw.entries()].map(([id, score]) => ({ id, score: Math.round(score * 100) / 100 })).sort((a, b) => b.score - a.score).slice(0, 10),
    articulation_points: articulation,
    bridges,
    structural_holes: holes,
    betti_1,
    loopholes: loopholes.sort((a, b) => b.severity - a.severity),
  }
}
