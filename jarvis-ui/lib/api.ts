export const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://daman23-genesis-swarm-api.hf.space'

// Render free tier cold-starts in up to 60s. This call wakes the backend and
// waits up to 90s before giving up. Call once on page mount.
export async function wakeupBackend(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: controller.signal, cache: 'no-store', headers: { 'ngrok-skip-browser-warning': '1' } })
    clearTimeout(timer)
    return res.ok
  } catch {
    clearTimeout(timer)
    return false
  }
}

// ─── Type Definitions ──────────────────────────────────────────

export interface BotStatus {
  bot_id: string
  bot_type: string
  personality_label: string
  last_score: number
  is_anomaly: boolean
  healthy: boolean
  last_summary: string
  threshold: number
  uptime_s?: number
  last_seen?: string
}

export interface Alert {
  alert_id: string
  bot_id: string
  bot_type: string
  score: number
  threshold: number
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  message: string
  ts: number
  acknowledged: boolean
}

export interface SwarmStatus {
  status: 'starting' | 'running' | string
  uptime_seconds: number
  total_bots: number
  healthy_bots: number
  active_alerts: number
  top_threat: string | null
  top_score: number
  consensus_rounds: number
  healing_events: number
  mode: string
  fear_index: number
  safe_haven: boolean
}

export interface BotHistoryPoint {
  ts: number
  score: number
  is_anomaly: boolean
  bot_type: string
}

export interface BotForecast {
  forecast: number[]
  upper: number[]
  lower: number[]
  trend: string
  growth_pct: number
  current_score: number
  predicted_peak: number
  steps: number
}

export interface MerkleData {
  root: string
  depth: number
  leaves: Array<{
    hash: string
    ts: number
    event_type: string
    bot_id: string
    data_hash?: string
  }>
  leaf_count: number
  last_updated: string
}

export interface TrustScore {
  bot_id: string
  trust_score: number
  votes_cast: number
  votes_received: number
  byzantine_flag: boolean
}

export interface TrustData {
  scores: Record<string, TrustScore>
  quorum_health: {
    healthy: boolean
    quorum_count: number
    total_bots: number
    threshold: number
    degraded_nodes: string[]
  }
  last_consensus_ts: number
}

export interface ChaosData {
  active_attacks: Array<{
    attack_id: string
    attack_type: string
    target_bot: string
    started_at: number
    severity: number
  }>
  resilience_score: number
  last_recovery_ts: number
  total_attacks_today: number
}

export interface SecurityData {
  pii_detections: number
  blocked_queries: number
  threat_level: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED'
  active_shields: string[]
  last_threat_ts: number
}

export interface MemoryQueryResult {
  answer: string
  precedents: Array<{
    id: string
    document: string
    metadata: Record<string, unknown>
  }>
  confidence: number
  ts?: number
  query?: string
}

export interface SystemMetrics {
  // Sovereign module fields
  merkle_depth?: number
  merkle_root?: string | null
  avg_trust_score?: number
  pii_masks_applied?: number
  chaos_attacks?: unknown
  history_bots_tracked?: number
  // Legacy fields (may not be present)
  cpu_pct?: number
  mem_pct?: number
  msgs_per_sec?: number
  avg_latency_ms?: number
  active_connections?: number
  queue_depth?: number
  error_rate?: number
  ts?: number
}

export interface ConsensusLatency {
  p50_ms: number
  p95_ms: number
  p99_ms: number
  rounds_per_min: number
  last_round_ts: number
  history: Array<{ ts: number; latency_ms: number }>
}

export interface FullDashboard {
  uptime: number
  status: {
    total_bots: number
    healthy_bots: number
    active_alerts: number
    top_score: number
    consensus_rounds: number
    healing_events: number
  }
  mode: {
    mode: string
    fear_index: number
    safe_haven_active: boolean
  }
  bots: BotStatus[]
  alerts: Alert[]
  healing: unknown[]
  positions: unknown[]
  debate: unknown[]
  bottom: Record<string, unknown>
  remediation: Record<string, unknown>
  security: Record<string, unknown>
}

export interface InvestorBrief {
  headline: string
  readiness_score: number
  protected_aum_eur_m: number
  capital_quarantined_eur_m: number
  annual_value_eur_m: number
  payback_days: number
  detection_latency_ms: number
  traditional_detection_hours: number
  speedup_multiple: number
  top_risk_score: number
  open_cases: number
  evidence: {
    tests_passing: number
    bot_count: number
    quorum: string
    merkle_depth: number
    ledger_chain_length: number
    ledger_integrity: boolean
    consensus_rounds: number
    avg_trust_score: number
    case_workflow: boolean
    jwt_protected_writes: boolean
    ci_gate: boolean
  }
  moat: string[]
  investor_takeaway: string
}

export interface BoardroomStep {
  step_id: string
  title: string
  duration_ms: number
  metric: string
  narration: string
}

export interface BoardroomScript {
  title: string
  total_duration_ms: number
  steps: BoardroomStep[]
}

export interface BoardroomSession {
  session_id: string
  started_at: number
  case_id: string
  script: BoardroomScript
  crisis: DemoResult
  report_url: string
  proof_url: string
}

// ─── Generic Fetch Helper ──────────────────────────────────────

// Local mock endpoint mapping — keys are HF path prefixes, values are ?endpoint= param
const MOCK_ENDPOINTS: Record<string, string> = {
  '/api/bots': 'bots',
  '/api/status': 'status',
  '/api/alerts': 'alerts',
  '/api/merkle': 'merkle',
  '/api/trust': 'trust',
  '/api/chaos': 'chaos',
  '/api/security': 'security',
}

async function localMockFallback<T>(path: string): Promise<T | null> {
  const endpoint = Object.entries(MOCK_ENDPOINTS).find(([k]) => path.startsWith(k))?.[1]
  if (!endpoint) return null
  try {
    const res = await fetch(`/api/live?endpoint=${endpoint}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch { return null }
}

async function apiFetch<T>(path: string, options?: RequestInit, timeoutMs = 5000): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('gs_token') : null
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers ?? {}),
      },
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!res.ok) {
      return await localMockFallback<T>(path)
    }
    return (await res.json()) as T
  } catch {
    clearTimeout(timer)
    return await localMockFallback<T>(path)
  }
}

// ─── API Functions ─────────────────────────────────────────────

export async function fetchStatus(): Promise<SwarmStatus | null> {
  return apiFetch<SwarmStatus>('/api/status')
}

export async function fetchBots(): Promise<BotStatus[] | null> {
  return apiFetch<BotStatus[]>('/api/bots', undefined, 30_000)
}

export async function fetchAlerts(n: number = 20): Promise<Alert[] | null> {
  return apiFetch<Alert[]>(`/api/alerts?n=${n}`)
}

export async function fetchFull(): Promise<FullDashboard | null> {
  return apiFetch<FullDashboard>('/api/full')
}

export async function fetchInvestorBrief(): Promise<InvestorBrief | null> {
  return apiFetch<InvestorBrief>('/api/investor/brief')
}

export async function fetchBoardroomScript(): Promise<BoardroomScript | null> {
  return apiFetch<BoardroomScript>('/api/boardroom/script')
}

export async function startBoardroomMode(): Promise<BoardroomSession | null> {
  return apiFetch<BoardroomSession>('/api/boardroom/start', { method: 'POST' })
}

export async function resetBoardroomMode(): Promise<{ status: string } | null> {
  return apiFetch<{ status: string }>('/api/boardroom/reset', { method: 'POST' })
}

export async function fetchBotHistory(botType: string): Promise<BotHistoryPoint[] | null> {
  return apiFetch<BotHistoryPoint[]>(`/api/bots/${encodeURIComponent(botType)}/history`)
}

export async function fetchBotForecast(botType: string, steps: number = 30): Promise<BotForecast | null> {
  return apiFetch<BotForecast>(`/api/bots/${encodeURIComponent(botType)}/forecast?steps=${steps}`)
}

export type BotSnapshot = { history: BotHistoryPoint[]; forecast: BotForecast }
export type AllBotSnapshots = Record<string, BotSnapshot>

export async function fetchAllBotSnapshots(): Promise<AllBotSnapshots | null> {
  return apiFetch<AllBotSnapshots>('/api/bots/snapshots', undefined, 12000)
}

export async function fetchMerkle(): Promise<MerkleData | null> {
  return apiFetch<MerkleData>('/api/merkle')
}

export async function fetchTrust(): Promise<TrustData | null> {
  return apiFetch<TrustData>('/api/trust')
}

export async function fetchChaos(): Promise<ChaosData | null> {
  return apiFetch<ChaosData>('/api/chaos')
}

export async function fetchSecurity(): Promise<SecurityData | null> {
  return apiFetch<SecurityData>('/api/security')
}

export async function queryMemory(query: string): Promise<MemoryQueryResult | null> {
  return apiFetch<MemoryQueryResult>('/api/memory/query', {
    method: 'POST',
    body: JSON.stringify({ query }),
  })
}

export async function injectChaos(attackType: string): Promise<{ attack_id: string; started: boolean } | null> {
  return apiFetch<{ attack_id: string; started: boolean }>('/api/chaos/inject', {
    method: 'POST',
    body: JSON.stringify({ attack_type: attackType }),
  })
}

export async function fetchSystemMetrics(): Promise<SystemMetrics | null> {
  return apiFetch<SystemMetrics>('/api/metrics/system')
}

export async function fetchConsensusLatency(): Promise<ConsensusLatency | null> {
  return apiFetch<ConsensusLatency>('/api/metrics/consensus')
}

export interface DemoResult {
  status: string
  scenario: string
  bots_affected: number
  total_at_risk_eur_m: number
  detection_time_ms: number
  traditional_detection_hours: number
  expires_in_seconds: number
  timeline: Array<{ t: string; event: string }>
}

export async function triggerDemoAnomaly(): Promise<DemoResult | null> {
  return apiFetch<DemoResult>('/api/demo/force-anomaly', { method: 'POST' })
}

export async function resetDemo(): Promise<{ status: string } | null> {
  return apiFetch<{ status: string }>('/api/demo/reset', { method: 'POST' })
}

export async function fetchDemoStatus(): Promise<{ active: boolean; overrides: Record<string, unknown> } | null> {
  return apiFetch('/api/demo/status')
}

// ─── Cases ────────────────────────────────────────────────────

export interface ComplianceCase {
  id: string
  bot_type: string
  score: number
  summary: string
  status: 'OPEN' | 'INVESTIGATING' | 'CLOSED'
  notes: string
  created_at: number
  updated_at: number
}

export async function fetchCases(): Promise<ComplianceCase[] | null> {
  return apiFetch<ComplianceCase[]>('/api/cases')
}

export async function createCase(bot_type: string, score: number, summary: string): Promise<{ id: string } | null> {
  return apiFetch('/api/cases', {
    method: 'POST',
    body: JSON.stringify({ bot_type, score, summary }),
  })
}

export async function updateCase(id: string, status: string, notes: string): Promise<{ id: string } | null> {
  return apiFetch(`/api/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  })
}

export async function deleteCase(id: string): Promise<unknown> {
  return apiFetch(`/api/cases/${id}`, { method: 'DELETE' })
}

// ─── Consensus ────────────────────────────────────────────────────

export interface ConsensusVote {
  node_id: string
  node_type: string
  vote: boolean
  weight: number
  confidence: number
  evidence_hash: string
  latency_ms: number
  ts: number
}

export interface ConsensusRound {
  round_id: string
  transaction_id: string
  threat_type: string
  initiator_bot: string
  initiator_score: number
  votes: ConsensusVote[]
  quorum_reached: boolean
  yes_count: number
  weighted_score: number
  final_verdict: boolean
  merkle_root: string
  commit_latency_ms: number
  ts: number
}

export interface ConsensusStats {
  total_rounds: number
  quorum_rate: number
  avg_latency_ms: number
  avg_weighted_score: number
  node_weights: Record<string, number>
  quorum_threshold: number
  total_nodes: number
  total_weight: number
}

export async function fetchConsensusLatestRound(): Promise<ConsensusRound | null> {
  return apiFetch<ConsensusRound>('/api/consensus/latest')
}

export async function fetchConsensusStats(): Promise<ConsensusStats | null> {
  return apiFetch<ConsensusStats>('/api/consensus/stats')
}

export async function fetchLedger(): Promise<unknown> {
  return apiFetch('/api/ledger')
}

export async function verifyLedger(): Promise<unknown> {
  return apiFetch('/api/ledger/verify')
}

// ─── Chaos Quarantine ─────────────────────────────────────────────

export async function quarantineNode(bot_type: string): Promise<unknown> {
  return apiFetch('/api/chaos/quarantine', {
    method: 'POST',
    body: JSON.stringify({ bot_type }),
  })
}

export async function restoreNode(): Promise<unknown> {
  return apiFetch('/api/chaos/restore', { method: 'POST' })
}

export async function fetchQuarantine(): Promise<{ quarantined: string | null; active_nodes: number; total_nodes: number } | null> {
  return apiFetch('/api/chaos/quarantine')
}

// ─── Transaction Gateway ──────────────────────────────────────────

export interface GatewayVote {
  node_type:        string
  weight:           number
  flags_suspicious: boolean
  confidence:       number
  reason:           string
  latency_ms:       number
}

export interface GatewayDecision {
  tx_id:              string
  masked_tx_id:       string
  status:             'PENDING' | 'PURGATORY' | 'APPROVED' | 'HARD_BLOCK'
  weighted_suspicion: number
  yes_count:          number
  no_count:           number
  votes:              GatewayVote[]
  purgatory_ms:       number
  amount_bucket:      string
  tx_type:            string
  hard_block_reason:  string | null
  ts:                 number
}

export interface GatewayStats {
  total_evaluated:   number
  approved:          number
  hard_blocked:      number
  block_rate_pct:    number
  avg_suspicion_pct: number
  avg_purgatory_ms:  number
  purgatory_queue:   number
  masked_history_len: number
}

export async function fetchGatewayDecisions(): Promise<GatewayDecision[]> {
  return (await apiFetch<GatewayDecision[]>('/api/gateway/decisions')) ?? []
}

export async function fetchGatewayStats(): Promise<GatewayStats | null> {
  return apiFetch<GatewayStats>('/api/gateway/stats')
}

export async function triggerMockTransaction(force_suspicious = false): Promise<GatewayDecision | null> {
  return apiFetch<GatewayDecision>('/api/gateway/mock', {
    method: 'POST',
    body: JSON.stringify({ force_suspicious }),
  })
}

export async function triggerGatewayBatch(n = 5, force_suspicious = false): Promise<GatewayDecision[]> {
  return (await apiFetch<GatewayDecision[]>('/api/gateway/batch', {
    method: 'POST',
    body: JSON.stringify({ n, force_suspicious }),
  })) ?? []
}

// ─── Regulatory Parser ────────────────────────────────────────────

export interface SensitivityMap {
  adjustments:  Record<string, number>
  active_rules: number
  last_updated: number
}

export interface RegulatoryRule {
  rule_id:        string
  source:         string
  raw_excerpt:    string
  affected_bots:  string[]
  delta:          number
  keywords_found: string[]
  severity_terms: string[]
  ts:             number
}

export async function fetchRegulatorySensitivity(): Promise<SensitivityMap | null> {
  return apiFetch<SensitivityMap>('/api/regulatory/sensitivity')
}

export async function fetchRegulatoryRules(): Promise<RegulatoryRule[]> {
  return (await apiFetch<RegulatoryRule[]>('/api/regulatory/rules')) ?? []
}

export async function ingestRegulatoryText(source: string, text: string): Promise<RegulatoryRule | null> {
  return apiFetch<RegulatoryRule>('/api/regulatory/ingest', {
    method: 'POST',
    body: JSON.stringify({ source, text }),
  })
}

// ─── Sovereign Node ───────────────────────────────────────────────

export interface SovereignStats {
  node_id:           string
  hostname:          string
  sovereignty_score: number
  is_air_gapped:     boolean
  blocked_attempts:  number
  checks_ok:         number
  checks_total:      number
}

export async function fetchSovereignStats(): Promise<SovereignStats | null> {
  return apiFetch<SovereignStats>('/api/sovereign/stats')
}

export async function fetchSovereignHealth(): Promise<unknown> {
  return apiFetch('/api/sovereign/health')
}

// ─── OFAC SDN Live Screening ──────────────────────────────────────────────

export interface OFACStats {
  loaded:             boolean
  total_entries:      number
  publish_date:       string
  record_count:       number
  last_loaded:        number
  last_loaded_ago_s:  number
  refresh_interval_s: number
  screen_count:       number
  hit_count:          number
  hit_rate_pct:       number
  load_error:         string | null
  match_threshold:    number
}

export interface OFACMatch {
  entity:        string
  sdn_name:      string
  sdn_uid:       string
  sdn_type:      string
  programs:      string[]
  match_score:   number
  match_type:    'EXACT' | 'FUZZY' | 'AKA'
  screened_at:   number
  screened_date: string
}

export async function fetchSanctionsStats(): Promise<OFACStats | null> {
  return apiFetch<OFACStats>('/api/sanctions/stats')
}

export async function fetchSanctionsMatches(n = 30): Promise<OFACMatch[]> {
  return (await apiFetch<OFACMatch[]>(`/api/sanctions/matches?n=${n}`)) ?? []
}

export async function screenEntity(entity: string): Promise<{ screened: number; hits: number; matches: OFACMatch[] } | null> {
  return apiFetch('/api/sanctions/screen', {
    method: 'POST',
    body: JSON.stringify({ entity }),
  })
}

export async function screenEntities(entities: string[]): Promise<{ screened: number; hits: number; matches: OFACMatch[] } | null> {
  return apiFetch('/api/sanctions/screen', {
    method: 'POST',
    body: JSON.stringify({ entities }),
  })
}

export async function reloadSanctionsList(): Promise<OFACStats | null> {
  return apiFetch<OFACStats>('/api/sanctions/reload', { method: 'POST' })
}
