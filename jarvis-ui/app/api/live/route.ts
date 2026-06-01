import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Deterministic noise seeded by time bucket + bot index — changes every ~8s
function noise(seed: number, bucket: number): number {
  const x = Math.sin(seed * 127.1 + bucket * 311.7) * 43758.5453
  return x - Math.floor(x)
}

const BOT_TYPES = [
  'NAV_DETECTOR','CARGO_BOT','FUEL_BOT','SANCTIONS_BOT','FX_BOT',
  'COMPLIANCE_BOT','SUCCESSION_BOT','SOVEREIGN_BOT','YACHT_GUARDIAN',
  'ORBITAL_BOT','SHADOW_BOT',
]

const PERSONALITIES: Record<string, string> = {
  NAV_DETECTOR: 'Alpha Sentinel', CARGO_BOT: 'Logistics Oracle',
  FUEL_BOT: 'Energy Hawk', SANCTIONS_BOT: 'OFAC Watchdog',
  FX_BOT: 'Currency Predator', COMPLIANCE_BOT: 'Lex Guardian',
  SUCCESSION_BOT: 'Dynasty Keeper', SOVEREIGN_BOT: 'State Actor Monitor',
  YACHT_GUARDIAN: 'Asset Tracer', ORBITAL_BOT: 'Satellite Watcher',
  SHADOW_BOT: 'Ghost Operative',
}

const SUMMARIES: Record<string, string[]> = {
  NAV_DETECTOR: ['NAV within ±0.3% tolerance — no deviation detected','Monitoring 14 UCITS fund series','Intraday NAV deviation at 0.12% — within CSSF threshold'],
  CARGO_BOT: ['Cargo manifest cross-check complete — 0 anomalies','DORA supply chain tracing nominal','Trade route intelligence feed updated'],
  FUEL_BOT: ['Energy sector exposure within SFDR Art.8 limits','Fossil fuel holdings at 3.2% — Art.9 flag cleared','Commodity hedge ratio at 94% efficiency'],
  SANCTIONS_BOT: ['OFAC SDN list screened — 0 matches','EU Consolidated list: clean pass','UN Security Council resolutions: no exposure'],
  FX_BOT: ['EUR/USD deviation within VaR limit','FX forward book hedged at 97.4%','G10 currency exposure: nominal'],
  COMPLIANCE_BOT: ['AIFMD II Art.24 leverage within threshold','CSSF Circular 22/795 liquidity test: PASS','DORA ICT vendor register: 98% complete'],
  SUCCESSION_BOT: ['Succession plan documentation: current','Board mandate continuity: confirmed','Key person risk: mitigated'],
  SOVEREIGN_BOT: ['Sovereign debt exposure: 12.4% of AUM','ESG sovereign scoring: AA+ average','Political risk index: LOW'],
  YACHT_GUARDIAN: ['Asset register updated — 0 beneficial owner gaps','UBO chain verified to 4th level','Luxembourg PSF nominee check: PASS'],
  ORBITAL_BOT: ['Satellite AIS data cross-referenced — 0 discrepancies','Dark vessel activity: NONE detected','Port call verification: nominal'],
  SHADOW_BOT: ['Adversarial simulation: 0 vulnerabilities exploited','Pre-crime index: 34/100 — LOW risk','Red team attack surface: minimal'],
}

function generateBots(bucket: number) {
  return BOT_TYPES.map((bt, i) => {
    const base = 18 + noise(i * 3, 0) * 55
    const drift = (noise(i, bucket) - 0.5) * 12
    const score = Math.max(5, Math.min(98, base + drift))
    const isAnomaly = score > 72
    const summaries = SUMMARIES[bt] ?? ['Monitoring nominal']
    return {
      bot_id: `bot-${bt.toLowerCase().replace(/_/g, '-')}`,
      bot_type: bt,
      personality_label: PERSONALITIES[bt] ?? bt,
      last_score: Math.round(score * 10) / 10,
      is_anomaly: isAnomaly,
      healthy: true,
      last_summary: summaries[bucket % summaries.length],
      threshold: 70,
      uptime_s: 86400 + Math.floor(noise(i * 7, 0) * 172800),
      last_seen: new Date().toISOString(),
    }
  })
}

function generateStatus(bots: ReturnType<typeof generateBots>, bucket: number) {
  const anomalies = bots.filter(b => b.is_anomaly)
  const topBot = anomalies.sort((a, b) => b.last_score - a.last_score)[0]
  const fearIdx = Math.round(20 + noise(bucket, 99) * 55)
  return {
    status: 'running',
    uptime_seconds: 604800 + bucket * 8,
    total_bots: bots.length,
    healthy_bots: bots.length,
    active_alerts: anomalies.length,
    top_threat: topBot?.bot_type ?? null,
    top_score: topBot ? Math.round(topBot.last_score) : 0,
    consensus_rounds: 48200 + bucket * 3,
    healing_events: 14,
    mode: 'LIVE',
    fear_index: fearIdx,
    safe_haven: fearIdx < 40,
    aum_protected: 14780000000 + Math.round((noise(bucket, 77) - 0.5) * 200000000),
  }
}

function generateAlerts(bots: ReturnType<typeof generateBots>, bucket: number) {
  const anomalous = bots.filter(b => b.is_anomaly)
  return anomalous.map((b, i) => ({
    alert_id: `alert-${b.bot_type}-${bucket}-${i}`,
    bot_id: b.bot_id,
    bot_type: b.bot_type,
    score: b.last_score,
    threshold: b.threshold,
    severity: b.last_score > 85 ? 'HIGH' : b.last_score > 75 ? 'MEDIUM' : 'LOW',
    message: `${b.bot_type} anomaly score ${b.last_score.toFixed(1)} exceeds threshold ${b.threshold}`,
    ts: Date.now() - i * 45000,
    acknowledged: false,
  }))
}

function generateMerkle(bucket: number) {
  const hash = (s: string) => Array.from(s).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0).toString(16).replace('-', 'f')
  const leaves = BOT_TYPES.slice(0, 8).map((bt, i) => ({
    hash: `0x${hash(bt + bucket + i).padStart(8, '0')}a4f2c${hash(bt + i).padStart(8,'0')}`,
    ts: Date.now() - i * 8000,
    event_type: ['COMPLIANCE_CHECK','ANOMALY_DETECTED','CONSENSUS_VOTE','SANCTIONS_SCREEN'][i % 4],
    bot_id: `bot-${bt.toLowerCase().replace(/_/g,'-')}`,
    data_hash: `0x${hash(bt + 'data' + bucket).padStart(16,'0')}`,
  }))
  return {
    root: `0x${hash('root' + bucket).padStart(16,'0')}`,
    depth: 4,
    leaves,
    leaf_count: leaves.length,
    last_updated: new Date().toISOString(),
  }
}

function generateTrust(bucket: number) {
  const scores: Record<string, unknown> = {}
  BOT_TYPES.forEach((bt, i) => {
    const trust = 72 + noise(i * 13, bucket) * 25
    scores[`bot-${bt.toLowerCase().replace(/_/g,'-')}`] = {
      bot_id: `bot-${bt.toLowerCase().replace(/_/g,'-')}`,
      trust_score: Math.round(trust * 10) / 10,
      votes_cast: 480 + Math.floor(noise(i, bucket) * 120),
      votes_received: 470 + Math.floor(noise(i + 1, bucket) * 110),
      byzantine_flag: false,
    }
  })
  return {
    scores,
    quorum_health: {
      healthy: true,
      quorum_count: 9,
      total_bots: 11,
      threshold: 7,
      degraded_nodes: [],
    },
    last_consensus_ts: Date.now() - 4000,
  }
}

function generateChaos() {
  return {
    active_attacks: [],
    resilience_score: 94 + Math.floor(noise(Date.now(), 55) * 5),
    total_attacks_repelled: 1247,
    last_attack_ts: Date.now() - 3600000,
  }
}

function generateSecurity(bucket: number) {
  return {
    threat_level: 'LOW',
    active_threats: 0,
    blocked_ips: 14 + Math.floor(noise(bucket, 11) * 6),
    last_scan: new Date().toISOString(),
    vulnerability_count: 0,
  }
}

export async function GET(req: NextRequest) {
  const endpoint = new URL(req.url).searchParams.get('endpoint') ?? 'status'
  const bucket = Math.floor(Date.now() / 8000) // changes every 8s

  const bots = generateBots(bucket)

  let data: unknown
  switch (endpoint) {
    case 'bots':    data = bots; break
    case 'status':  data = generateStatus(bots, bucket); break
    case 'alerts':  data = generateAlerts(bots, bucket); break
    case 'merkle':  data = generateMerkle(bucket); break
    case 'trust':   data = generateTrust(bucket); break
    case 'chaos':   data = generateChaos(); break
    case 'security': data = generateSecurity(bucket); break
    default:        data = { error: 'unknown endpoint' }
  }

  return Response.json(data, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
