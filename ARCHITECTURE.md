# Genesis Swarm — System Architecture

**Version:** 0.1.0
**Author:** Daman Sharma
**Status:** Prototype — real data feeds live, production hardening in progress

---

## Table of Contents

1. [Overview](#overview)
2. [System Components](#system-components)
3. [Bot Roster](#bot-roster)
4. [Consensus Protocol](#consensus-protocol)
5. [Self-Healing Architecture](#self-healing-architecture)
6. [Message Bus](#message-bus)
7. [Alert Pipeline](#alert-pipeline)
8. [Audit & Compliance Layer](#audit--compliance-layer)
9. [Operator Authority Model](#operator-authority-model)
10. [Data Sources](#data-sources)
11. [Deployment Architecture](#deployment-architecture)
12. [Known Production Gaps](#known-production-gaps)

---

## Overview

Genesis Swarm is an 11-bot autonomous multi-agent system designed for real-time financial risk intelligence in Luxembourg-regulated funds. Every bot runs as an independent async process, communicates over a shared message bus, and participates in a Byzantine Fault Tolerant consensus protocol before any alert is dispatched.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GENESIS SWARM                                   │
│                                                                         │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │                     COMMANDER BOT                                │  │
│   │         Correlated threat detection · Quorum management          │  │
│   │         Self-healing orchestration · Operator interface          │  │
│   └──────────────────────────┬───────────────────────────────────────┘  │
│                              │ NATS JetStream / Mock Bus                │
│   ┌──────────────────────────┼───────────────────────────────────────┐  │
│   │                          │                                       │  │
│   │  ┌──────────┐ ┌─────────┐│┌─────────┐ ┌──────────┐ ┌─────────┐ │  │
│   │  │ Genesis  │ │  Cargo  │││  Fuel   │ │Sanctions │ │   FX    │ │  │
│   │  │   Bot    │ │   Bot   │││  Bot    │ │   Bot    │ │   Bot   │ │  │
│   │  │NAV/UCITS │ │AIS/Ships│││EIA/TTF  │ │OFAC/EU   │ │ECB Rates│ │  │
│   │  └──────────┘ └─────────┘│└─────────┘ └──────────┘ └─────────┘ │  │
│   │                          │                                       │  │
│   │  ┌──────────┐ ┌─────────┐│┌─────────┐ ┌──────────┐ ┌─────────┐ │  │
│   │  │Compliance│ │Succession│││Sovereign│ │  Yacht   │ │ Orbital │ │  │
│   │  │   Bot    │ │   Bot   │││  Bot    │ │ Guardian │ │   Bot   │ │  │
│   │  │  AIFMD   │ │UBO/KYC  │││Country  │ │  UHNW   │ │Celestrak│ │  │
│   │  └──────────┘ └─────────┘│└─────────┘ └──────────┘ └─────────┘ │  │
│   └──────────────────────────┴───────────────────────────────────────┘  │
│                                                                         │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  SHARED INFRASTRUCTURE                                           │  │
│   │  ConsensusEngine · HealthMonitor · SelfHealingOrchestrator       │  │
│   │  AlertDispatcher · AuditLogger · MessageBus                      │  │
│   └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## System Components

### Shared Infrastructure

| Component | File | Purpose |
|-----------|------|---------|
| `MessageBus` | `shared/message_bus.py` | Async pub/sub — Mock (dev) or NATS JetStream (prod) |
| `ConsensusEngine` | `shared/consensus.py` | BFT consensus — 7/11 quorum, Byzantine detection |
| `HealthMonitor` | `shared/self_healing.py` | Heartbeat tracking with configurable timeout |
| `SelfHealingOrchestrator` | `shared/self_healing.py` | 3-tier healing — AUTO / NOTIFY / ESCALATE |
| `AlertDispatcher` | `shared/alerting.py` | Multi-channel alert delivery — log/stdout/webhook/hook |
| `AuditLogger` | `shared/audit_logger.py` | SHA-3 tamper-evident append-only audit log |
| `SwarmBot` (ABC) | `shared/bot_base.py` | Base class — lifecycle, heartbeat, anomaly, healing |
| `SwarmConfig` | `shared/config.py` | Pydantic Settings v2 — `SWARM_` env prefix |

---

## Bot Roster

| # | Bot ID | Type | Data Source | Detection Target | Cycle |
|---|--------|------|------------|-----------------|-------|
| 1 | genesis-001 | NAV_DETECTOR | Yahoo Finance (IWDA.AS) | NAV manipulation, flash crashes | 60s |
| 2 | cargo-001 | CARGO_BOT | AISHub API / mock | Dark ships, sanctioned flags, AIS gaps | 3s |
| 3 | fuel-001 | FUEL_BOT | EIA API / mock | Energy price manipulation >5% | 4s |
| 4 | sanctions-001 | SANCTIONS_BOT | OFAC SDN + EU list | Fuzzy-match counterparty screening | 2s |
| 5 | fx-001 | FX_BOT | **ECB Live API** | FX manipulation, RUB/CNY risk | 30s |
| 6 | compliance-001 | COMPLIANCE_BOT | Fund metrics / mock | AIFMD leverage, liquidity, reporting | 5s |
| 7 | succession-001 | SUCCESSION_BOT | Ownership filings / mock | Hidden UBOs, PEPs, offshore chains | 6s |
| 8 | sovereign-001 | SOVEREIGN_BOT | Country risk DB | Geopolitical weighted exposure | 7s |
| 9 | yacht-001 | YACHT_GUARDIAN | Asset registry / mock | UHNW asset moves to sanctioned locations | 8s |
| 10 | orbital-001 | ORBITAL_BOT | Celestrak TLE / mock | Unknown satellites, imaging clusters | 10s |
| 11 | commander-001 | COMMANDER_BOT | All 10 bots | Correlated threats, swarm management | continuous |

**Live data today:** FX Bot (ECB), Genesis Bot (Yahoo Finance)
**Pending real API connections:** Cargo (AISHub), Fuel (EIA), Orbital (Celestrak)

---

## Consensus Protocol

Based on a modified Practical Byzantine Fault Tolerance (PBFT) protocol.

### Parameters
- **Total bots:** 11
- **Quorum:** 7 (configurable)
- **Fault tolerance:** floor((11-1)/3) = **3 Byzantine nodes tolerated**
- **Timeout:** 3.0 seconds (configurable)

### Flow

```
1. Bot detects anomaly (score ≥ threshold)
2. Bot opens consensus round → unique round_id generated
3. Bot publishes anomaly to message bus (topic: anomaly.<bot_type>)
4. Bot casts own vote: CORROBORATE (confidence = score/100)
5. Peer bots receive anomaly, cast votes: CORROBORATE | CONTRADICT | NEUTRAL | ABSTAIN
6. ConsensusEngine tallies weighted votes (by confidence score)
7. If corroborate_weight > contradict_weight AND corroborate_count ≥ 2 → CONFIRMED
8. CONFIRMED → AlertDispatcher.dispatch() → alert fires
```

### Byzantine Detection

If a bot votes CORROBORATE on a round, then votes CONTRADICT on the same round — it is flagged as Byzantine, its votes are rejected, and the Commander Bot is notified.

```python
# consensus.py — Byzantine flag logic
if prev_vote.vote != new_vote.vote:
    self._byzantine.add(vote.bot_id)
    return None  # vote rejected
```

---

## Self-Healing Architecture

Every bot contains a `SelfHealingOrchestrator` instance. When a failure is detected, it:
1. Looks up the failure in `HEALING_MATRIX`
2. Determines the tier (AUTO / NOTIFY / ESCALATE)
3. Executes the registered handler
4. Publishes the healing event to the bus with plain-English explanation
5. Commander Bot receives, logs, and updates the dashboard

### Healing Matrix

| Failure Type | Action | Tier | Human Needed |
|-------------|--------|------|-------------|
| `heartbeat_timeout` | Restart bot | AUTO | No |
| `feed_quality_degraded` | Switch backup feed | AUTO | No |
| `bus_disconnect` | Reconnect bus | AUTO | No |
| `model_drift_detected` | Queue retrain | NOTIFY | No |
| `signature_invalid` | Quarantine bot | NOTIFY | No |
| `consensus_failure` | Adjust quorum | NOTIFY | No |
| `byzantine_detected` | Escalate | ESCALATE | **Yes** |
| `data_breach_attempt` | Escalate | ESCALATE | **Yes** |
| `sanctions_hit_unverified` | Escalate | ESCALATE | **Yes** |

### Healing Event Bus Message

Every healing action publishes to `healing.<bot_id>`:

```json
{
  "bot_id": "cargo-001",
  "bot_type": "CARGO_BOT",
  "action": "switch_to_backup_feed",
  "reason": "feed_quality_degraded",
  "tier": 1,
  "auto_resolved": true,
  "explanation": "[cargo-001] Data feed returned bad or missing values — switched to backup source.",
  "context": {"error": "ConnectionTimeout"},
  "ts": 1746274800.0
}
```

---

## Message Bus

### Topics

| Topic Pattern | Publisher | Subscribers |
|--------------|-----------|-------------|
| `heartbeat.<bot_id>` | Every bot (every 5s) | Commander Bot |
| `anomaly.<bot_type>` | Any bot on anomaly | Commander Bot, peer bots |
| `consensus.<round_id>` | ConsensusEngine | Commander Bot |
| `healing.<bot_id>` | Any bot on self-heal | Commander Bot |

### Implementations

```python
# Development — zero external dependencies
bus = MockMessageBus()

# Production — NATS JetStream
bus = NATSMessageBus(url="nats://localhost:4222")

# Factory (reads SWARM_USE_MOCK_BUS env var)
bus = create_message_bus(use_mock=cfg.use_mock_bus, nats_url=cfg.nats_url)
```

---

## Alert Pipeline

```
DetectionResult (score ≥ threshold)
    → ConsensusEngine.open_round()
    → Peers vote
    → ConsensusResult.consensus == "CONFIRMED"
    → SwarmAlert created
    → AlertDispatcher.dispatch()
        → channel: "log"     → logging.CRITICAL
        → channel: "stdout"  → Rich terminal block
        → channel: "webhook" → HTTP POST (httpx)
        → hooks              → custom async callables
    → alert appended to _sent list
    → Commander Bot alert_history updated
```

### Severity Escalation

| Score | Severity |
|-------|---------|
| < 75 | WARNING |
| 75–89 | CRITICAL |
| ≥ 90 | EMERGENCY (auto-escalated by dispatcher) |

### Correlated Threat Detection (Commander Bot)

If **3 or more bots** report score ≥ 75 within a **30-second window**, the Commander Bot fires a `SWARM-WIDE EMERGENCY` alert. Cooldown: **60 seconds** between correlated alerts to prevent spam.

---

## Audit & Compliance Layer

### AuditRecord

Every cycle completion, anomaly, alert, healing event, and operator action is written to the audit log.

```python
@dataclass
class AuditRecord:
    bot_id: str
    bot_type: str
    event_type: str
    payload: dict
    timestamp: float
    record_hash: str   # SHA-3-256 of all fields — tamper-evident
```

### Storage

- **Primary:** Apache Parquet (pyarrow) — columnar, compressed, queryable
- **Fallback:** JSONL — if pyarrow not installed

### Retention

7-year retention by design — AIFMD Article 22 compliant.

---

## Operator Authority Model

Supreme control rests with the operator (owner). All operator commands require `SWARM_OPERATOR_KEY` environment variable.

```python
commander.operator_shutdown(key)                           # Stop all bots
commander.operator_quarantine("cargo-001", key)            # Isolate a bot
commander.operator_override_threshold("fx-001", 85.0, key) # Change sensitivity
commander.operator_status_report(key)                      # Full intelligence report
```

Key verification uses constant-time SHA-256 comparison. Unauthorized attempts are logged as `CRITICAL` and permanently audited.

**The key never touches GitHub** — stored in `.env` (gitignored).

---

## Data Sources

| Bot | Current Source | Production Source | API Key Required |
|-----|---------------|------------------|-----------------|
| Genesis Bot | **Yahoo Finance (live)** | Fund administrator NAV feed | No (Yahoo free) |
| FX Bot | **ECB Live API (live)** | ECB + Bloomberg FX | No (ECB free) |
| Cargo Bot | Mock AIS | AISHub API | Yes — `SWARM_AISHUB_API_KEY` |
| Fuel Bot | Mock prices | EIA Open Data API | Yes — `SWARM_EIA_API_KEY` |
| Sanctions Bot | Mock SDN | OFAC SDN XML + OpenSanctions | No (public) |
| Compliance Bot | Mock fund metrics | Fund admin API (Advent Geneva, SimCorp) | Yes |
| Succession Bot | Mock ownership | Companies House / RCS Luxembourg | Yes |
| Sovereign Bot | Mock risk DB | Oxford Analytica / PRS Group | Yes |
| Yacht Guardian | Mock asset registry | MarineTraffic + JetNet | Yes |
| Orbital Bot | Mock TLE | Celestrak public TLE feed | No (public) |

---

## Deployment Architecture

### Local Development

```bash
pip install -e ".[dev]"
genesis-swarm demo    # 60-second dashboard
genesis-swarm run     # runs until Ctrl+C
```

### Docker (Production)

```bash
docker-compose up
```

Starts:
- 11 bot containers
- NATS JetStream server
- Prometheus metrics scraper
- Grafana dashboard (localhost:3000)

### Environment Variables

```bash
SWARM_OPERATOR_KEY=your-secret          # Required for operator commands
SWARM_USE_MOCK_BUS=false                # Switch to NATS
SWARM_NATS_URL=nats://localhost:4222    # NATS server
SWARM_EIA_API_KEY=your-key             # Fuel Bot
SWARM_AISHUB_API_KEY=your-key          # Cargo Bot
SWARM_TOTAL_BOTS=11                    # Consensus parameter
SWARM_QUORUM=7                         # Min votes for CONFIRMED
SWARM_CONSENSUS_TIMEOUT_SECONDS=3.0   # Round timeout
SWARM_ANOMALY_THRESHOLD=75.0           # Score threshold (0-100)
```

---

## Known Production Gaps

These are documented gaps between the current prototype and a production-ready system. Each has a clear fix path.

| # | Gap | Current State | Fix |
|---|-----|--------------|-----|
| 1 | Message signing | SHA-256 fingerprint | Replace with Ed25519 (`cryptography` lib) |
| 2 | API authentication | None on REST endpoints | Add JWT bearer tokens |
| 3 | Model persistence | Retrained on every start | Save/load with joblib |
| 4 | Prometheus metrics | Declared not instrumented | Add `prometheus_client` counters |
| 5 | Real AIS data | Mock | Wire AISHub API key |
| 6 | Real EIA data | Mock | Wire EIA Open Data API |
| 7 | LSTM detector | Disabled | Enable with `SWARM_USE_LSTM=true` |
| 8 | Alert retry | No retry on webhook fail | Add exponential backoff |

All gaps are non-blocking for demo and pilot use. Priority order for production: 1 → 2 → 3 → 5 → 6.

---

*Built by Daman Sharma — RegTech founder in progress.*
*Contact: daman.sharma.2310@gmail.com*
