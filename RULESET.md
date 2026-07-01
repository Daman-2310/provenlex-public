# AIFMD II · UCITS — Open Rule Registry

*The ProvenLex Ruleset Specification — a public, versioned, community-correctable standard.*

**Version `2026.2` · Effective `2026-04-16` (AIFMD II application date) · Revised `2026-06-27` · Framework: AIFMD II + UCITS (Directive 2009/65/EC)**

The public, versioned, **deterministic** interpretation of the AIFMD II loan-origination limits and the UCITS diversification rule — the exact body of rules behind every [ProvenLex](https://provenlex.vercel.app) verdict. The engine is one implementation; *this* is the standard. Inspect it, cite it, fork it — and if a rule reads wrong, [help fix it](#proposing-a-change).

> Information only, not legal advice. AIFMD II detail remains subject to ESMA's final RTS/ITS; the version and effective date record exactly which interpretation applied when a verdict was sealed.

Every verdict the engine issues is stamped with this version and a SHA-256 hash of the ruleset, bound into the verdict seal — so anyone can prove which dated body of rules decided it, and that those rules were not altered.

---

## AIFMD II — loan-origination regime

*These caps bind **only** loan-originating AIFs (see GS-GATE-1).*

### GS-LEV-1 — Leverage cap
- **Rule:** Open-ended ≤ **175%** of NAV · closed-ended ≤ **300%** of NAV (commitment method).
- **Scope:** Loan-originating AIFs only.
- **Source:** AIFMD II (Dir (EU) 2024/927), via Art. 15 of Dir 2011/61/EU.
- **Method:** Declared **commitment-method** leverage cap compared to the statutory cap for the fund's structure. A figure stated on a gross / VaR basis is *not directly comparable* and is flagged for confirmation, not asserted as a breach.

### GS-RET-1 — Risk retention
- **Rule:** ≥ **5%** of the notional value of each originated loan retained.
- **Scope:** Loan-originating AIFs only.
- **Source:** AIFMD II, Art. 15 of Dir 2011/61/EU.
- **Method:** Declared retention compared to the statutory minimum; a lower figure is a breach.

### GS-CON-1 — Single-borrower concentration
- **Rule:** ≤ **20%** of the AIF's capital to a single borrower that is a **financial undertaking, another AIF, or a UCITS** (not an ordinary corporate borrower).
- **Scope:** Loan-originating AIFs only; binds only where the borrower is a financial undertaking / AIF / UCITS.
- **Source:** AIFMD II, Art. 15 of Dir 2011/61/EU.
- **Method:** An exposure above the limit is a breach where the borrower is a financial undertaking / AIF / UCITS; for an ordinary corporate borrower it is flagged for **borrower-type confirmation**, not asserted as a breach.

## UCITS — diversification

### GS-UC-1 — Single-issuer cap
- **Rule:** ≤ **10%** of NAV in transferable securities of any single issuer.
- **Scope:** UCITS only.
- **Source:** UCITS Dir 2009/65/EC, Art. 52.
- **Method:** Each disclosed holding compared to the single-issuer cap.

### GS-UC-2 — 5/10/40 concentration
- **Rule:** Aggregate of all single-issuer positions above **5%** of NAV may not exceed **40%** of NAV.
- **Scope:** UCITS only.
- **Source:** UCITS Dir 2009/65/EC, Art. 52.
- **Method:** Sum of holdings above the 5% threshold compared to the 40% bucket cap.

## Applicability & honesty

### GS-GATE-1 — Applicability gate
- **Rule:** The AIFMD II caps (GS-LEV-1, GS-RET-1, GS-CON-1) bind **only** loan-originating AIFs — a fund whose strategy is mainly to originate loans, or whose originated loans are ≥ 50% of NAV.
- **Method:** Applying these caps to a general AIF is a false positive and is never asserted.

### GS-DATA-1 — Fail loud (insufficient data)
- **Rule:** Where a document does not disclose enough to evaluate a rule, the verdict is *"insufficient data"* — never a clean pass.
- **Method:** A confident wrong "compliant" is worse than an honest "cannot judge."

---

## Proposing a change

This registry is meant to be corrected by the people who practise this. If a rule reads wrong, too broadly, or omits something the statute requires:

1. Open an [issue](https://github.com/Daman-2310/provenlex-public/issues) or a pull request against this file.
2. Name the rule (e.g. `GS-CON-1`), say what it should read, and cite the article.
3. Accepted changes are versioned here and credited in the changelog; the registry version bumps, and verdicts sealed under the prior version stay valid against that reading.

Corrections from named practitioners are the most valuable input this project can get — a wrong rule fixed in public is worth more than a right one kept private.

---

## Changelog
- **2026.2 (2026-06-27):** GS-CON-1 scoped — the 20% single-borrower limit binds only where the borrower is a financial undertaking / AIF / UCITS (an ordinary corporate borrower over 20% is flagged for confirmation, not a breach). GS-LEV-1 clarified — only a commitment-method figure is compared to the cap; a gross / VaR "expected leverage" figure (often several hundred percent, and normal for a derivative-using fund) is flagged as not directly comparable, never breached. *Verdicts sealed under 2026.1 remain valid against that interpretation.*
- **2026.1 (2026-04-16):** Initial specification.

## Sources
- Directive (EU) 2024/927 (AIFMD II)
- Directive 2011/61/EU (AIFMD), Art. 15 & 23
- Directive 2009/65/EC (UCITS), Art. 52 — 5/10/40 rule

## Cite as

```
Sharma, D. (2026). "The ProvenLex Ruleset Specification v2026.2."
ProvenLex. Effective 2026-04-16.
URL: https://provenlex.vercel.app/ruleset
```

Released under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). Reproduce, distribute, and build on it with attribution.

**Live, interactive version:** https://provenlex.vercel.app/ruleset
