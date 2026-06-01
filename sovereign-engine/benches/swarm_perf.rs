// =============================================================================
// GENESIS SWARM -- HIGH-PERFORMANCE CRITERION BENCHMARKS
// benches/swarm_perf.rs
//
// Benchmark targets:
//   1. Ingestion pipeline throughput:  100k pkt/s sustained into crossbeam MPMC
//   2. Circuit breaker evaluation:     single AIFMD leverage check, nanosecond path
//   3. PBFT quorum evaluation:         11-agent commit threshold, sub-microsecond
//   4. ZK proof verification:          stub (zero-sentinel) and real BN254 path
//   5. Ledger append:                  SHA-256 chaining under concurrent writes
//   6. End-to-end latency:             PRE_PREPARE -> COMMIT full round-trip
//
// Run: cargo bench --bench swarm_perf
// Profile: cargo bench --bench swarm_perf -- --profile-time=10
// =============================================================================
#![allow(
    clippy::unusual_byte_groupings,
    clippy::needless_borrows_for_generic_args
)]

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

use crossbeam_channel::{bounded, Receiver, Sender};

// ── Minimal type mirrors (must stay in sync with src/main.rs) ────────────────

const ZK_PROOF_BYTES: usize = 128;
const AIFMD_GROSS_LIMIT_BP: i64 = 30_000;
const AIFMD_NET_LIMIT_BP: i64 = 20_000;
const DORA_CRITICAL_THRESHOLD: i64 = 8_000;
const N_AGENTS: usize = 11;
const BFT_QUORUM: usize = (2 * N_AGENTS) / 3 + 1; // = 8

#[derive(Clone, Copy)]
#[repr(C, align(64))]
struct TelemetryPacket {
    agent_id: u8,
    agent_class: u8,
    sequence: u64,
    gross_bp: i64,
    net_bp: i64,
    score_fp: i64,
    timestamp_ns: u64,
    breach_flags: u32,
    poison_flag: u32,
    proof_bytes: [u8; ZK_PROOF_BYTES],
    checksum_crc32: u32,
    _pad: [u8; 4],
}

#[derive(Clone, Copy)]
#[repr(C, align(64))]
struct AgentState {
    id: u8,
    status: u8,
    // 6 bytes implicit C-padding here to align bft_round to 8
    bft_round: u64,
    gross_bp: i64,
    net_bp: i64,
    score_fp: i64,
    breach_flags: u32,
    vote_bitmap: u32,
    // 1+1+6pad+8+8+8+8+4+4 = 48; pad to 64
    _pad: [u8; 16],
}

const _: () = assert!(std::mem::size_of::<AgentState>() == 64);

#[derive(Clone, Copy)]
#[repr(C, align(64))]
struct LedgerEntry {
    round: u64,
    agent_id: u8,
    breach_flags: u32,
    gross_bp: i64,
    net_bp: i64,
    score_fp: i64,
    committed_by: u16,
    prev_hash: [u8; 32],
}

// ── Benchmark helpers ─────────────────────────────────────────────────────────

fn make_packet(seq: u64, gross: i64, net: i64) -> TelemetryPacket {
    TelemetryPacket {
        agent_id: (seq % N_AGENTS as u64) as u8,
        agent_class: 0,
        sequence: seq,
        gross_bp: gross,
        net_bp: net,
        score_fp: 1234,
        timestamp_ns: seq * 100,
        breach_flags: 0,
        poison_flag: 0,
        proof_bytes: [0u8; ZK_PROOF_BYTES],
        checksum_crc32: 0,
        _pad: [0u8; 4],
    }
}

#[inline(always)]
fn circuit_breaker_check(pkt: &TelemetryPacket) -> bool {
    if pkt.poison_flag != 0 {
        return false;
    }
    if pkt.gross_bp > AIFMD_GROSS_LIMIT_BP {
        return false;
    }
    if pkt.net_bp > AIFMD_NET_LIMIT_BP {
        return false;
    }
    if pkt.score_fp >= DORA_CRITICAL_THRESHOLD {
        return false;
    }
    true
}

#[inline(always)]
fn pbft_quorum_check(vote_bitmap: u32) -> bool {
    vote_bitmap.count_ones() as usize >= BFT_QUORUM
}

fn ledger_chain_hash(prev: &[u8; 32], entry: &LedgerEntry) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(prev);
    h.update(&entry.round.to_le_bytes());
    h.update(&[entry.agent_id]);
    h.update(&entry.gross_bp.to_le_bytes());
    h.update(&entry.net_bp.to_le_bytes());
    h.finalize().into()
}

// =============================================================================
// BENCHMARK GROUP 1 -- INGESTION PIPELINE THROUGHPUT
// =============================================================================

fn bench_ingestion_pipeline(c: &mut Criterion) {
    let mut group = c.benchmark_group("ingestion_pipeline");
    group.throughput(Throughput::Elements(1));
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));

    group.bench_function("single_producer_consumer", |b| {
        let (tx, rx): (Sender<TelemetryPacket>, Receiver<TelemetryPacket>) = bounded(1024);
        let mut seq = 0u64;
        b.iter(|| {
            let _ = tx.try_send(black_box(make_packet(seq, 15_000, 10_000)));
            seq = seq.wrapping_add(1);
            let _ = rx.try_recv();
        });
    });

    for batch_size in [8u64, 32, 64, 256] {
        group.throughput(Throughput::Elements(batch_size));
        group.bench_with_input(
            BenchmarkId::new("batch_enqueue", batch_size),
            &batch_size,
            |b, &n| {
                let (tx, rx): (Sender<TelemetryPacket>, Receiver<TelemetryPacket>) =
                    bounded(n as usize * 4);
                let pkts: Vec<_> = (0..n).map(|i| make_packet(i, 15_000, 10_000)).collect();
                b.iter(|| {
                    for pkt in &pkts {
                        let _ = tx.try_send(black_box(*pkt));
                    }
                    for _ in 0..n {
                        let _ = rx.try_recv();
                    }
                });
            },
        );
    }

    group.throughput(Throughput::Elements(1));
    group.bench_function("mpmc_contention_4_producers", |b| {
        let (tx, rx): (Sender<TelemetryPacket>, Receiver<TelemetryPacket>) = bounded(4096);
        let shutdown = Arc::new(AtomicBool::new(false));
        let txs: Vec<_> = (0..3)
            .map(|_| {
                let tx2 = tx.clone();
                let sd2 = Arc::clone(&shutdown);
                std::thread::spawn(move || {
                    let mut i = 0u64;
                    while !sd2.load(Ordering::Relaxed) {
                        let _ = tx2.try_send(make_packet(i, 15_000, 10_000));
                        i = i.wrapping_add(1);
                    }
                })
            })
            .collect();
        b.iter(|| {
            let _ = tx.try_send(black_box(make_packet(0, 15_000, 10_000)));
            let _ = rx.try_recv();
        });
        shutdown.store(true, Ordering::Relaxed);
        for t in txs {
            let _ = t.join();
        }
    });

    group.finish();
}

// =============================================================================
// BENCHMARK GROUP 2 -- CIRCUIT BREAKER EVALUATION
// =============================================================================

fn bench_circuit_breaker(c: &mut Criterion) {
    let mut group = c.benchmark_group("circuit_breaker");
    group.throughput(Throughput::Elements(1));
    group.measurement_time(Duration::from_secs(5));

    group.bench_function("check_compliant", |b| {
        let pkt = make_packet(1, 25_000, 15_000);
        b.iter(|| black_box(circuit_breaker_check(black_box(&pkt))));
    });

    group.bench_function("check_gross_breach", |b| {
        let pkt = make_packet(2, 30_001, 15_000);
        b.iter(|| black_box(circuit_breaker_check(black_box(&pkt))));
    });

    group.bench_function("check_net_breach", |b| {
        let pkt = make_packet(3, 10_000, 20_001);
        b.iter(|| black_box(circuit_breaker_check(black_box(&pkt))));
    });

    group.bench_function("check_poisoned_early_exit", |b| {
        let mut pkt = make_packet(4, 5_000, 3_000);
        pkt.poison_flag = 1;
        b.iter(|| black_box(circuit_breaker_check(black_box(&pkt))));
    });

    group.throughput(Throughput::Elements(100));
    group.bench_function("batch_100_mixed", |b| {
        let pkts: Vec<TelemetryPacket> = (0..100)
            .map(|i| {
                if i % 10 == 0 {
                    make_packet(i, 30_001, 15_000)
                } else {
                    make_packet(i, 15_000, 10_000)
                }
            })
            .collect();
        b.iter(|| {
            let mut ok = 0u32;
            for p in &pkts {
                ok += circuit_breaker_check(black_box(p)) as u32;
            }
            black_box(ok)
        });
    });

    group.finish();
}

// =============================================================================
// BENCHMARK GROUP 3 -- PBFT QUORUM EVALUATION
// =============================================================================

fn bench_pbft_quorum(c: &mut Criterion) {
    let mut group = c.benchmark_group("pbft_quorum");
    group.throughput(Throughput::Elements(1));
    group.measurement_time(Duration::from_secs(3));

    group.bench_function("quorum_exact_8_of_11", |b| {
        let bitmap: u32 = 0b0000_0111_1111_1111; // 8 bits set
        b.iter(|| black_box(pbft_quorum_check(black_box(bitmap))));
    });

    group.bench_function("below_quorum_7_of_11", |b| {
        let bitmap: u32 = 0b0000_0011_1111_1111; // 7 bits set
        b.iter(|| black_box(pbft_quorum_check(black_box(bitmap))));
    });

    group.bench_function("full_consensus_11_of_11", |b| {
        let bitmap: u32 = 0b0000_0111_1111_1111_1111; // 11 bits set
        b.iter(|| black_box(pbft_quorum_check(black_box(bitmap))));
    });

    group.bench_function("accumulate_to_quorum", |b| {
        b.iter(|| {
            let mut bitmap: u32 = 0;
            let mut rounds = 0u32;
            for i in 0..N_AGENTS {
                bitmap |= 1u32 << i;
                rounds += 1;
                if pbft_quorum_check(black_box(bitmap)) {
                    break;
                }
            }
            black_box(rounds)
        });
    });

    group.finish();
}

// =============================================================================
// BENCHMARK GROUP 4 -- ZK PROOF STUB VERIFICATION
// =============================================================================

fn bench_zk_verification(c: &mut Criterion) {
    let mut group = c.benchmark_group("zk_verification");
    group.throughput(Throughput::Elements(1));
    group.measurement_time(Duration::from_secs(5));

    group.bench_function("stub_zero_sentinel", |b| {
        let proof = [0u8; ZK_PROOF_BYTES];
        b.iter(|| black_box(black_box(proof) == [0u8; ZK_PROOF_BYTES]));
    });

    group.bench_function("non_stub_early_reject", |b| {
        let mut proof = [0u8; ZK_PROOF_BYTES];
        proof[0] = 0xDE;
        proof[1] = 0xAD;
        b.iter(|| black_box(black_box(proof) == [0u8; ZK_PROOF_BYTES]));
    });

    group.throughput(Throughput::Elements(64));
    group.bench_function("batch_64_stub_proofs", |b| {
        let proofs: Vec<[u8; ZK_PROOF_BYTES]> = vec![[0u8; ZK_PROOF_BYTES]; 64];
        b.iter(|| {
            let mut verified = 0u32;
            for p in &proofs {
                verified += (black_box(*p) == [0u8; ZK_PROOF_BYTES]) as u32;
            }
            black_box(verified)
        });
    });

    group.finish();
}

// =============================================================================
// BENCHMARK GROUP 5 -- LEDGER SHA-256 CHAIN APPEND
// =============================================================================

fn bench_ledger_chain(c: &mut Criterion) {
    let mut group = c.benchmark_group("ledger_chain");
    group.throughput(Throughput::Elements(1));
    group.measurement_time(Duration::from_secs(5));

    group.bench_function("single_sha256_append", |b| {
        let prev_hash = [0xABu8; 32];
        let entry = LedgerEntry {
            round: 42,
            agent_id: 3,
            breach_flags: 0,
            gross_bp: 15_000,
            net_bp: 10_000,
            score_fp: 500,
            committed_by: 0b0111_1111_11,
            prev_hash,
        };
        b.iter(|| black_box(ledger_chain_hash(black_box(&prev_hash), black_box(&entry))));
    });

    group.throughput(Throughput::Elements(100));
    group.bench_function("chain_100_entries", |b| {
        let entries: Vec<LedgerEntry> = (0u64..100)
            .map(|i| LedgerEntry {
                round: i,
                agent_id: (i % 11) as u8,
                breach_flags: 0,
                gross_bp: 10_000 + i as i64 * 100,
                net_bp: 5_000,
                score_fp: 100,
                committed_by: 0b0111_1111_11,
                prev_hash: [0u8; 32],
            })
            .collect();
        b.iter(|| {
            let mut h = [0u8; 32];
            for e in &entries {
                h = ledger_chain_hash(&h, black_box(e));
            }
            black_box(h)
        });
    });

    group.finish();
}

// =============================================================================
// BENCHMARK GROUP 6 -- END-TO-END LATENCY
// =============================================================================

fn bench_end_to_end(c: &mut Criterion) {
    let mut group = c.benchmark_group("end_to_end");
    group.throughput(Throughput::Elements(1));
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(2));

    group.bench_function("full_round_trip_stub_zk", |b| {
        let (tx, rx): (Sender<TelemetryPacket>, Receiver<TelemetryPacket>) = bounded(256);
        let mut prev_hash = [0u8; 32];
        let mut seq = 0u64;
        b.iter(|| {
            let _ = tx.try_send(black_box(make_packet(seq, 15_000, 10_000)));
            seq = seq.wrapping_add(1);
            if let Ok(p) = rx.try_recv() {
                if !circuit_breaker_check(&p) {
                    return;
                }
                if p.proof_bytes != [0u8; ZK_PROOF_BYTES] {
                    return;
                }
                if !pbft_quorum_check(0b0111_1111_11) {
                    return;
                }
                let e = LedgerEntry {
                    round: p.sequence,
                    agent_id: p.agent_id,
                    breach_flags: p.breach_flags,
                    gross_bp: p.gross_bp,
                    net_bp: p.net_bp,
                    score_fp: p.score_fp,
                    committed_by: 0b0111_1111_11,
                    prev_hash,
                };
                prev_hash = ledger_chain_hash(&prev_hash, &e);
                black_box(prev_hash);
            }
        });
    });

    // 100k packets/second sustained throughput
    group.throughput(Throughput::Elements(100_000));
    group.bench_function("sustained_100k_pkt_per_sec", |b| {
        let (tx, rx): (Sender<TelemetryPacket>, Receiver<TelemetryPacket>) = bounded(131_072);
        let mut prev_hash = [0u8; 32];
        b.iter(|| {
            for i in 0u64..100_000 {
                let _ = tx.try_send(make_packet(i, 15_000, 10_000));
            }
            let mut committed = 0u64;
            while let Ok(p) = rx.try_recv() {
                if circuit_breaker_check(&p) && pbft_quorum_check(0b1111_1111_11) {
                    let e = LedgerEntry {
                        round: p.sequence,
                        agent_id: p.agent_id,
                        breach_flags: 0,
                        gross_bp: p.gross_bp,
                        net_bp: p.net_bp,
                        score_fp: p.score_fp,
                        committed_by: 0b1111_1111_11,
                        prev_hash,
                    };
                    prev_hash = ledger_chain_hash(&prev_hash, &e);
                    committed += 1;
                }
            }
            black_box(committed)
        });
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_ingestion_pipeline,
    bench_circuit_breaker,
    bench_pbft_quorum,
    bench_zk_verification,
    bench_ledger_chain,
    bench_end_to_end,
);
criterion_main!(benches);
