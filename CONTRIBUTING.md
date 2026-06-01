# Contributing to Genesis Swarm

Genesis Swarm is an open-source compliance infrastructure project. The goal is to build the missing open alternative to Bloomberg Terminal and Thomson Reuters for financial crime detection — free for the community, auditable by anyone, improvable by everyone.

We are early. The codebase works. There is a lot of depth left to add. Every contribution matters.

---

## What we need most

### High priority
- **Real data integrations** — replace any remaining mock/synthetic data with live API calls. OFAC SDN is live. ECB FX is live. AIS vessel tracking, Celestrak TLE, and OpenCorporates still have synthetic fallbacks that could be improved.
- **PBFT fault injection tests** — we have hypothesis property tests but need real fault injection: kill 3 replicas mid-round and verify the remaining 8 still commit correctly.
- **SHAP benchmark** — compare SHAP feature importances against known ground-truth anomaly patterns. Does the model's explanation actually match the reason the fraud happened?
- **DORA Article mapping** — expand `CSSF_MAPPING.md` with a full self-assessment against every DORA Article 17–21 paragraph. Flag gaps honestly.

### Medium priority
- New bot implementations — any financial crime detection vector not yet covered
- Performance benchmarks — P50/P95/P99 consensus latency under load
- Additional language support in i18n catalogue (DE, LU, NL)
- Accessibility improvements in the React dashboard

### Good first issues
- Add missing docstrings to bot `run_cycle()` methods
- Write integration tests that hit real APIs (with graceful skip if keys not set)
- Fix any broken link in documentation
- Add a bot for a financial crime vector not currently covered

---

## How to contribute

```bash
git clone https://github.com/Daman-2310/genesis-swarm
cd genesis-swarm
pip install -e ".[dev]"
cp .env.example .env   # add your API keys
pytest tests/
```

Open a pull request. No CLA required. No bureaucracy.

If you are adding a new bot:
1. Subclass `SwarmBot` from `src/genesis_swarm/shared/bot_base.py`
2. Implement `initialise()`, `run_cycle()`, and `cycle_interval_seconds()`
3. Add it to `cloud_app.py`
4. Add a `BOT_SUMMARIES` entry to `commander_bot.py`
5. Add its `BOT_TYPE` to `BOT_TYPES` in `jarvis-ui/app/page.tsx`

---

## What we will not merge

- Features that require paid APIs without a free/fallback path
- Code that weakens the existing fault tolerance guarantees
- False compliance claims — if something is not DORA-certified, do not say it is

---

## Reporting vulnerabilities

See [SECURITY.md](SECURITY.md). Do not open a public issue for security bugs.

---

## License

By contributing you agree your code will be released under AGPL-3.0.

---

## Contact

Daman Sharma — daman.sharma.2310@gmail.com  
GitHub Issues — https://github.com/Daman-2310/genesis-swarm/issues
