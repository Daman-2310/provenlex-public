# Changelog

All notable changes to Genesis Swarm are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- OpenTelemetry distributed tracing on PBFT rounds and bot cycles
- Alembic database migration framework for schema evolution
- i18n scaffolding (en/fr) for Luxembourg fund administration market
- A/B shadow model deployment for OnlineLearner

---

## [0.4.2] — 2026-05-09

### Added
- **Investor pitch deck** — 10-slide HTML deck at `GET /pitch`; Bloomberg dark aesthetic; covers problem, solution, Wirecard proof, market, business model, traction, team, and €150k ask ([`pitch_deck.py`](src/genesis_swarm/api/pitch_deck.py))
- **Investor one-pager PDF** — single-page A4 brief downloadable at `GET /api/v1/investor/one-pager.pdf`; generated via reportlab with stats grid, two-column body, and market + business model tables ([`investor_onepager.py`](src/genesis_swarm/api/investor_onepager.py))
- **Cold outreach templates** — 5 templates (institutional VC, angel, LinkedIn DM, accelerator, follow-up) in [`INVESTOR_OUTREACH.md`](INVESTOR_OUTREACH.md)
- **Target investor list** — 15 European RegTech/fintech VCs + 5 angel profiles + ecosystem entry points (ALFI, LHoFT, Luxinnovation, Money 20/20) in [`INVESTORS.md`](INVESTORS.md)

---

## [0.4.0] — 2026-05-08

### Added
- **Distributed BFT architecture** — full PBFT protocol (PRE-PREPARE → PREPARE → COMMIT → REPLY) with Ed25519 per-message signing and view-change on primary timeout; N=11, f=3, quorum=7 ([`pbft_consensus.py`](src/genesis_swarm/consensus/pbft_consensus.py))
- **Claude AI streaming** — `stream_jarvis_response` streams JARVIS answers token-by-token via SSE over `POST /api/ai/chat`; live swarm telemetry injected as context ([`claude_engine.py`](src/genesis_swarm/ai/claude_engine.py))
- **WebSocket live dashboard** — `/ws/live` pushes full dashboard snapshot every 2 s; frontend reconnects with exponential backoff
- **RBAC authentication** — three-tier role hierarchy (viewer / operator / admin); roles encoded in HS256 JWT; `_require_role()` dependency factory; `GENESIS_USERS` env-var for production credentials
- **Refresh tokens** — `/api/auth/refresh` returns a new access token without re-login; refresh tokens use a separate secret and 7-day TTL
- **Account lockout** — in-memory failed-login counter; account locked for 15 min after 5 consecutive failures; `X-Lock-Remaining-Seconds` header on 423 responses
- **Rate-limit response headers** — `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` on every response via middleware
- **API versioning** — all routes available under `/api/v1/` prefix; unversioned `/api/` routes kept for backward compatibility
- **Hot-reload config** — `POST /api/v1/config/reload` reloads env vars + user DB without restart (admin-only)
- **Prometheus metrics endpoint** — `GET /metrics` exposes consensus latency, bot health, alert counts in Prometheus text format; SLO summary at `GET /api/health/slo`
- **Alert deduplication / correlation** — 60-second dedup window per (entity × bot_type), time-decay severity rollup, cross-bot entity correlation ([`alert_correlation.py`](src/genesis_swarm/shared/alert_correlation.py))
- **PDF compliance reports** — `GET /api/v1/report/pdf` generates a signed, timestamped PDF with Merkle root, alert timeline, and bot status snapshot using reportlab
- **Alert feedback → online learner** — `POST /api/v1/alerts/{round_id}/feedback` propagates operator true-positive/false-positive labels back to each bot's IsolationForest; precision metrics tracked per bot
- **Structured JSON logging** — all modules emit JSON log lines via `structlog`; compatible with Datadog, Grafana Loki, ELK ([`logging_config.py`](src/genesis_swarm/shared/logging_config.py))
- **Hypothesis fuzz tests** — property-based tests in `tests/property/` prove PBFT safety invariants under random message orderings, Byzantine forgery, and duplicate payloads
- **Chaos / fault-injection tests** — `tests/chaos/` kills replicas mid-round, starves primaries, and clock-skews nodes; CI verifies correct consensus under every failure mode
- **PBFT latency benchmark** — `tests/benchmarks/` measures 1,000-round P50/P95/P99 commit latency; results written to `benchmark_results.json`
- **CSSF / DORA control mapping** — `CSSF_MAPPING.md` maps every Genesis Swarm control to CSSF Circular 18/698 and DORA Chapter III paragraphs with evidence artifacts
- **SECURITY.md** — responsible disclosure policy, PGP contact, CVE process, dependency audit pipeline
- **OpenTelemetry tracing** — OTel spans around PBFT rounds, bot cycles, and alert dispatch; OTLP exporter configurable via `OTEL_EXPORTER_OTLP_ENDPOINT`
- **Circuit breaker** — `CircuitBreaker` wraps all external API calls (OFAC, ECB, AISStream, Celestrak); CLOSED → OPEN → HALF-OPEN state machine with configurable thresholds
- **Supervisor / self-healing** — `BotSupervisor` restarts crashed bots with exponential backoff (1 s → 60 s cap); zombie task detection every 10 s
- **OnlineLearner mixin** — windowed IsolationForest (500-sample window, 5-min background retrain); contamination self-calibrates from operator feedback

### Changed
- **Consensus replaced** — simple weighted-threshold voting (`swarm_consensus.py`) superseded by PBFT; `SwarmConsensus` is now an alias for `PBFTConsensus` for backward compat
- **Auth replaced** — single hardcoded admin password replaced with full RBAC JWT; `GENESIS_USERS` env-var controls prod credentials
- **docker-compose** — removed NATS and ChromaDB services (OOM on free tier); added optional `monitoring` profile for Prometheus + Grafana
- **Version bumped** — `server.py` `FastAPI(version="0.4.0")`

### Removed
- False regulatory compliance claims (DORA/AIFMD/GDPR certifications) removed from README and marketing copy

### Fixed
- CI now injects `ANTHROPIC_API_KEY=ci-placeholder-not-real` so imports don't fail in test environments
- `pip-audit` security scan added to CI with known-safe ignore list

---

## [0.3.0] — 2026-04-15

### Added
- Shadow Bot adversarial hardening (RL-based attack library, patch engine)
- Merkle-chained SQLite audit ledger (`sovereign_ledger.py`)
- AISStream.io live AIS vessel tracking in CargoBot
- OFAC SDN daily live ingestion (15,000+ entries)
- ECB Statistical Data Warehouse live FX rates
- Celestrak TLE satellite catalog integration
- OpenCorporates UBO chain verification

### Changed
- Docker multi-stage build; `Dockerfile.api` replaces monolithic build

---

## [0.2.0] — 2026-03-01

### Added
- Multi-bot swarm architecture (11 specialist bots)
- Commander orchestration layer
- Weighted threshold consensus (pre-PBFT)
- FastAPI REST + React/Next.js terminal UI
- Slack + email alerting

---

## [0.1.0] — 2026-01-20

### Added
- Initial proof-of-concept: single NAV Detector bot
- SQLite case tracking
- Basic JWT authentication

---

[Unreleased]: https://github.com/Daman-2310/genesis-swarm/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Daman-2310/genesis-swarm/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Daman-2310/genesis-swarm/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Daman-2310/genesis-swarm/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Daman-2310/genesis-swarm/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Daman-2310/genesis-swarm/releases/tag/v0.1.0
