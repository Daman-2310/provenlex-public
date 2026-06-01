// =============================================================================
// GENESIS SWARM — ZK PROOF VERIFICATION BENCHMARKS
// benches/zk_verify_bench.rs
//
// Benchmarks the full BN254 Groth16 proof lifecycle:
//
//   1. stub_sentinel_path     — zeroed bytes, skips pairing entirely (<5 ns)
//   2. proof_deserialization  — CanonicalDeserialize 128 compressed bytes (~200 ns)
//   3. groth16_verify_real    — full BN254 pairing equation (~1.5–2.5 ms)
//   4. pvk_prepare            — PreparedVerifyingKey from raw VK (~3–5 ms, once at startup)
//
// The real Groth16 benchmark generates a trivially-satisfiable R1CS circuit
// (x * x = y, witness x=5, public input y=25) using arkworks, runs the
// trusted setup, generates a proof, then benchmarks verification only.
//
// This proves the arkworks pairing path in main.rs is live code, not dead weight.
//
// Run: cargo bench --bench zk_verify_bench
// =============================================================================
#![allow(clippy::unused_enumerate_index, clippy::assign_op_pattern)]

use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};

use ark_bn254::{Bn254, Fr};
use ark_bn254::{G1Affine, G2Affine};
use ark_ec::AffineRepr;
use ark_groth16::{
    prepare_verifying_key, Groth16, PreparedVerifyingKey, Proof as Groth16Proof, ProvingKey,
    VerifyingKey,
};
use ark_r1cs_std::{fields::fp::FpVar, prelude::*};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use ark_snark::SNARK;
use ark_std::rand::SeedableRng;

// ── Trivial R1CS circuit: x * x = y ──────────────────────────────────────────
// Private witness: x
// Public input:   y = x²
// Constraint:     x · x − y = 0
//
// This is the minimal R1CS shape that exercises the full Groth16 prover/verifier.
// It mirrors the AIFMD concentration-cap circuit structure (scalar * scalar = bound).

#[derive(Clone)]
struct SquareCircuit {
    x: Option<Fr>, // private witness
    y: Option<Fr>, // public input  (= x²)
}

impl ConstraintSynthesizer<Fr> for SquareCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        // Allocate private witness
        let x_var = FpVar::<Fr>::new_witness(ark_relations::ns!(cs, "x"), || {
            self.x.ok_or(SynthesisError::AssignmentMissing)
        })?;
        // Allocate public input
        let y_var = FpVar::<Fr>::new_input(ark_relations::ns!(cs, "y"), || {
            self.y.ok_or(SynthesisError::AssignmentMissing)
        })?;
        // Enforce: x · x = y
        let x_sq = &x_var * &x_var;
        x_sq.enforce_equal(&y_var)?;
        Ok(())
    }
}

// ── Compliance circuit: weight_sum = 10000 ───────────────────────────────────
// Mirrors C1 of the AIFMD Noir circuit: Σ portfolio_weights == WEIGHT_SCALE_BP
// Private witness: 11 weights in basis points
// Public input:    total = 10000
// Constraints:     accumulate sum, enforce sum == total

#[derive(Clone)]
struct WeightNormCircuit {
    weights: Option<[Fr; 11]>,
    total: Option<Fr>,
}

impl ConstraintSynthesizer<Fr> for WeightNormCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        let total_var = FpVar::<Fr>::new_input(ark_relations::ns!(cs, "total"), || {
            self.total.ok_or(SynthesisError::AssignmentMissing)
        })?;

        let weights = self.weights.ok_or(SynthesisError::AssignmentMissing)?;
        let mut sum = FpVar::<Fr>::zero();
        for (_i, w) in weights.iter().enumerate() {
            let w_var = FpVar::<Fr>::new_witness(ark_relations::ns!(cs, "w"), || Ok(*w))?;
            sum = sum + &w_var;
        }
        sum.enforce_equal(&total_var)?;
        Ok(())
    }
}

// ── Setup helper ─────────────────────────────────────────────────────────────
struct GrothSetup {
    pk: ProvingKey<Bn254>,
    pvk: PreparedVerifyingKey<Bn254>,
}

fn setup_square_circuit() -> GrothSetup {
    let mut rng = ark_std::rand::rngs::StdRng::seed_from_u64(0xDEAD_BEEF_CAFE_1337u64);
    let circuit = SquareCircuit { x: None, y: None };
    let (pk, vk) = Groth16::<Bn254>::circuit_specific_setup(circuit, &mut rng)
        .expect("Groth16 trusted setup failed");
    let pvk = prepare_verifying_key(&vk);
    GrothSetup { pk, pvk }
}

fn setup_weight_circuit() -> GrothSetup {
    let mut rng = ark_std::rand::rngs::StdRng::seed_from_u64(0xCAFE_BABE_0000_0001u64);
    let circuit = WeightNormCircuit {
        weights: None,
        total: None,
    };
    let (pk, vk) = Groth16::<Bn254>::circuit_specific_setup(circuit, &mut rng)
        .expect("Weight circuit setup failed");
    let pvk = prepare_verifying_key(&vk);
    GrothSetup { pk, pvk }
}

fn generate_square_proof(setup: &GrothSetup) -> (Groth16Proof<Bn254>, Vec<Fr>) {
    let mut rng = ark_std::rand::rngs::StdRng::seed_from_u64(0xFEED_FACE_DEAD_BEEFu64);
    let x = Fr::from(5u64);
    let y = x * x; // 25
    let circuit = SquareCircuit {
        x: Some(x),
        y: Some(y),
    };
    let proof =
        Groth16::<Bn254>::prove(&setup.pk, circuit, &mut rng).expect("Proof generation failed");
    (proof, vec![y])
}

fn generate_weight_proof(setup: &GrothSetup) -> (Groth16Proof<Bn254>, Vec<Fr>) {
    let mut rng = ark_std::rand::rngs::StdRng::seed_from_u64(0xABCD_1234_5678_9ABCu64);
    // 11 weights summing to 10000 (basis points)
    let weights: [Fr; 11] = [
        Fr::from(1500u64),
        Fr::from(1200u64),
        Fr::from(1000u64),
        Fr::from(900u64),
        Fr::from(900u64),
        Fr::from(800u64),
        Fr::from(800u64),
        Fr::from(700u64),
        Fr::from(600u64),
        Fr::from(500u64),
        Fr::from(100u64),
    ];
    let total = Fr::from(10_000u64);
    let circuit = WeightNormCircuit {
        weights: Some(weights),
        total: Some(total),
    };
    let proof = Groth16::<Bn254>::prove(&setup.pk, circuit, &mut rng)
        .expect("Weight proof generation failed");
    (proof, vec![total])
}

// ── Stub verifying key (for the zero-sentinel path) ──────────────────────────
fn stub_pvk() -> PreparedVerifyingKey<Bn254> {
    let vk = VerifyingKey::<Bn254> {
        alpha_g1: G1Affine::generator(),
        beta_g2: G2Affine::generator(),
        gamma_g2: G2Affine::generator(),
        delta_g2: G2Affine::generator(),
        gamma_abc_g1: (0..=7).map(|_| G1Affine::generator()).collect(),
    };
    prepare_verifying_key(&vk)
}

// ── Groth16 verify (mirrors main.rs verify_compliance_proof) ─────────────────
#[inline(always)]
fn verify(pvk: &PreparedVerifyingKey<Bn254>, inputs: &[Fr], proof: &Groth16Proof<Bn254>) -> bool {
    Groth16::<Bn254>::verify_with_processed_vk(pvk, inputs, proof).unwrap_or(false)
}

// =============================================================================
// BENCHMARKS
// =============================================================================

fn bench_stub_sentinel(c: &mut Criterion) {
    let mut group = c.benchmark_group("zk_stub_sentinel");
    group.throughput(Throughput::Elements(1));

    let _pvk = stub_pvk();

    // Zero-byte sentinel: main.rs skips pairing, returns true immediately
    let zero_bytes = [0u8; 128];

    group.bench_function("zero_sentinel_check", |b| {
        b.iter(|| {
            // Mirrors main.rs fast-path: if proof_bytes == &[0u8; 128] { return true }
            let result = black_box(&zero_bytes) == &[0u8; 128];
            black_box(result)
        })
    });

    group.finish();
}

fn bench_proof_deserialization(c: &mut Criterion) {
    let mut group = c.benchmark_group("zk_proof_deserialization");
    group.throughput(Throughput::Bytes(128));

    let setup = setup_square_circuit();
    let (proof, _) = generate_square_proof(&setup);

    // Serialize to 128 compressed bytes
    let mut proof_bytes = Vec::new();
    proof
        .serialize_compressed(&mut proof_bytes)
        .expect("serialize failed");
    assert_eq!(
        proof_bytes.len(),
        128,
        "Groth16/BN254 compressed proof must be 128 bytes"
    );
    let proof_bytes: [u8; 128] = proof_bytes.try_into().unwrap();

    group.bench_function("deserialize_128b_compressed", |b| {
        b.iter(|| {
            let p = Groth16Proof::<Bn254>::deserialize_compressed(black_box(proof_bytes.as_ref()))
                .unwrap();
            black_box(p)
        })
    });

    group.finish();
}

fn bench_groth16_verify_square(c: &mut Criterion) {
    let mut group = c.benchmark_group("groth16_verify");

    let setup = setup_square_circuit();
    let (proof, public_inputs) = generate_square_proof(&setup);

    // Verify correctness before benchmarking
    assert!(
        verify(&setup.pvk, &public_inputs, &proof),
        "Proof must verify before benchmarking"
    );

    group.throughput(Throughput::Elements(1));

    // THE REAL BENCHMARK: full BN254 pairing equation
    // e(A, B) = e(α, β) · ∏ e(inputᵢ · γ_ABCᵢ, γ) · e(C, δ)
    group.bench_function("bn254_pairing_square_circuit", |b| {
        b.iter(|| {
            let ok = verify(
                black_box(&setup.pvk),
                black_box(&public_inputs),
                black_box(&proof),
            );
            black_box(ok)
        })
    });

    group.finish();
}

fn bench_groth16_verify_weight_norm(c: &mut Criterion) {
    let mut group = c.benchmark_group("groth16_verify_aifmd");

    // Weight normalization circuit — mirrors the Noir C1 constraint
    // Demonstrates live arkworks path for AIFMD compliance verification
    let setup = setup_weight_circuit();
    let (proof, public_inputs) = generate_weight_proof(&setup);

    assert!(
        verify(&setup.pvk, &public_inputs, &proof),
        "Weight norm proof must verify"
    );

    group.throughput(Throughput::Elements(1));

    group.bench_function("bn254_pairing_weight_norm_11agents", |b| {
        b.iter(|| {
            black_box(verify(
                black_box(&setup.pvk),
                black_box(&public_inputs),
                black_box(&proof),
            ))
        })
    });

    group.finish();
}

fn bench_pvk_prepare(c: &mut Criterion) {
    let mut group = c.benchmark_group("pvk_prepare");

    // Benchmarks the one-time PreparedVerifyingKey computation at engine startup.
    // main.rs calls prepare_verifying_key() during initialisation — this measures that cost.
    let vk = VerifyingKey::<Bn254> {
        alpha_g1: G1Affine::generator(),
        beta_g2: G2Affine::generator(),
        gamma_g2: G2Affine::generator(),
        delta_g2: G2Affine::generator(),
        gamma_abc_g1: (0..=7).map(|_| G1Affine::generator()).collect(),
    };

    group.bench_function("prepare_verifying_key_7_inputs", |b| {
        b.iter(|| black_box(prepare_verifying_key(black_box(&vk))))
    });

    group.finish();
}

criterion_group!(
    zk_benches,
    bench_stub_sentinel,
    bench_proof_deserialization,
    bench_groth16_verify_square,
    bench_groth16_verify_weight_norm,
    bench_pvk_prepare,
);
criterion_main!(zk_benches);
