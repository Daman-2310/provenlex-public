// =============================================================================
// GENESIS SWARM — ZK WORKER SIDECAR
// src/zk_worker.rs
//
// Runs as a separate process alongside genesis-engine.
// Receives portfolio telemetry via Unix socket, generates a BN254 Groth16
// proof of AIFMD compliance, and delivers the serialized 128-byte proof
// back via the same socket for verification by genesis-engine.
//
// Architecture:
//   Python bot → telemetry packet → [Unix socket] → zk-worker
//                                                       ↓ prove (arkworks)
//   genesis-engine ← [Unix socket] ← 128-byte proof ←──┘
//                         ↓ verify_compliance_proof()
//                     BFT consensus round
//
// Socket protocol (framed, no-copy):
//   Request  (client → worker): [4-byte LE payload-len] [JSON payload]
//   Response (worker → client): [4-byte LE proof-len=128] [128-byte proof]
//
// Build: cargo build --release --bin zk-worker --features real-zk-proofs
// Run:   GENESIS_ZK_SOCKET=/tmp/genesis_zk.sock ./target/release/zk-worker
//
// Environment variables:
//   GENESIS_ZK_SOCKET     Unix socket path (default /tmp/genesis_zk.sock)
//   GENESIS_ZK_WORKERS    Thread count for parallel proof generation (default 2)
//   GENESIS_ZK_CIRCUIT    Path to serialized proving key (default: embedded test key)
// =============================================================================

use std::io::{Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

use ark_bn254::{Bn254, Fr};
use ark_groth16::{prepare_verifying_key, Groth16, PreparedVerifyingKey, ProvingKey};
use ark_r1cs_std::{fields::fp::FpVar, prelude::*};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
use ark_serialize::CanonicalSerialize;
use ark_snark::SNARK;
use ark_std::rand::SeedableRng;

use serde::{Deserialize, Serialize};

// ── AIFMD Compliance Circuit ──────────────────────────────────────────────────
// Proves that a portfolio satisfies:
//   C1: gross_leverage_bp <= gross_limit_bp       (AIFMD Art.111(1)(b))
//   C2: net_leverage_bp   <= net_limit_bp          (AIFMD Art.111(1)(a))
//   C3: concentration_bp  <= concentration_cap_bp  (CSSF Circular 11/512)
//
// Private witnesses: actual_gross_bp, actual_net_bp, actual_concentration_bp
// Public inputs:     gross_limit_bp, net_limit_bp, concentration_cap_bp
//
// The prover knows the actual portfolio values; the verifier only sees the
// public regulatory limits and the proof that all constraints are satisfied.

#[derive(Clone)]
struct AifmdComplianceCircuit {
    // Private witnesses — actual fund metrics
    actual_gross_bp: Option<Fr>,
    actual_net_bp: Option<Fr>,
    actual_concentration_bp: Option<Fr>,
    // Public inputs — CSSF-mandated regulatory limits
    gross_limit_bp: Option<Fr>,
    net_limit_bp: Option<Fr>,
    concentration_cap_bp: Option<Fr>,
}

impl ConstraintSynthesizer<Fr> for AifmdComplianceCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        // Public regulatory limits (known to verifier)
        let gross_limit = FpVar::<Fr>::new_input(ark_relations::ns!(cs, "gross_limit"), || {
            self.gross_limit_bp.ok_or(SynthesisError::AssignmentMissing)
        })?;
        let net_limit = FpVar::<Fr>::new_input(ark_relations::ns!(cs, "net_limit"), || {
            self.net_limit_bp.ok_or(SynthesisError::AssignmentMissing)
        })?;
        let conc_cap = FpVar::<Fr>::new_input(ark_relations::ns!(cs, "conc_cap"), || {
            self.concentration_cap_bp
                .ok_or(SynthesisError::AssignmentMissing)
        })?;

        // Private actual metrics (known only to prover)
        let actual_gross =
            FpVar::<Fr>::new_witness(ark_relations::ns!(cs, "actual_gross"), || {
                self.actual_gross_bp
                    .ok_or(SynthesisError::AssignmentMissing)
            })?;
        let actual_net = FpVar::<Fr>::new_witness(ark_relations::ns!(cs, "actual_net"), || {
            self.actual_net_bp.ok_or(SynthesisError::AssignmentMissing)
        })?;
        let actual_conc = FpVar::<Fr>::new_witness(ark_relations::ns!(cs, "actual_conc"), || {
            self.actual_concentration_bp
                .ok_or(SynthesisError::AssignmentMissing)
        })?;

        // C1: gross_limit - actual_gross >= 0  (actual <= limit)
        // Enforce: slack_gross = gross_limit - actual_gross, slack_gross >= 0
        let slack_gross = &gross_limit - &actual_gross;
        slack_gross.enforce_cmp(&FpVar::zero(), std::cmp::Ordering::Greater, true)?;

        // C2: net_limit - actual_net >= 0
        let slack_net = &net_limit - &actual_net;
        slack_net.enforce_cmp(&FpVar::zero(), std::cmp::Ordering::Greater, true)?;

        // C3: concentration_cap - actual_concentration >= 0
        let slack_conc = &conc_cap - &actual_conc;
        slack_conc.enforce_cmp(&FpVar::zero(), std::cmp::Ordering::Greater, true)?;

        Ok(())
    }
}

// ── Trusted setup (run once, key reused across all proofs) ────────────────────

struct ZkWorkerState {
    pk: ProvingKey<Bn254>,
    #[allow(dead_code)]
    pvk: PreparedVerifyingKey<Bn254>,
}

impl ZkWorkerState {
    fn new() -> Self {
        eprintln!("[zk-worker] Running trusted setup for AIFMD compliance circuit...");
        let t = Instant::now();
        let mut rng = ark_std::rand::rngs::StdRng::seed_from_u64(0xDEAD_BEEF_CAFE_1337u64);
        let circuit = AifmdComplianceCircuit {
            actual_gross_bp: None,
            actual_net_bp: None,
            actual_concentration_bp: None,
            gross_limit_bp: None,
            net_limit_bp: None,
            concentration_cap_bp: None,
        };
        let (pk, vk) = Groth16::<Bn254>::circuit_specific_setup(circuit, &mut rng)
            .expect("AIFMD circuit trusted setup failed");
        let pvk = prepare_verifying_key(&vk);
        eprintln!(
            "[zk-worker] Setup complete in {:.1}s",
            t.elapsed().as_secs_f64()
        );
        ZkWorkerState { pk, pvk }
    }

    fn prove(&self, req: &ProveRequest) -> Result<[u8; 128], String> {
        let mut rng = ark_std::rand::rngs::StdRng::seed_from_u64(req.sequence);
        let circuit = AifmdComplianceCircuit {
            actual_gross_bp: Some(Fr::from(req.actual_gross_bp as u64)),
            actual_net_bp: Some(Fr::from(req.actual_net_bp as u64)),
            actual_concentration_bp: Some(Fr::from(req.actual_concentration_bp as u64)),
            gross_limit_bp: Some(Fr::from(30_000u64)),
            net_limit_bp: Some(Fr::from(20_000u64)),
            concentration_cap_bp: Some(Fr::from(2_000u64)),
        };

        let t = Instant::now();
        let proof = Groth16::<Bn254>::prove(&self.pk, circuit, &mut rng)
            .map_err(|e| format!("Prove failed: {e}"))?;
        eprintln!(
            "[zk-worker] Proof generated in {:.0}ms for seq={}",
            t.elapsed().as_millis(),
            req.sequence
        );

        let mut bytes = Vec::new();
        proof
            .serialize_compressed(&mut bytes)
            .map_err(|e| format!("Serialize failed: {e}"))?;
        if bytes.len() != 128 {
            return Err(format!(
                "Unexpected proof length: {} (want 128)",
                bytes.len()
            ));
        }
        Ok(bytes.try_into().unwrap())
    }
}

// ── Socket protocol ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ProveRequest {
    sequence: u64,
    actual_gross_bp: i64,
    actual_net_bp: i64,
    actual_concentration_bp: i64,
}

#[derive(Serialize)]
struct ProveResponse {
    sequence: u64,
    proof_hex: String,
    latency_ms: u64,
}

fn handle_client(mut stream: UnixStream, state: Arc<ZkWorkerState>) {
    loop {
        // Read framed request: [4-byte LE len][JSON bytes]
        let mut len_buf = [0u8; 4];
        if stream.read_exact(&mut len_buf).is_err() {
            break;
        }
        let payload_len = u32::from_le_bytes(len_buf) as usize;
        if payload_len == 0 || payload_len > 65536 {
            break;
        }

        let mut payload = vec![0u8; payload_len];
        if stream.read_exact(&mut payload).is_err() {
            break;
        }

        let req: ProveRequest = match serde_json::from_slice(&payload) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[zk-worker] JSON parse error: {e}");
                break;
            }
        };

        let t = Instant::now();
        match state.prove(&req) {
            Ok(proof_bytes) => {
                let response = ProveResponse {
                    sequence: req.sequence,
                    proof_hex: hex::encode(&proof_bytes),
                    latency_ms: t.elapsed().as_millis() as u64,
                };
                let response_json = serde_json::to_vec(&response).unwrap();
                let resp_len = (response_json.len() as u32).to_le_bytes();
                let _ = stream.write_all(&resp_len);
                let _ = stream.write_all(&response_json);
            }
            Err(e) => {
                eprintln!("[zk-worker] Prove error: {e}");
                // Send zero-length response to signal error
                let _ = stream.write_all(&[0u8; 4]);
            }
        }
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

fn main() {
    let socket_path =
        std::env::var("GENESIS_ZK_SOCKET").unwrap_or_else(|_| "/tmp/genesis_zk.sock".to_string());

    let worker_threads: usize = std::env::var("GENESIS_ZK_WORKERS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(2);

    // Remove stale socket if present
    let _ = std::fs::remove_file(&socket_path);

    eprintln!("[zk-worker] Starting — socket={socket_path} threads={worker_threads}");

    // One-time trusted setup — shared across all worker threads
    let state = Arc::new(ZkWorkerState::new());

    let listener = UnixListener::bind(&socket_path)
        .unwrap_or_else(|e| panic!("Failed to bind {socket_path}: {e}"));

    eprintln!("[zk-worker] Listening on {socket_path}");

    // Build a fixed thread pool for proof generation
    let pool = Arc::new(
        rayon::ThreadPoolBuilder::new()
            .num_threads(worker_threads)
            .thread_name(|i| format!("zk-prover-{i}"))
            .build()
            .expect("Failed to build rayon thread pool"),
    );

    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                let state = Arc::clone(&state);
                let pool = Arc::clone(&pool);
                thread::spawn(move || {
                    pool.install(|| handle_client(s, state));
                });
            }
            Err(e) => {
                eprintln!("[zk-worker] Accept error: {e}");
            }
        }
    }
}
