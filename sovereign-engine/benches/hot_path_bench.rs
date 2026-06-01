// =============================================================================
// GENESIS SWARM — HOT PATH MICRO-BENCHMARKS
// benches/hot_path_bench.rs
//
// Benchmarks for every sub-operation on the <5µs compliance SLA critical path:
//   1. AifmdCircuitBreaker::evaluate()   — integer bitmask checks, ~2-4 ns
//   2. CRC-32C integrity stamp           — hardware CRC over 96 bytes, ~10 ns
//   3. CRC-32C integrity verify          — same path, read-only
//   4. TelemetryPacket construction      — stack alloc + field fill
//   5. AgentState atomic field reads     — relaxed loads, false-share-free
//   6. SHA-256 ledger chaining           — 64-byte hash chain link append
//   7. PBFT vote counting (bitmask)      — quorum accumulator loop
//
// Run: cargo bench --bench hot_path_bench
// =============================================================================

#![allow(
    clippy::inconsistent_digit_grouping,
    clippy::redundant_field_names,
    clippy::let_and_return,
    clippy::unit_arg
)]
use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, AtomicU64, AtomicU8, Ordering};

use sha2::{Digest, Sha256};

// ── Constants mirrored from src/main.rs ──────────────────────────────────────
const N_AGENTS: usize = 11;
const BFT_QUORUM: usize = (2 * N_AGENTS) / 3 + 1; // 8
const AIFMD_GROSS_LIMIT_BP: i64 = 30_000;
const AIFMD_NET_LIMIT_BP: i64 = 20_000;
const AIFMD_CONCENTRATION_CAP_BP: i64 = 2_000;
const DORA_CRITICAL_THRESHOLD: i64 = 8_000;
const DORA_HIGH_THRESHOLD: i64 = 6_000;

// ── TelemetryPacket: exactly 128 bytes, 2 cache lines ───────────────────────
#[repr(C, align(64))]
#[derive(Clone)]
struct TelemetryPacket {
    agent_class: u8,
    source_node_id: u8,
    round_number: u32,
    sequence_num: u64,
    timestamp_ns: u64,
    score_fp: i64,
    leverage_gross_bp: i64,
    leverage_net_bp: i64,
    nav_eur_cents: u64,
    concentration_bp: i64,
    proof_commitment: [u8; 32],
    checksum_crc32: u32,
    poison_flag: u8,
    _pad: [u8; 3],
}
const _: () = assert!(std::mem::size_of::<TelemetryPacket>() == 128);

impl TelemetryPacket {
    fn new_clean(agent_class: u8, gross_bp: i64, net_bp: i64, score_fp: i64) -> Self {
        let mut pkt = Self {
            agent_class,
            source_node_id: 0,
            round_number: 1,
            sequence_num: 42,
            timestamp_ns: 1_716_000_000_000_000_000u64,
            score_fp,
            leverage_gross_bp: gross_bp,
            leverage_net_bp: net_bp,
            nav_eur_cents: 100_000_000_00,
            concentration_bp: 1_800,
            proof_commitment: [0u8; 32],
            checksum_crc32: 0,
            poison_flag: 0,
            _pad: [0u8; 3],
        };
        pkt.stamp_checksum();
        pkt
    }

    fn stamp_checksum(&mut self) {
        let bytes = unsafe {
            let ptr = self as *const TelemetryPacket as *const u8;
            std::slice::from_raw_parts(ptr, 96)
        };
        self.checksum_crc32 = crc32fast::hash(bytes);
    }

    fn is_valid(&self) -> bool {
        if self.poison_flag != 0 {
            return false;
        }
        let bytes = unsafe {
            let ptr = self as *const TelemetryPacket as *const u8;
            std::slice::from_raw_parts(ptr, 96)
        };
        crc32fast::hash(bytes) == self.checksum_crc32
    }
}

// ── AgentState: exactly 64 bytes, 1 cache line ──────────────────────────────
#[repr(C, align(64))]
struct AgentState {
    sequence_num: AtomicU64,
    last_score_fp: AtomicI64,
    leverage_gross_bp: AtomicI64,
    leverage_net_bp: AtomicI64,
    last_seen_ns: AtomicU64,
    agent_class: AtomicU8,
    is_anomaly: AtomicBool,
    healthy: AtomicBool,
    breach_flags: AtomicU8,
    bft_round: AtomicU32,
    breach_count: AtomicU32,
    _pad: [u8; 12],
}
const _: () = assert!(std::mem::size_of::<AgentState>() == 64);

impl AgentState {
    fn new_populated(gross_bp: i64, score_fp: i64) -> Self {
        let s = Self {
            sequence_num: AtomicU64::new(99),
            last_score_fp: AtomicI64::new(score_fp),
            leverage_gross_bp: AtomicI64::new(gross_bp),
            leverage_net_bp: AtomicI64::new(gross_bp / 2),
            last_seen_ns: AtomicU64::new(1_716_000_000_000_000_000u64),
            agent_class: AtomicU8::new(5),
            is_anomaly: AtomicBool::new(false),
            healthy: AtomicBool::new(true),
            breach_flags: AtomicU8::new(0),
            bft_round: AtomicU32::new(7),
            breach_count: AtomicU32::new(0),
            _pad: [0u8; 12],
        };
        s
    }
}

// ── AifmdCircuitBreaker (pure integer hot path) ──────────────────────────────
struct AifmdCircuitBreaker {
    gross_limit_bp: i64,
    net_limit_bp: i64,
    concentration_cap_bp: i64,
    dora_critical_fp: i64,
    dora_high_fp: i64,
    total_evaluations: AtomicU64,
    last_breach_ns: AtomicU64,
}

impl AifmdCircuitBreaker {
    const fn new() -> Self {
        Self {
            gross_limit_bp: AIFMD_GROSS_LIMIT_BP,
            net_limit_bp: AIFMD_NET_LIMIT_BP,
            concentration_cap_bp: AIFMD_CONCENTRATION_CAP_BP,
            dora_critical_fp: DORA_CRITICAL_THRESHOLD,
            dora_high_fp: DORA_HIGH_THRESHOLD,
            total_evaluations: AtomicU64::new(0),
            last_breach_ns: AtomicU64::new(0),
        }
    }

    #[inline(always)]
    fn evaluate(&self, pkt: &TelemetryPacket) -> u8 {
        self.total_evaluations.fetch_add(1, Ordering::Relaxed);
        let mut flags: u8 = 0;
        if pkt.leverage_gross_bp > self.gross_limit_bp {
            flags |= 1 << 0;
        }
        if pkt.leverage_net_bp > self.net_limit_bp {
            flags |= 1 << 1;
        }
        if pkt.concentration_bp > self.concentration_cap_bp {
            flags |= 1 << 2;
        }
        if pkt.score_fp >= self.dora_critical_fp {
            flags |= 1 << 3;
        } else if pkt.score_fp >= self.dora_high_fp {
            flags |= 1 << 4;
        }
        if flags != 0 {
            self.last_breach_ns
                .store(pkt.timestamp_ns, Ordering::Release);
        }
        flags
    }
}

static CB: AifmdCircuitBreaker = AifmdCircuitBreaker::new();

// ── LedgerEntry: 64-byte SHA-256 chain node ──────────────────────────────────
#[repr(C, align(64))]
struct LedgerEntry {
    round: u64,
    agent_id: u8,
    breach_flags: u8,
    _gap: [u8; 6],
    gross_bp: i64,
    net_bp: i64,
    prev_hash: [u8; 32],
}
const _: () = assert!(std::mem::size_of::<LedgerEntry>() == 64);

fn sha256_chain_link(prev: &[u8; 32], entry: &LedgerEntry) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(prev);
    h.update(entry.round.to_le_bytes());
    h.update([entry.agent_id, entry.breach_flags]);
    h.update(entry.gross_bp.to_le_bytes());
    h.update(entry.net_bp.to_le_bytes());
    h.finalize().into()
}

// ── PBFT vote-counting accumulator ───────────────────────────────────────────
/// Counts bits set in a u16 vote bitmap (one bit per agent) and checks quorum.
#[inline(always)]
fn quorum_reached(vote_bitmap: u16) -> bool {
    vote_bitmap.count_ones() as usize >= BFT_QUORUM
}

// =============================================================================
// BENCHMARKS
// =============================================================================

fn bench_circuit_breaker(c: &mut Criterion) {
    let mut group = c.benchmark_group("circuit_breaker");
    group.throughput(Throughput::Elements(1));

    // Clean packet — no breaches
    let clean = TelemetryPacket::new_clean(4, 15_000, 10_000, 3_500);
    group.bench_function("evaluate_clean", |b| {
        b.iter(|| black_box(CB.evaluate(black_box(&clean))))
    });

    // Gross-breach packet
    let breach = TelemetryPacket::new_clean(4, 35_000, 10_000, 3_500);
    group.bench_function("evaluate_gross_breach", |b| {
        b.iter(|| black_box(CB.evaluate(black_box(&breach))))
    });

    // All-flags packet
    let all_flags = TelemetryPacket::new_clean(4, 35_000, 25_000, 9_000);
    group.bench_function("evaluate_all_flags", |b| {
        b.iter(|| black_box(CB.evaluate(black_box(&all_flags))))
    });

    group.finish();
}

fn bench_crc32(c: &mut Criterion) {
    let mut group = c.benchmark_group("crc32_integrity");
    group.throughput(Throughput::Bytes(96));

    let mut pkt = TelemetryPacket::new_clean(3, 14_000, 9_000, 2_100);

    group.bench_function("stamp_96_bytes", |b| {
        b.iter(|| black_box(pkt.stamp_checksum()))
    });

    group.bench_function("verify_96_bytes", |b| b.iter(|| black_box(pkt.is_valid())));

    group.finish();
}

fn bench_sha256_chain(c: &mut Criterion) {
    let mut group = c.benchmark_group("ledger_sha256_chain");
    group.throughput(Throughput::Elements(1));

    let prev_hash = [0xABu8; 32];
    let entry = LedgerEntry {
        round: 99,
        agent_id: 5,
        breach_flags: 0b0000_0011,
        _gap: [0u8; 6],
        gross_bp: 14_500,
        net_bp: 9_000,
        prev_hash: prev_hash,
    };

    group.bench_function("chain_link_64b_input", |b| {
        b.iter(|| black_box(sha256_chain_link(black_box(&prev_hash), black_box(&entry))))
    });

    // Also benchmark sequential chaining (simulates ledger append under load)
    group.bench_function("chain_100_sequential", |b| {
        b.iter(|| {
            let mut hash = [0u8; 32];
            for i in 0u64..100 {
                let e = LedgerEntry {
                    round: i,
                    agent_id: (i % 11) as u8,
                    breach_flags: 0,
                    _gap: [0u8; 6],
                    gross_bp: 14_000 + i as i64,
                    net_bp: 9_000,
                    prev_hash: hash,
                };
                hash = sha256_chain_link(&hash, &e);
            }
            black_box(hash)
        })
    });

    group.finish();
}

fn bench_agent_state_reads(c: &mut Criterion) {
    let mut group = c.benchmark_group("agent_state");
    group.throughput(Throughput::Elements(N_AGENTS as u64));

    // 11 agents on separate cache lines (704 bytes total)
    let states: Vec<AgentState> = (0..N_AGENTS)
        .map(|i| AgentState::new_populated(14_000 + i as i64 * 100, 2_500 + i as i64 * 50))
        .collect();

    group.bench_function("scan_11_agents_relaxed", |b| {
        b.iter(|| {
            let mut sum: i64 = 0;
            for s in &states {
                sum = sum.wrapping_add(s.leverage_gross_bp.load(Ordering::Relaxed));
                sum = sum.wrapping_add(s.last_score_fp.load(Ordering::Relaxed));
            }
            black_box(sum)
        })
    });

    group.bench_function("score_f64_11_agents", |b| {
        b.iter(|| {
            let mut sum = 0.0f64;
            for s in &states {
                sum += s.last_score_fp.load(Ordering::Relaxed) as f64 / 100.0;
            }
            black_box(sum)
        })
    });

    group.finish();
}

fn bench_pbft_quorum(c: &mut Criterion) {
    let mut group = c.benchmark_group("pbft_quorum_bitmap");
    group.throughput(Throughput::Elements(1));

    // Quorum exactly reached: 8 of 11 bits set at positions 3–10
    let quorum_bitmap: u16 = 0b0000_1111_1111_1000u16;

    group.bench_function("quorum_check_popcount", |b| {
        b.iter(|| black_box(quorum_reached(black_box(quorum_bitmap))))
    });

    // Simulate accumulating votes one by one until quorum
    group.bench_function("accumulate_until_quorum", |b| {
        b.iter(|| {
            let mut bitmap: u16 = 0;
            for agent_id in 0u16..11 {
                bitmap |= 1 << agent_id;
                if quorum_reached(bitmap) {
                    return black_box(agent_id);
                }
            }
            black_box(10u16)
        })
    });

    group.finish();
}

fn bench_packet_construction(c: &mut Criterion) {
    let mut group = c.benchmark_group("packet_construction");
    group.throughput(Throughput::Elements(1));

    group.bench_function("construct_stamp_128b", |b| {
        b.iter(|| {
            let pkt = TelemetryPacket::new_clean(
                black_box(3u8),
                black_box(14_500i64),
                black_box(9_000i64),
                black_box(2_100i64),
            );
            black_box(pkt)
        })
    });

    group.finish();
}

criterion_group!(
    hot_path,
    bench_circuit_breaker,
    bench_crc32,
    bench_sha256_chain,
    bench_agent_state_reads,
    bench_pbft_quorum,
    bench_packet_construction,
);
criterion_main!(hot_path);
