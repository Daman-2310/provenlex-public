<div align="center">

# ProvenLex

**Deterministic AIFMD II / UCITS prospectus compliance — in the browser, with no LLM.**

[Live scanner](https://genesis-swarm.vercel.app/scan) ·
[2027 AIFMD II Readiness Report](https://genesis-swarm.vercel.app/research/report-01-aifmd2-readiness) ·
[Trust & security](https://genesis-swarm.vercel.app/security)

📐 **The versioned standard:** [ProvenLex Ruleset Specification v2026.1](./RULESET.md) · [live, interactive version](https://genesis-swarm.vercel.app/ruleset)

Source-available under PolyForm Noncommercial 1.0.0

</div>

---

> **Note:** This is a representative source snapshot for inspection — the deterministic engine, its test suite, and the brand are kept current here; the surrounding app may lag the live build at https://genesis-swarm.vercel.app. Full or current source review is available to serious counterparties on request.

## What this is

ProvenLex reads a fund prospectus and checks it against the **AIFMD II and UCITS
quantitative limits** — leverage caps, risk retention, single-issuer / single-borrower
concentration — in seconds, entirely client-side. For every finding it cites the exact
rule and the source line, so you can see precisely where a document breaches the law or
its own declared caps.

It is built for Luxembourg AIFMs and management companies — especially smaller houses
carrying the same AIFMD II obligation as the largest, on a fraction of the budget.

## The design rule: no LLM in the decision path

Every verdict is produced by deterministic rules and arithmetic — **no large language
model decides anything.** The same document always produces the same verdict. There is
no model to hallucinate, and nothing you submit is uploaded or sent to an AI provider,
because there is no code path to one. A compliance officer cannot put their name behind
"the AI said so" — so this is the only kind of automation built into the decision path.

## How to verify it yourself

This repository is source-available precisely so a technical reviewer can confirm all of
the above — no NDA required:

- **The engine:** [`jarvis-ui/lib/scan-engine.ts`](jarvis-ui/lib/scan-engine.ts) — the
  extraction logic and the statutory limits (AIFMD II 175% / 300% leverage on the
  commitment method, 5% retention, 20% single-borrower; UCITS 5/10/40 + 10% single-issuer)
  as plain, readable code.
- **The tests** verify the engine against worked examples.
- **Provenance:** every verdict is SHA-256 sealed and stamped with the dated ruleset
  version (currently `2026.1`) that produced it — so a result stays re-verifiable against
  a named body of rules even after the law moves on.

## Honest limits

Deterministic checking reaches **quantitative** questions — declared-versus-statutory
limits and internal consistency. It does **not** make structural or qualitative judgments
(for example, whether a loan-originating AIF ought to be closed-ended). It is an aid to
review, not a substitute for your advisor or the primary text, and several AIFMD II
details remain subject to ESMA's final RTS/ITS — always verify against the regulation.
The [Trust page](https://genesis-swarm.vercel.app/security) states plainly which parts are
production-grade and which are reference implementations.

## What's in this repository

- **`jarvis-ui/`** — the product: the Next.js application and the deterministic compliance
  engine behind the live scanner. Client-side, no LLM in the decision path.
- **`RULESET.md`** — the ProvenLex Ruleset Specification: the versioned, citable AIFMD II / UCITS limits the engine enforces, each bound to its statutory source.
- `CSSF_MAPPING.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md` — mapping, trust, and notes.

## Links

- Live scanner — <https://genesis-swarm.vercel.app/scan>
- 2027 AIFMD II Readiness Report — <https://genesis-swarm.vercel.app/research/report-01-aifmd2-readiness>
- Why deterministic (field note) — <https://genesis-swarm.vercel.app/research/note-01-consistent-isnt-compliant>
- Trust & security — <https://genesis-swarm.vercel.app/security>

## License

Source-available under the **PolyForm Noncommercial License 1.0.0** — read, run, verify,
and modify for any noncommercial purpose; commercial use is not granted. See
[LICENSE](LICENSE). For a commercial licence, contact daman.sharma.2310@gmail.com.

## Contact

Daman Sharma · <daman.sharma.2310@gmail.com>
