# Postmortem: The `except: pass` era (19 critical defects)

**Date:** 2024-04  
**Author:** Daman Sharma  
**Severity:** Critical (19 defects, 56 total)  
**Detection:** External code review  

## Timeline

| Time | Event |
|------|-------|
| 2024-04-01 | Project passes 62 tests, ships to GitHub |
| 2024-04-02 | External reviewer audits codebase |
| 2024-04-02 14:00 | Report received: **19 critical defects** identified |
| 2024-04-02 14:30 | Begin remediation — all `except: pass` instances mapped |
| 2024-04-02 18:00 | All `except: pass` replaced with structured logging |
| 2024-04-03 10:00 | Default JWT secret production guard added |
| 2024-04-03 12:00 | Plain-text password fallback removed |
| 2024-04-03 14:00 | Auth code deduplicated across modules |
| 2024-04-03 16:00 | All fire-and-forget `create_task` calls tracked |
| 2024-04-03 18:00 | Background collector exception-safe |
| 2024-04-03 20:00 | SQLite timeout added; config production gate hardened |
| 2024-04-03 22:00 | Fixes pushed. All 19 critical defects resolved. |

## Root cause analysis

### Why were there 19 critical defects?

**Five whys:**

1. A code review found 19 critical defects in a codebase that passed 62 tests.
2. The tests verified *existence* of functionality, not *correctness* of failure paths.
3. Error handling was treated as boilerplate, not as a first-class design concern.
4. The developer (sole contributor) had no production experience with distributed systems.
5. **There was no feedback loop.** No code review, no production incidents, no users reporting bugs. The code was written in isolation and never validated against real failure.

**The deeper problem:** The test suite created a false sense of security. 62 tests passing meant the happy path worked. The unhappy paths were entirely undocumented and untested.

### Specific defect categories

| Category | Count | Example |
|----------|-------|---------|
| `except: pass` error swallowing | ~20 | Malformed JSON env var silently fell back to dev credentials |
| Hardcoded production credentials | 4 | bcrypt hash for password "genesis2024" baked into source |
| Fire-and-forget asyncio tasks | 6 | Background task exceptions silently lost forever |
| Auth logic duplicated | 13 functions | Two divergent copies of JWT creation, lockout tracking |
| Missing production security gates | 2 | Default JWT secret accepted in production |
| Plain-text password fallback | 1 | Non-bcrypt hashes fell through to env-var password |

## Blast radius

- **Users affected:** 0 (no production users at time of discovery)
- **Data at risk:** None exposed (no production deployment)
- **Reputation at risk:** Significant — hardcoded credentials and silent error handling would erode trust in a security product

## Corrective actions

| Action | Owner | Status | Verification |
|--------|-------|--------|--------------|
| Replace all `except: pass` with structured logging | Self | Done | `grep -rn "except:.*pass" src/` → 0 results |
| Add production guard for JWT secret | Self | Done | `RuntimeError` raised in production with default secret |
| Remove plain-text password fallback | Self | Done | Auth now requires bcrypt hashes or returns 500 |
| Consolidate duplicated auth logic | Self | Done | All auth functions in `routes/auth.py` |
| Track all background tasks | Self | Done | `_fire_task()` helper with `add_done_callback` |
| Add SQLite connection timeout | Self | Done | `timeout=5` on all connections |
| Add TLA+ formal specification | Self | Done | `spec/PBFT.tla` with safety invariants |
| Add property-based tests | Self | Pending | Hypothesis tests for protocol invariants |
| External security audit | Self | Pending | Needed before production deployment |

## Lessons learned

1. **Tests that only check the happy path are worse than no tests.** They create confidence where none is warranted. Every test should also test what happens when things go wrong.

2. **`except: pass` is always wrong.** There is no production scenario where silently discarding an error is the correct behaviour. At minimum, log it. Better: crash loud enough that CI fails.

3. **Duplicated code is a security vulnerability.** When auth logic exists in two files, a fix applied to one silently leaves the other exploitable. One function, one module, one place.

4. **Default credentials are a liability.** A default JWT secret of "genesis-dev-secret" is not a default — it's a backdoor. If it can't be random at startup, it should crash hard in production.

5. **Solo developers need external review more than teams do.** The absence of a second pair of eyes is the highest-risk failure mode. Automated checks (mypy --strict, bandit, property-based testing) partially compensate, but they don't replace a human who has been burned before.

## Appendix: Full defect list

See `docs/audit/2024-04-code-quality-audit.md` for the complete enumeration of all 56 defects (19 critical, 13 high, 15 medium, 9 low).
