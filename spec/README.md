# Formal Specification — PBFT Consensus

## Contents

- `PBFT.tla` — TLA+ specification of the Practical Byzantine Fault
  Tolerance protocol used by Genesis Swarm.

## Model parameters

| Parameter | Genesis Swarm value | Description |
|-----------|-------------------|-------------|
| N | 11 | Total replicas |
| F | 3 | Max Byzantine/crash faults tolerated |

## Invariants checked

| Invariant | Property | Status |
|-----------|----------|--------|
| `SafetyInvariant` | No two correct replicas decide conflicting values | ✅ Checked |
| `Agreement` | Every decided value is either COMMIT or ABORT | ✅ Checked |
| `NoDoubleDecision` | Each sequence slot is decided at most once | ✅ Checked |

## How to run

1. Install the [TLA+ Toolbox](https://lamport.azurewebsites.net/tla/toolbox.html)
   or use the command-line `tlc` tool.
2. Open `PBFT.tla` in the TLA+ Toolbox.
3. Create a model with:
   - N = 11, F = 3
   - Symmetry set: `Replica`
   - State constraint: `Cardinality(faulty) <= F`
   - Invariants: `SafetyInvariant`, `Agreement`, `NoDoubleDecision`
4. Run TLC model checker.

Expected result: No invariant violations found (all checked states pass).

## Relation to implementation

The TLA+ spec models the same protocol implemented in
`src/genesis_swarm/consensus/pbft_consensus.py`:

| TLA+ action | Implementation method |
|-------------|----------------------|
| `BroadcastPrePrepare` | `_execute_round` Phase 1 |
| `SendPrepare` | Replica `_handle_pre_prepare` → returns PREPARE |
| `SendCommit` | Replica `_handle_prepare` → returns COMMIT |
| `Decide` | Replica `_handle_commit` → returns REPLY |
| `RequestViewChange` | Replica `check_view_timeout` |
| `SendNewView` | Primary view rotation logic |

## Design decisions

- **N=11, F=3**: Tolerates any combination of 3 faulty nodes.
  Prepare and commit quorums: 2F+1 = 7.
- **View-change**: Each backup fires a timer on primary silence;
  F+1 VIEW-CHANGE messages trigger a new primary.
- **No message authentication in spec**: The implementation adds
  Ed25519 signing on top of this model.
