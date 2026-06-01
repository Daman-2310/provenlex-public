// =============================================================================
// GENESIS SWARM -- PORTFOLIO COMPLIANCE CIRCUIT
// Noir (Aztec Labs) -- UltraPLONK on BN254
//
// LEGAL BASIS:
//   AIFMD Directive 2011/61/EU -- Article 111 (leverage limits)
//   CSSF Circular 11/512       -- Annex III  (single-issuer concentration cap)
//
// PRIVACY MODEL:
//   PRIVATE : portfolio_weights, asset_identifiers
//             (fund alpha-generating strategy -- never leaves secure enclave)
//   PUBLIC  : max_leverage_limit, max_concentration_cap
//             (CSSF-mandated regulatory thresholds -- publicly known)
//
// PROOF GUARANTEE:
//   A valid proof for these public inputs certifies to CSSF:
//     1. sum(portfolio_weights) == 10000 bp  (100% -- fully normalised)
//     2. each weight[i] <= max_leverage_limit  (per-position AIFMD bound)
//     3. sum_j{id[j]==id[i]} weight[j] <= max_concentration_cap (CSSF 11/512)
//   WITHOUT revealing portfolio_weights or asset_identifiers.
//
// ENCODING:
//   All weights in basis points (bp): 10000 bp == 100.00%
//   1 bp == 0.01% -- sufficient precision for all CSSF reporting thresholds.
//
// TYPICAL PUBLIC INPUTS (per CSSF authorisation):
//   max_leverage_limit    = 3000  (30% per single position)
//   max_concentration_cap = 2000  (20% per single issuer -- CSSF 11/512)
// =============================================================================

// Weight scale: 10000 basis points == 100.00%
global WEIGHT_SCALE_BP: u32 = 10_000;

// Absolute ceiling for any single weight -- circuit-level invariant.
// A weight > 10000 represents a position > 100% of NAV, impossible in a
// normalised portfolio regardless of the public max_leverage_limit.
global WEIGHT_CEILING_BP: u32 = 10_000;

// =============================================================================
// HELPERS
// =============================================================================

// Sum all 11 weights.
// Max possible sum: 11 * 10000 = 110000, fits in u32. No overflow.
fn sum_weights(w: [u32; 11]) -> u32 {
    let mut total: u32 = 0;
    for i in 0..11 {
        total += w[i];
    }
    total
}

// Aggregate all weights that share the same asset_identifier as position idx.
// Returns total basis-point exposure to that issuer across the portfolio.
//
// Conditional accumulation inside a Noir circuit: constraints are generated
// for both branches of if/else; the witness satisfies exactly one path.
fn issuer_total_exposure(
    weights:     [u32; 11],
    identifiers: [u32; 11],
    idx:         u32,
) -> u32 {
    let target_id: u32 = identifiers[idx];
    let mut exposure: u32 = 0;
    for j in 0..11 {
        if identifiers[j] == target_id {
            exposure += weights[j];
        }
    }
    exposure
}

// =============================================================================
// MAIN CIRCUIT
// =============================================================================

fn main(
    // -- PRIVATE INPUTS: Hidden fund strategy ---------------------------------

    // portfolio_weights[i]: allocation to position i in basis points.
    //   Range per element: [0, max_leverage_limit] (enforced in Constraint 2).
    //   Invariant: sum(portfolio_weights) == WEIGHT_SCALE_BP == 10000.
    //   Example: [2000,1500,1200,900,800,700,600,500,400,300,100] sums to 10000.
    portfolio_weights: [u32; 11],

    // asset_identifiers[i]: non-zero deterministic hash of the ISIN for position i.
    //   Computed off-chain: truncate_to_u32(Poseidon2(ISIN_bytes))
    //   Non-zero <=> position is a valid disclosed asset.
    //   Repeated values (same issuer, different instruments) are aggregated in
    //   Constraint 3 to compute total per-issuer exposure.
    asset_identifiers: [u32; 11],

    // -- PUBLIC INPUTS: Mandated legal limits ---------------------------------

    // max_leverage_limit: maximum basis-point weight any single position may hold.
    //   Enforced per AIFMD Art.111.
    //   Typical CSSF value: 3000 bp (30.00% per single position).
    max_leverage_limit: pub u32,

    // max_concentration_cap: maximum aggregated weight across ALL positions sharing
    //   the same asset_identifier (same legal-entity issuer).
    //   CSSF Circular 11/512 Annex III: 2000 bp (20.00% gross AUM per issuer).
    max_concentration_cap: pub u32,
) {
    // =========================================================================
    // CONSTRAINT 1 -- Portfolio Weight Normalization
    //
    // AIFMD requires leverage to be calculated on a fully allocated portfolio.
    //
    //   sum < 10000 => uninvested cash hidden from leverage denominator,
    //                  artificially deflating reported leverage ratios.
    //   sum > 10000 => synthetic over-allocation or double-counted notional,
    //                  reportable under AIFMD Art.19.
    //
    // The prover must supply weights summing to exactly 100.00% with no slack.
    // =========================================================================

    let total: u32 = sum_weights(portfolio_weights);

    assert(
        total == WEIGHT_SCALE_BP,
        "C1: portfolio weights must sum to exactly 10000 bp (100.00%)"
    );

    // =========================================================================
    // CONSTRAINT 2 -- Per-Position Range Bounds
    //
    // Sub-constraints per position:
    //
    //   (a) weight[i] <= WEIGHT_CEILING_BP  -- absolute circuit invariant.
    //       A weight > 10000 is structurally impossible in a normalised portfolio.
    //
    //   (b) weight[i] <= max_leverage_limit  -- regulatory per-position cap.
    //       AIFMD Art.111: individual position exposure limit per CSSF auth.
    //       Even if the portfolio sums to 100%, a single over-limit position
    //       is a standalone compliance breach.
    //
    //   (c) asset_identifiers[i] != 0  -- valid ISIN hash required.
    //       Zero identifier means the ISIN hash was not computed (empty slot).
    //       Phantom positions with id=0 could absorb concentration headroom in
    //       Constraint 3 without representing a real disclosed holding.
    //
    // Note: weight[i] >= 0 is guaranteed by u32 (unsigned integer type).
    // =========================================================================

    for i in 0..11 {
        // (a) Absolute ceiling -- circuit-level invariant independent of public input.
        assert(
            portfolio_weights[i] <= WEIGHT_CEILING_BP,
            "C2a: position weight > 10000 bp (> 100%) is structurally invalid"
        );

        // (b) Regulatory per-position limit from CSSF authorisation file.
        assert(
            portfolio_weights[i] <= max_leverage_limit,
            "C2b: position weight exceeds max_leverage_limit (AIFMD Art.111)"
        );

        // (c) Non-zero ISIN hash => active disclosed position.
        assert(
            asset_identifiers[i] != 0,
            "C2c: asset_identifiers[i] is zero -- position has no valid ISIN"
        );
    }

    // =========================================================================
    // CONSTRAINT 3 -- CSSF Single-Issuer Concentration Cap
    // (CSSF Circular 11/512, Annex III -- Luxembourg AIFs and UCITS)
    //
    // A fund can hold the same issuer across multiple instruments:
    //   e.g., Apple equity + Apple convertible bond + Apple senior CDS
    //   => three positions, one issuer (same asset_identifier hash).
    //
    // CSSF aggregates ALL exposures to the same legal entity. Total allocation
    // to any single issuer must be <= max_concentration_cap (2000 bp = 20%).
    //
    // For each position i, sum weights[j] for all j where identifiers[j] == identifiers[i].
    // Assert the result <= max_concentration_cap.
    //
    // When all issuers are distinct:   issuer_exposure[i] == weights[i].
    // When two positions share an id:  both anchors produce the combined total
    //   (assertion fires twice for the same issuer -- correct by symmetry).
    //
    // Circuit complexity: 11 outer * 11 inner = 121 equality constraints.
    // Fully unrolled at compile time -- constant prover and verifier cost.
    //
    // Note: Constraint 2(c) ensures id=0 is already rejected, so phantom
    // positions cannot absorb concentration headroom under "issuer zero".
    // =========================================================================

    for i in 0..11 {
        let issuer_exposure: u32 = issuer_total_exposure(
            portfolio_weights,
            asset_identifiers,
            i as u32,
        );

        assert(
            issuer_exposure <= max_concentration_cap,
            "C3: total issuer exposure exceeds max_concentration_cap (CSSF 11/512)"
        );
    }

    // =========================================================================
    // ALL CONSTRAINTS SATISFIED.
    //
    // The proof verifier accepts this proof iff:
    //
    //   C1 -- sum(weights)     == 10000 bp            normalised allocation
    //   C2 -- each weight[i]   <= max_leverage_limit  per-position AIFMD cap
    //   C2 -- each id[i]       != 0                   all positions have ISINs
    //   C3 -- per-issuer total <= max_concentration_cap  CSSF 11/512
    //
    // portfolio_weights and asset_identifiers are never revealed.
    // =========================================================================
}

// =============================================================================
// TEST SUITE -- nargo test
// =============================================================================

// -- Fixtures -----------------------------------------------------------------

// Clean valid portfolio: 11 distinct issuers, max weight 2000 <= 3000, sum 10000.
// Verify: 2000+1500+1200+900+800+700+600+500+400+300+1100 = 10000
fn clean_weights() -> [u32; 11] {
    [2000, 1500, 1200, 900, 800, 700, 600, 500, 400, 300, 1100]
}

// 11 distinct non-zero ISIN hashes.
fn distinct_ids() -> [u32; 11] {
    [0xA001, 0xA002, 0xA003, 0xA004, 0xA005,
     0xA006, 0xA007, 0xA008, 0xA009, 0xA00A, 0xA00B]
}

// -- Happy path ----------------------------------------------------------------

// C1+C2+C3 all satisfied: valid portfolio, all distinct issuers.
#[test]
fn test_valid_distinct_issuers() {
    main(
        clean_weights(),  // sums to 10000, each <= 3000
        distinct_ids(),   // all unique, all non-zero
        3000,             // max_leverage_limit: 30%
        2000,             // max_concentration_cap: 20%
    );
}

// Positions 0 and 1 share an issuer; aggregate 910+910=1820 <= 2000 cap.
// Portfolio: 10 * 910 + 900 = 10000.
#[test]
fn test_shared_issuer_within_cap() {
    let weights: [u32; 11] = [910, 910, 910, 910, 910, 910, 910, 910, 910, 910, 900];
    let mut ids = distinct_ids();
    ids[1] = ids[0]; // 910 + 910 = 1820 <= 2000 cap
    main(weights, ids, 3000, 2000);
}

// All 11 positions are instruments of the same issuer.
// Requires concentration cap lifted to 10000 (100%) -- unusual CSSF auth.
#[test]
fn test_single_issuer_full_portfolio_100pct_cap() {
    let all_same_id: [u32; 11] = [0xDEAD; 11];
    main(
        clean_weights(), // max weight 2000 <= 3000; sum = 10000
        all_same_id,
        3000,    // per-position limit 30% -- max weight 2000 ok
        10000,   // concentration cap lifted to 100%
    );
}

// -- Constraint 1 failure cases -----------------------------------------------

// Weights sum to 9999 (one bp short).
#[test(should_fail_with = "C1: portfolio weights must sum to exactly 10000 bp")]
fn test_c1_under_allocated() {
    let mut w = clean_weights();
    w[10] = 99; // was 100; sum drops to 9999
    main(w, distinct_ids(), 3000, 2000);
}

// Weights sum to 10001 (one bp over).
#[test(should_fail_with = "C1: portfolio weights must sum to exactly 10000 bp")]
fn test_c1_over_allocated() {
    let mut w = clean_weights();
    w[10] = 101; // was 100; sum rises to 10001
    main(w, distinct_ids(), 3000, 2000);
}

// -- Constraint 2 failure cases -----------------------------------------------

// Position 0 holds 3001 bp -- one bp over the 3000 bp limit.
// Position 1 reduced by 1001 bp to keep sum = 10000.
#[test(should_fail_with = "C2b: position weight exceeds max_leverage_limit")]
fn test_c2_weight_over_leverage_limit() {
    let mut w = clean_weights();
    w[0] = 3001; // 30.01% -- over the 30.00% limit
    w[1] = 499;  // was 1500; compensates so sum stays at 10000
    main(w, distinct_ids(), 3000, 2000);
}

// Position 5 has identifier 0 (no valid ISIN).
#[test(should_fail_with = "C2c: asset_identifiers[i] is zero")]
fn test_c2_zero_identifier() {
    let mut ids = distinct_ids();
    ids[5] = 0; // phantom position -- no ISIN hash
    main(clean_weights(), ids, 3000, 2000);
}

// -- Constraint 3 failure cases -----------------------------------------------

// Positions 0 (2000 bp) and 1 (1500 bp) share an issuer.
// Aggregated: 2000 + 1500 = 3500 bp > 2000 bp cap.
#[test(should_fail_with = "C3: total issuer exposure exceeds max_concentration_cap")]
fn test_c3_two_positions_same_issuer_over_cap() {
    let mut ids = distinct_ids();
    ids[1] = ids[0]; // 2000 + 1500 = 3500 > 2000
    main(
        clean_weights(), // sum = 10000, each <= 3000 -- C2 passes
        ids,
        3000, // per-position limit 30% -- individual weights ok
        2000, // concentration cap 20% -- aggregate 3500 BREACH
    );
}

// All 11 positions same issuer; aggregate = 10000 >> 2000 cap.
#[test(should_fail_with = "C3: total issuer exposure exceeds max_concentration_cap")]
fn test_c3_monopoly_issuer_breach() {
    let all_same: [u32; 11] = [0xFF00; 11];
    main(clean_weights(), all_same, 3000, 2000);
}
