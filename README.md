<div align="center">

# AIFMD II · UCITS — Open Rule Registry

**The public, versioned, citable interpretation of the AIFMD II and UCITS quantitative limits — with a deterministic reference implementation you can run in your own browser.**

[The registry →](./RULESET.md) · [Interactive version](https://provenlex.vercel.app/ruleset) · [Reference scanner](https://provenlex.vercel.app/scan)

The registry (`RULESET.md`) is **CC-BY 4.0** — cite it, fork it, build on it. The reference implementation is source-available under PolyForm Noncommercial 1.0.0.

</div>

---

## What this is

A compliance verdict on a fund prospectus is only worth anything if you can say **which rules produced it, on what date, and prove they were not changed afterwards.** This repository exists to make that possible in the open.

It holds two things:

1. **The registry** — [`RULESET.md`](./RULESET.md): the AIFMD II loan-origination limits (175% / 300% leverage on the commitment method, 5% risk retention, the 20% single-borrower limit) and the UCITS diversification limits (10% single-issuer, 5/10/40), each written as a plain, testable rule and **bound to its statutory source**. Versioned (`v2026.2`) and SHA-256 sealed, so any change is detectable.

2. **A reference implementation** — [`jarvis-ui/`](./jarvis-ui): a deterministic engine that runs the registry over a real prospectus, entirely in the browser, and returns a verdict that cites each finding to its rule and seals the result against the exact registry version that produced it.

The registry is the standard. The engine is one honest way to apply it.

## Why a registry, not just a tool

AIFMD II is a moving target — ESMA and CSSF guidance, Q&A, and the final RTS/ITS will shift interpretations for years. A private tool that hard-codes today's reading goes quietly stale. A public, versioned registry does the opposite: a verdict sealed under `v2026.2` stays re-verifiable against exactly that body of rules even after the law moves on — and the reading itself can be argued, corrected, and improved in the open, by the people who actually practise this.

## Contribute — tell me where it's wrong

This is the part that matters.

**If you work in Luxembourg fund compliance — a Conducting Officer, a fund lawyer, a Big-Four compliance desk — and a rule in this registry is wrong, too narrow, or missing, that is the single most useful thing you can tell me.**

- Open an [issue](https://github.com/Daman-2310/provenlex-public/issues): *"GS-CON-1 reads the 20% limit too broadly — here's the article I'd cite,"* and I'll act on it.
- Or a pull request against [`RULESET.md`](./RULESET.md).
- Every accepted change is versioned and credited in [`CHANGELOG.md`](./CHANGELOG.md).

I would rather be corrected in public than confidently wrong in private. That is the entire point of doing this in the open.

## The one design rule: no LLM in the decision path

Every verdict is produced by deterministic rules and arithmetic — no large language model decides anything. The same document always produces the same verdict; there is nothing to hallucinate, and nothing you submit is uploaded, because there is no code path to a server or a model. A Conducting Officer cannot put their name behind "the AI said so" — so this is the only kind of automation in the decision path.

When a document cannot be read cleanly, the engine returns `INSUFFICIENT_DATA` rather than guess. The reasoning is set out in [*Extraction Is the Hard Part*](https://provenlex.vercel.app/research/note-02-extraction-is-the-hard-part).

## Verify it yourself — no NDA

- **The rules:** [`RULESET.md`](./RULESET.md) — each bound to Directive (EU) 2024/927; Directive 2011/61/EU, Art. 15 & 23; Directive 2009/65/EC, Art. 52.
- **The engine:** [`jarvis-ui/lib/scan-engine.ts`](jarvis-ui/lib/scan-engine.ts) — the limits and the extraction logic as plain, readable code.
- **The tests:** worked examples the engine is re-checked against on every change.
- **The seal:** every verdict is SHA-256 sealed and stamped with the dated registry version, so a result stays re-verifiable against a named body of rules even after the law moves on.

## Honest limits

Deterministic checking reaches **quantitative** questions — declared-versus-statutory limits and internal consistency. It does not make structural or qualitative judgments (for example, whether a loan-originating AIF ought to be closed-ended). It is an aid to review, not a substitute for the primary text or your advisor, and several AIFMD II details remain subject to ESMA's final RTS/ITS. The [Trust page](https://provenlex.vercel.app/security) states plainly which parts are production-grade and which are reference implementations.

## License

- **Registry (`RULESET.md`)** — Creative Commons Attribution 4.0. Cite it, fork it, embed it.
- **Reference implementation (`jarvis-ui/`)** — PolyForm Noncommercial 1.0.0. Read, run, and verify freely; commercial use on request.

## Contact

Daman Sharma · <daman.sharma.2310@gmail.com> · provenlex.vercel.app
