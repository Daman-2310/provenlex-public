# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.4.x   | ✅ Active support  |
| 0.3.x   | ⚠️ Critical fixes only |
| < 0.3   | ❌ End of life     |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues via **private disclosure**:

1. **Email**: daman.sharma.2310@gmail.com  
   Subject: `[SECURITY] Genesis Swarm — <brief description>`
2. **GitHub Security Advisories**: [Report here](https://github.com/Daman-2310/genesis-swarm/security/advisories/new)

### What to include

- Description of the vulnerability and its impact
- Steps to reproduce (proof of concept if possible)
- Affected versions
- Any suggested mitigations

### Response timeline

| Stage | Target SLA |
|-------|-----------|
| Initial acknowledgement | 48 hours |
| Severity assessment | 5 business days |
| Patch (Critical/High) | 14 days |
| Patch (Medium/Low) | 90 days |
| Public disclosure | Coordinated with reporter |

We follow [responsible disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). Reporters who follow this policy will be credited in the release notes.

---

## Security Hardening Checklist

### Secrets Management
- [ ] Rotate `GENESIS_JWT_SECRET` at least every 90 days
- [ ] Never commit `.env` files; use a secrets manager (Vault, AWS Secrets Manager, Railway)
- [ ] Refresh tokens stored with `httpOnly` cookie flag when browser clients are used
- [ ] CI pipeline uses placeholder keys only — real keys must be GitHub repository secrets

### Auth Hardening
- [ ] Account lockout triggers after 5 failed logins (15-minute window)
- [ ] Session revocation: invalidate refresh tokens by rotating `GENESIS_JWT_SECRET`
- [ ] Add GENESIS_USERS JSON with bcrypt-hashed passwords for production (no dev defaults)
- [ ] JWT expiry: access token 24h, refresh token 7d

### Transport Security
- [ ] HTTPS-only in production (TLS 1.2+); set HSTS header
- [ ] WebSocket connections over WSS only
- [ ] CORS origins restricted to known frontend URLs

### Dependency Scanning (CI)
```bash
bandit -r src/ -ll
safety check -r requirements.txt
pip-audit -r requirements.txt
semgrep --config=p/python src/
```

### Audit Trail
- Merkle-chained audit log in SQLite (`sovereign_ledger.py`)
- Log ingestion: structured JSON → Grafana Loki / ELK
- **TODO**: Periodic Merkle root anchoring to a public blockchain

---

## Known Limitations

| Limitation | Impact | Mitigation |
|------------|--------|-----------|
| In-process PBFT replicas | A single os._exit(0) kills all 11 replicas | Planned: gRPC inter-process PBFT (v0.5) |
| Refresh token revocation | No per-token revocation; rotating secret revokes all | Redis token blocklist planned |
| Merkle chain not externally anchored | Local SQLite can be rewritten | Ethereum/IPFS anchoring in roadmap |
| Rate limiting is in-memory | Does not scale horizontally | Redis-backed rate limiter planned |
| Account lockout is in-memory | Resets on restart | Redis-backed lockout planned |

---

## Automated Scanning Results

Security scans run on every CI push (see `.github/workflows/ci.yml`):

- **bandit**: static analysis for common Python security issues
- **safety**: CVE scan against PyPA advisory database  
- **pip-audit**: PyPA vulnerability audit
- **semgrep**: semantic rule-based pattern matching (ruleset `p/python`)

Results are uploaded as CI artifacts. A failing scan blocks the `staging` deploy gate.
