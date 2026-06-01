# CSSF Circular 18/698 & DORA Chapter III — Genesis Swarm Control Mapping

> **Important**: This document maps Genesis Swarm's technical controls to regulatory
> requirements. It is an engineering artifact intended to accelerate formal audit work.
> It does not constitute legal advice or a certified compliance assessment.
> Engage a qualified CSSF-regulated compliance officer for regulatory submissions.

---

## 1. CSSF Circular 18/698 — ICT Risk Management for Investment Firms

Reference: [CSSF Circular 18/698](https://www.cssf.lu/en/Document/circular-cssf-18-698/) — Requirements on the organisation and governance of the ICT function.

### Chapter 2 — ICT Risk Governance

| CSSF Requirement | Paragraph | Genesis Swarm Control | Implementation File | Status |
|---|---|---|---|---|
| ICT risk appetite defined | 2.1.2 | Anomaly score thresholds (0–100) per bot type; configurable via env | `shared/config.py` | ✅ Implemented |
| ICT risk register maintained | 2.1.3 | Merkle-chained audit ledger with every detection event | `consensus/sovereign_ledger.py` | ✅ Implemented |
| Senior management responsibility | 2.1.4 | Admin role RBAC; operator approval gate for case creation | `api/server.py` — `_require_admin` | ✅ Implemented |
| Third-party ICT risk | 2.1.8 | Circuit breaker wraps all external data providers | `shared/circuit_breaker.py` | ✅ Implemented |

### Chapter 3 — ICT Asset Management

| CSSF Requirement | Paragraph | Genesis Swarm Control | Implementation File | Status |
|---|---|---|---|---|
| Critical asset inventory | 3.1 | 11 specialist bots; each registers BOT_TYPE + data source | `shared/bot_base.py` | ✅ Implemented |
| Dependency tracking | 3.2 | `requirements.txt` + `pip-audit` in CI | `requirements.txt`, `.github/workflows/ci.yml` | ✅ Implemented |
| Configuration management | 3.3 | All config via env vars; hot-reload without restart | `api/server.py` — `/api/v1/config/reload` | ✅ Implemented |

### Chapter 4 — ICT Incident Management

| CSSF Requirement | Paragraph | Genesis Swarm Control | Implementation File | Status |
|---|---|---|---|---|
| Incident classification | 4.1 | Four severity levels: INFO / WARNING / CRITICAL / EMERGENCY | `shared/alerting.py` | ✅ Implemented |
| Incident detection | 4.2 | Online IsolationForest + z-score fallback, 5-min retrain window | `shared/online_learner.py` | ✅ Implemented |
| Incident notification | 4.3 | Email + Slack dispatch; configurable webhook | `shared/alerting.py` | ✅ Implemented |
| Incident case management | 4.4 | SQLite case tracker with status lifecycle (OPEN → CLOSED) | `api/server.py` — `/api/cases` | ✅ Implemented |
| Major incident reporting to CSSF | 4.5 | PDF report generation with Merkle root + alert timeline | `api/reports.py`, `/api/v1/report/pdf` | ✅ Implemented |

### Chapter 5 — Business Continuity

| CSSF Requirement | Paragraph | Genesis Swarm Control | Implementation File | Status |
|---|---|---|---|---|
| RTO/RPO for critical systems | 5.1 | BotSupervisor restarts failed bots <60s; SLO endpoint tracks uptime | `shared/supervisor.py`, `/api/health/slo` | ✅ Implemented |
| Backup and recovery | 5.2 | SQLite DB mounted on persistent Docker volume; periodic Merkle snapshot | `docker-compose.yml` — `cases-data` volume | ⚠️ Partial — offsite backup not automated |
| Incident simulation (DR tests) | 5.4 | Chaos test suite: kill replica, starve primary, clock skew | `tests/chaos/test_pbft_fault_injection.py` | ✅ Implemented |

### Chapter 6 — Audit Logging

| CSSF Requirement | Paragraph | Genesis Swarm Control | Implementation File | Status |
|---|---|---|---|---|
| Tamper-evident audit logs | 6.1 | SHA-256 Merkle chain; any modification invalidates chain | `shared/security/merkle_tree.py`, `consensus/sovereign_ledger.py` | ✅ Implemented |
| Log completeness | 6.2 | Every bot cycle, consensus round, alert, and API call logged | `shared/logging_config.py` (structlog JSON) | ✅ Implemented |
| Log retention | 6.3 | SQLite persists until manual deletion; 30-day Prometheus retention | `docker-compose.yml` — `prometheus-data` volume | ⚠️ Partial — no automated archival |
| Log integrity anchoring | 6.4 | Merkle root computed; external blockchain anchoring not yet implemented | Roadmap v0.5 | ❌ TODO |

---

## 2. DORA — Digital Operational Resilience Act (EU) 2022/2554

Reference: [DORA Chapter III — ICT-related Incident Management, Classification and Reporting](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2554)

> **Self-assessment scope**: This section covers DORA Chapter III (Articles 17–21) at paragraph level.
> Gaps are marked ❌ or ⚠️ and are real gaps — not polished-over.
> Articles outside Chapter III (risk management framework Art. 5–16, testing Art. 24–27,
> third-party risk Art. 28–44) are noted in the gap summary but not yet fully mapped.

---

### Article 17 — ICT-related Incident Management Process

Article 17 requires financial entities to establish and maintain a documented ICT incident
management process covering detection, classification, notification, and response.

| DORA Paragraph | Requirement Text (paraphrased) | Genesis Swarm Control | Evidence | Status |
|---|---|---|---|---|
| Art. 17(1) | Establish and maintain a sound ICT incident management process | Case lifecycle API: `POST /api/cases` creates incident; status transitions OPEN → INVESTIGATING → RESOLVED → CLOSED | `api/server.py` — `/api/cases` endpoints | ✅ |
| Art. 17(2)(a) | Early warning indicators and alerts | Anomaly scores broadcast via WebSocket in real-time; threshold breach → auto-case creation | `api/server.py` — WebSocket `/ws` | ✅ |
| Art. 17(2)(b) | Procedures for identification, tracking, logging, and classification | Structlog JSON logs every bot cycle; IsolationForest scores every tick; classification by severity | `shared/logging_config.py`, `shared/alerting.py` | ✅ |
| Art. 17(2)(c) | Assignment of roles and responsibilities | RBAC with viewer/operator/admin; operator must approve case escalation | `api/server.py` — `_require_operator`, `_require_admin` | ✅ |
| Art. 17(2)(d) | Communication to clients and public authorities | Email + Slack dispatch for EMERGENCY severity; PDF report exportable | `shared/alerting.py`, `api/reports.py` | ✅ |
| Art. 17(3) | Record all ICT incidents and significant cyber threats | Every alert Merkle-chained with Ed25519 signature; case DB timestamps every status change | `consensus/sovereign_ledger.py` | ✅ |
| Art. 17(4) | Root cause analysis after major ICT incidents | SHAP TreeExplainer identifies top features driving each anomaly; bot PERSONALITY fields provide qualitative context | `shared/explainability.py` — `GET /api/v1/explain/{bot_type}` | ⚠️ SHAP covers detection causes; post-incident RCA workflow (human analyst step) not yet formalised |
| Art. 17(5) | Define ICT incident roles within change management | Config reload endpoint (`/api/v1/config/reload`) requires admin; deployment changes tracked via git | `api/server.py` — `_require_admin` | ⚠️ No formal change management workflow beyond RBAC gate |
| Art. 17(6) | Report to senior management at least monthly | Monthly SLO summary available at `/api/health/slo`; PDF report exportable on demand | `api/server.py` — `GET /api/health/slo` | ⚠️ Automated monthly report not scheduled; ad-hoc only |
| Art. 17(7) | Designated ICT security function responsible for incident management | Admin role owns incident escalation; no dedicated CISO function in prototype | RBAC admin role | ⚠️ No formal CISO/designated officer — prototype only |

**Article 17 gap assessment**: Core detection and recording are solid. Gaps are in process formalisation (post-incident RCA workflow, monthly reporting cadence, designated officer). These are organisational gaps that Genesis Swarm provides tooling for but cannot close on its own.

---

### Article 18 — Classification of ICT-related Incidents and Significant Cyber Threats

Article 18 sets mandatory classification criteria financial entities must apply to determine whether an ICT incident qualifies as "major" requiring regulatory notification.

| DORA Paragraph | Requirement Text (paraphrased) | Genesis Swarm Control | Evidence | Status |
|---|---|---|---|---|
| Art. 18(1) | Classify ICT incidents applying all listed criteria | Alert classification engine evaluates all Art. 18(1)(a-f) criteria at case creation time | `shared/alerting.py` — `classify_severity()` | ✅ |
| Art. 18(1)(a) | Number of clients/financial counterparts affected | Fund name and AUM stored per alert; multi-fund escalation tracked | `shared/alerting.py` — `fund_name`, `aum_exposure` fields | ✅ |
| Art. 18(1)(b) | Duration and geographic spread of the ICT incident | Alert timestamp stored; entity jurisdictions tracked by SANCTIONS_BOT and SOVEREIGN_BOT | `bots/sanctions_bot.py`, `bots/sovereign_bot.py` | ✅ |
| Art. 18(1)(c) | Data losses with regard to availability, authenticity, integrity, or confidentiality | PII masking in all logs; SHADOW_BOT monitors for data exfiltration patterns; integrity verified via Merkle chain | `bots/shadow_bot.py`, `shared/security/merkle_tree.py` | ✅ |
| Art. 18(1)(d) | Economic impact, in particular direct and indirect losses | AUM exposure field per alert; fund economic impact tracked | `shared/alerting.py` — `aum_exposure` | ⚠️ Estimated AUM impact, not real-time fund valuation |
| Art. 18(1)(e) | Reputational impact on the financial entity | Risk score escalation to EMERGENCY triggers reputational risk flag | `shared/alerting.py` — severity EMERGENCY | ⚠️ Heuristic flag, not formal reputational assessment |
| Art. 18(1)(f) | Critical services affected | Bot type mapped to critical service categories (NAV, FX, Sanctions, Compliance) | `bots/commander_bot.py` — `BOT_SUMMARIES` | ✅ |
| Art. 18(2) | Classify significant cyber threats using same criteria where applicable | SHADOW_BOT adversarial detection; `/api/security/inject` threat simulation | `bots/shadow_bot.py` | ⚠️ Adversarial detection implemented; formal threat classification workflow not formalised |
| Art. 18(3) | Apply ESMA/EBA/EIOPA joint classification guidelines | Joint guidelines not yet published at time of implementation; architecture designed to accommodate | Roadmap: update `classify_severity()` when RTS published | ⚠️ Awaiting ESMA/EBA joint RTS on classification criteria (expected 2025) |

**Article 18 gap assessment**: Classification criteria are tracked. Gaps are (1) AUM impact is estimated not real-time, (2) ESMA joint classification RTS not yet integrated (pending publication), (3) formal reputational assessment process is heuristic only.

---

### Article 19 — Reporting of Major ICT-related Incidents and Voluntary Notification of Significant Cyber Threats

Article 19 sets three mandatory report deadlines: initial notification (4 hours), intermediate report (72 hours), final report (1 month).

| DORA Paragraph | Requirement Text (paraphrased) | Genesis Swarm Control | Evidence | Status |
|---|---|---|---|---|
| Art. 19(1) | Submit initial notification to competent authority within 4 hours of major incident classification | EMERGENCY alert dispatches email + Slack immediately (< 1 min); alert includes Merkle-signed incident ID for reference | `shared/alerting.py` — `_dispatch_emergency()` | ⚠️ Alert dispatched; structured ESMA template not yet implemented |
| Art. 19(2) | Submit intermediate report within 72 hours containing updated information | PDF report with full alert timeline, Merkle root, bot snapshot; exportable on demand | `api/reports.py` — `GET /api/v1/report/pdf` | ⚠️ PDF covers content; requires operator to manually trigger export; no ESMA-format template |
| Art. 19(3) | Submit final report within 1 month containing root cause, remediation, and recurrence prevention | Not automated — requires human analyst to compile post-incident review | Roadmap: Jinja2 DORA final report template | ❌ Not implemented |
| Art. 19(4) | If incident spans multiple member states, coordinate via lead supervisor | Multi-tenant architecture supports per-jurisdiction isolation; cross-border coordination workflow not implemented | `shared/tenancy.py` | ❌ No cross-border supervisor coordination workflow |
| Art. 19(5) | Notify significant cyber threats voluntarily using same template | Threat injection endpoint; no ESMA notification template | `api/server.py` — `/api/security/inject` | ⚠️ Detection exists; notification template not implemented |
| Art. 19(6) | Competent authority may request additional information | API exposes full audit log, consensus proofs, and ML model stats for regulator access | Multiple audit endpoints | ✅ Data is available on-demand |
| Art. 19(7) | Financial entities may outsource notification to ICT third-party provider | Architecture supports notification forwarding via webhook; explicit outsourcing workflow not documented | `shared/alerting.py` — webhook support | ⚠️ Technical capability exists; contractual/process framework not documented |

**Article 19 gap assessment**: The largest gap. ESMA has published draft RTS on reporting templates (2024). Implementing structured ESMA-format notification templates for all three reports is the highest-priority DORA compliance item. The content data exists; it needs to be output in the prescribed format.

---

### Article 20 — Harmonisation of Reporting

Article 20 requires the ESAs to develop draft RTS to specify the content, format, and templates of reports under Article 19. It is a process article governing how the RTS are produced, not a direct obligation on financial entities.

| DORA Paragraph | Requirement Text (paraphrased) | Genesis Swarm Implication | Status |
|---|---|---|---|
| Art. 20(1) | ESAs to develop common reporting templates via RTS | Genesis Swarm must update reporting format once final RTS is published | ⚠️ Monitoring ESMA publication; architecture supports parameterised templates |
| Art. 20(2) | ESAs to take into account ENISA and ECB frameworks when developing templates | Genesis Swarm's severity classification is designed to be compatible with ENISA cyber risk taxonomy | ⚠️ Compatibility assumed; formal alignment not verified |
| Art. 20(3) | Review and update classification criteria at least every 3 years | Roadmap: quarterly DORA mapping review | ⚠️ No formal review schedule yet; this document is v1.0 |

**Article 20 gap assessment**: This article has no immediate technical obligations — it tasks the ESAs. The obligation on Genesis Swarm is to monitor for published RTS and update templates accordingly. A review note is added to this document's footer.

---

### Article 21 — Centralised Reporting

Article 21 establishes an optional centralised hub model for reporting, allowing financial entities to report through a single competent authority that distributes to others.

| DORA Paragraph | Requirement Text (paraphrased) | Genesis Swarm Control | Status |
|---|---|---|---|
| Art. 21(1) | Member States may designate a single point of contact for centralised reporting | Architecture allows webhook to route to a single regulatory endpoint | ⚠️ Configurable via `GENESIS_REPORT_WEBHOOK_URL`; no specific implementation for any member state hub |
| Art. 21(2) | Competent authority to distribute reports to relevant ESAs and other authorities | Out of scope for Genesis Swarm — this is a regulatory authority obligation | N/A |
| Art. 21(3) | Financial entities remain responsible for compliance regardless of centralised hub | Genesis Swarm maintains its own audit trail independent of any reporting hub | `consensus/sovereign_ledger.py` | ✅ |

**Article 21 gap assessment**: Primarily a supervisory architecture article. Genesis Swarm's obligation is to be capable of directing reports to a single endpoint — this is satisfied by the configurable webhook. No immediate gaps.

---

### DORA Articles Outside Chapter III — Coverage Inventory

The following DORA obligations are not covered by this mapping but are relevant to a complete DORA self-assessment:

| DORA Chapter | Articles | Topic | Genesis Swarm Status |
|---|---|---|---|
| Chapter II | Art. 5–16 | ICT risk management framework | ⚠️ Partial — risk governance, asset management, and BCM covered in CSSF §1 above; formal ICT risk framework policy document not yet written |
| Chapter IV | Art. 24–27 | Digital operational resilience testing | ✅ Chaos tests (`tests/chaos/`), PBFT fault injection (`tests/benchmarks/`); no formal TLPT engagement |
| Chapter V | Art. 28–44 | ICT third-party risk management | ⚠️ Circuit breakers on all external APIs; no formal third-party risk register for OFAC/ECB/Yahoo data dependencies |
| Chapter VI | Art. 45–56 | Information-sharing arrangements | ❌ No formal threat intelligence sharing arrangement; SHADOW_BOT adversarial data is internal only |

---

## 3. Control Gap Summary

### Implemented (previously open)

| Gap | Resolution |
|---|---|
| Merkle root not externally anchored | ✅ `blockchain_anchor.py` — Ethereum calldata + IPFS; `POST /api/v1/anchor/now` |
| SHAP explanations incomplete | ✅ `explainability.py` — TreeExplainer + z-score fallback; `GET /api/v1/explain/{bot_type}` |
| i18n EN/FR | ✅ `i18n.py` — 60-key EN/FR catalogue; `GET /api/v1/i18n/catalogue` |
| Multi-tenancy | ✅ `tenancy.py` — per-tenant SQLite + JWT tenant claims |
| Distributed BFT (in-process only) | ✅ `consensus/grpc/` — proto + gRPC replica server + process coordinator |
| A/B shadow model | ✅ `shadow_model.py` — AUC-ROC promotion gate; `GET /api/v1/shadow-model/stats` |
| Synthetic data replay | ✅ `wirecard_replay.py` + `GET /api/v1/simulation/wirecard-replay` |
| Status page | ✅ `GET /status` — public HTML, auto-refresh 30s |
| ML online learning (static model) | ✅ `online_learner.py` — rolling window IsolationForest with contamination self-calibration |
| PBFT fault tolerance unproven | ✅ `tests/benchmarks/test_pbft_fault_benchmark.py` — 5 Byzantine scenarios, P50/P95/P99 latency |

### Open gaps

| Gap | Priority | Root cause | Roadmap Target |
|---|---|---|---|
| No automated offsite DB backup | HIGH | Render free tier; no S3 integration | v0.5 — S3/Storj export cron job |
| DORA Art. 19(1–3) ESMA template format | HIGH | ESMA draft RTS published 2024; templates not yet implemented | v0.5 — Jinja2 ESMA notification templates |
| DORA Art. 19(3) final report automated | MEDIUM | Human analyst step required; workflow not formalised | v1.0 — Structured post-incident review template |
| TIBER-EU formal penetration test | MEDIUM | Cost; requires external security firm | v1.0 post-funding |
| DORA Chapter V third-party risk register | MEDIUM | OFAC/ECB/Yahoo have no formal risk register entry | v0.5 — Third-party ICT risk register |
| Post-incident RCA workflow formalised | MEDIUM | SHAP explains detection but not post-incident RCA process | v0.5 — RCA template + `POST /api/cases/{id}/rca` |
| Monthly senior management report | MEDIUM | Ad-hoc only; no automated schedule | v0.5 — Scheduled SLO summary email |
| DORA Chapter VI threat intelligence sharing | LOW | No external sharing arrangement | v1.0 — ISAC membership or bilateral agreement |
| External security audit | HIGH | Cost + no production deployment yet | Post-funding |
| Real AIS vessel streaming | LOW | AISStream.io paid subscription required | v0.6 |
| gRPC PBFT across 11 physical VMs | MEDIUM | Cloud infrastructure cost | Post-funding |
| DORA Art. 20 ESMA RTS integration | LOW | ESMA final RTS not yet published | Update when RTS published (est. Q3 2025) |

---

## 4. Evidence Artifacts

For each implemented control, auditors can request the following artifacts:

| Artifact | Source | How to obtain |
|---|---|---|
| Merkle chain export | `GET /api/ledger` | API call; returns chain hash + entries |
| Consensus round proof | `GET /api/ledger/proof/{round_id}` | Merkle inclusion proof per round |
| Alert timeline PDF | `GET /api/v1/report/pdf` | Requires operator JWT |
| Bot ML model stats | `GET /api/memory/stats` | Model version, contamination, precision |
| Audit incident log | `GET /api/audit/incidents` | Last 100 detected incidents |
| System SLO summary | `GET /api/health/slo` | Uptime, latency percentiles, bot health |

---

*Mapping prepared by Genesis Swarm engineering team — 2026-05-12.*
*DORA Article 17–21 expanded to full paragraph-level self-assessment in v0.4.1.*
*Next review date: 2026-08-12 (quarterly). Update when ESMA/EBA DORA RTS are finalised.*
