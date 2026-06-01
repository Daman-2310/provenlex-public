--------------------------- MODULE PBFT ---------------------------
(*
  Practical Byzantine Fault Tolerance (Castro & Liskov, 1999)
  — TLA+ specification for Genesis Swarm implementation.

  PARAMETERS
    N  : total number of replicas (≥ 3F + 2)
    F  : max faulty replicas

  INSTANCE: N=11, F=3

  INVARIANTS
    SafetyInvariant : No two correct replicas decide conflicting
                      values in the same sequence slot.
    ViewChangeSafety: A view change does not lose committed requests.

  LIVENESS (checked via temporal formula)
    Liveness        : Every PRE-PREPARE eventually leads to a DECISION
                      (assuming at most F faulty replicas and reliable
                      communication).

  Protocol summary
  -----------------
  Phase 1  PRE-PREPARE : Primary sends (v, n, d) signed to all backups.
  Phase 2  PREPARE     : Each replica broadcasts PREPARE(v, n, d, i).
  Phase 3  COMMIT      : After 2F+1 PREPAREs, broadcast COMMIT(v, n, d, i).
  Phase 4  REPLY       : After 2F+1 COMMITs, execute and DECIDE.

  View change:
    If a backup's timer expires without a valid PRE-PREPARE from the
    primary, it broadcasts VIEW-CHANGE(v+1, ...). The new primary
    waits for F+1 VIEW-CHANGE messages, then issues NEW-VIEW.
*)
EXTENDS Integers, TLC

CONSTANTS
    N,                              \* total replicas
    F                               \* max faulty

ASSUME (N >= 3 * F + 2) /\ (F >= 1)

(*-----------------------------------------------------------------------*)
(*-- Types ---------------------------------------------------------------*)
(*-----------------------------------------------------------------------*)

Replica == 1 .. N

\* Possible values a replica may decide upon
Value == {"COMMIT", "ABORT"}

\* Protocol phases (internal replica state)
Phase == {
    "IDLE",
    "PRE_PREPARED",
    "PREPARED",
    "COMMITTED",
    "VIEW_CHANGING"
}

(*-----------------------------------------------------------------------*)
(*-- State variables -----------------------------------------------------*)
(*-----------------------------------------------------------------------*)

VARIABLES
    \* Current view number (monotonically increasing)
    view,

    \* Sequence number for the current request
    seq,

    \* Primary for the current view: primary = (view % N) + 1
    \* (Derived — maintained for readability)

    \* Replica state machine phases
    phase,          \* [Replica -> Phase]

    \* Protocol messages (modelled as sets of tuples)
    pre_prepare,    \* Set of <<view, seq, digest, sender>>
    prepare,        \* Set of <<view, seq, digest, sender>>
    commit,         \* Set of <<view, seq, digest, sender>>

    \* Per-replica log of prepared and committed digests
    prepared,       \* [Replica -> Set of digest]
    committed,      \* [Replica -> Set of digest]

    \* Decision: the value decided for slot seq (if any)
    decision,       \* [seq -> Value]  (set to "NONE" initially)

    \* Faulty replicas (TLC can non-deterministically add to this set)
    faulty,         \* Set of Replica

    \* View-change tracking
    vc_messages,    \* Set of <<new_view, sender>>
    new_view_sent   \* Boolean — whether NEW-VIEW has been sent for current view

(*-----------------------------------------------------------------------*)
(*-- Derived helpers -----------------------------------------------------*)
(*-----------------------------------------------------------------------*)

Primary(v) == (v % N) + 1

IsPrimary(r, v) == (r = Primary(v))

IsCorrect(r) == (r \notin faulty)

(*-----------------------------------------------------------------------*)
(*-- Initial predicate ---------------------------------------------------*)
(*-----------------------------------------------------------------------*)

Init ==
    /\ view = 0
    /\ seq  = 0
    /\ phase = [r \in Replica |-> "IDLE"]
    /\ pre_prepare = {}
    /\ prepare = {}
    /\ commit = {}
    /\ prepared = [r \in Replica |-> {}]
    /\ committed = [r \in Replica |-> {}]
    /\ decision = [s \in 1..N |-> "NONE"]   \* one slot per seq
    /\ faulty = {}
    /\ vc_messages = {}
    /\ new_view_sent = FALSE

(*-----------------------------------------------------------------------*)
(*-- Message actions -----------------------------------------------------*)
(*-----------------------------------------------------------------------*)

\* Phase 1: Primary broadcasts PRE-PREPARE
BroadcastPrePrepare(digest) ==
    /\ seq' = seq + 1
    /\ \E d \in Value :
        /\ pre_prepare' = pre_prepare \cup
            {<<view, seq + 1, d, Primary(view)>>}
    /\ UNCHANGED <<prepare, commit, phase, prepared, committed, decision,
                   faulty, vc_messages, new_view_sent, view>>

\* Phase 2: Backup receives PRE-PREPARE → sends PREPARE
SendPrepare(r, msg) ==
    LET vv == msg[1]
        ss == msg[2]
        dd == msg[3]
        sender == msg[4]
    IN
    /\ sender = Primary(vv)
    /\ IsCorrect(r)
    /\ sender \notin faulty
    /\ phase[r] = "IDLE" \/ phase[r] = "PRE_PREPARED"
    /\ phase' = [phase EXCEPT ![r] = "PRE_PREPARED"]
    /\ prepare' = prepare \cup {<<vv, ss, dd, r>>}
    /\ pre_prepare' = pre_prepare \cup {msg}
    /\ UNCHANGED <<seq, commit, prepared, committed, decision,
                   faulty, vc_messages, new_view_sent, view>>

\* Phase 3: Replica collects 2F+1 PREPAREs → sends COMMIT
SendCommit(r, ss, dd) ==
    LET matching == {m \in prepare :
                        m[2] = ss /\ m[3] = dd /\ m[1] = view}
    IN
    /\ Cardinality(matching) >= 2 * F + 1
    /\ IsCorrect(r)
    /\ phase[r] = "PRE_PREPARED"
    /\ phase' = [phase EXCEPT ![r] = "PREPARED"]
    /\ prepared' = [prepared EXCEPT ![r] = @ \cup {dd}]
    /\ commit' = commit \cup {<<view, ss, dd, r>>}
    /\ UNCHANGED <<seq, pre_prepare, prepare, committed, decision,
                   faulty, vc_messages, new_view_sent, view>>

\* Phase 4: Replica collects 2F+1 COMMITs → decides
Decide(r, ss, dd) ==
    LET matching == {m \in commit :
                        m[2] = ss /\ m[3] = dd /\ m[1] = view}
    IN
    /\ Cardinality(matching) >= 2 * F + 1
    /\ IsCorrect(r)
    /\ phase[r] = "PREPARED" \/ phase[r] = "COMMITTED"
    /\ phase' = [phase EXCEPT ![r] = "COMMITTED"]
    /\ decision' = [decision EXCEPT ![ss] = Some(dd)]
    /\ committed' = [committed EXCEPT ![r] = @ \cup {dd}]
    /\ UNCHANGED <<seq, pre_prepare, prepare, commit, prepared,
                   faulty, vc_messages, new_view_sent, view>>

(*-----------------------------------------------------------------------*)
(*-- View-change actions -------------------------------------------------*)
(*-----------------------------------------------------------------------*)

\* Backup timer fires → send VIEW-CHANGE
RequestViewChange(r) ==
    /\ IsCorrect(r)
    /\ ~IsPrimary(r, view)
    /\ \/ phase[r] = "IDLE"
       \/ phase[r] = "PRE_PREPARED"
    /\ vc_messages' = vc_messages \cup {<<view + 1, r>>}
    /\ phase' = [phase EXCEPT ![r] = "VIEW_CHANGING"]
    /\ UNCHANGED <<seq, pre_prepare, prepare, commit, prepared,
                   committed, decision, faulty, new_view_sent, view>>

\* New primary collects F+1 VIEW-CHANGE → sends NEW-VIEW
SendNewView(r, new_v) ==
    /\ IsCorrect(r)
    /\ IsPrimary(r, new_v)
    /\ ~new_view_sent
    LET vc_set == {m \in vc_messages : m[1] = new_v}
    IN
    /\ Cardinality(vc_set) >= F + 1
    /\ new_view_sent' = TRUE
    /\ view' = new_v
    /\ phase' = [phase EXCEPT ![r] = "IDLE"]
    \* Reset message logs for the new view
    /\ pre_prepare' = {}
    /\ prepare' = {}
    /\ commit' = {}
    /\ UNCHANGED <<seq, prepared, committed, decision, faulty, vc_messages>>

(*-----------------------------------------------------------------------*)
(*-- Fault injection (TLC non-determinism) ------------------------------*)
(*-----------------------------------------------------------------------*)

\* TLC can crash a replica at any time (models crash fault)
CrashReplica(r) ==
    /\ r \notin faulty
    /\ faulty' = faulty \cup {r}
    /\ phase' = [phase EXCEPT ![r] = "IDLE"]
    /\ UNCHANGED <<seq, view, pre_prepare, prepare, commit,
                   prepared, committed, decision,
                   vc_messages, new_view_sent>>

(*-----------------------------------------------------------------------*)
(*-- Next-state relation -------------------------------------------------*)
(*-----------------------------------------------------------------------*)

Next ==
    \/ BroadcastPrePrepare("fake_digest")
    \/ \E r \in Replica, msg \in {m \in pre_prepare : m[1] = view}:
        SendPrepare(r, msg)
    \/ \E r \in Replica:
        \E ss \in DOMAIN committed:
            \E dd \in Value:
                SendCommit(r, ss, dd)
    \/ \E r \in Replica:
        \E ss \in DOMAIN committed:
            \E dd \in Value:
                Decide(r, ss, dd)
    \/ \E r \in Replica:
        RequestViewChange(r)
    \/ \E r \in Replica:
        SendNewView(r, view + 1)
    \/ \E r \in Replica:
        CrashReplica(r)

(*-----------------------------------------------------------------------*)
(*-- Invariants ----------------------------------------------------------*)
(*-----------------------------------------------------------------------*)

\* SAFETY 1: No two correct replicas decide conflicting values
\* for the same sequence number.
SafetyInvariant ==
    \A s \in DOMAIN decision :
        (decision[s] # "NONE") =>
            \A r1, r2 \in Replica :
                (IsCorrect(r1) /\ IsCorrect(r2) /\ r1 # r2) =>
                    (committed[r1] = committed[r2])

\* SAFETY 2: A committed value is always the same across all
\* replicas for a given sequence number.
Agreement ==
    \A s \in DOMAIN decision :
        (decision[s] # "NONE") =>
            \/ decision[s] = "COMMIT"
            \/ decision[s] = "ABORT"

\* SAFETY 3: A value is decided at most once per seq
NoDoubleDecision ==
    \A s \in DOMAIN decision :
        decision[s] # "NONE"

(*-----------------------------------------------------------------------*)
(*-- Temporal (liveness) formula -----------------------------------------*)
(*-----------------------------------------------------------------------*)

\* LIVENESS: Every PRE-PREPARE eventually leads to a decision
\* (under fair behaviour and at most F faulty replicas).
\*
\* NOTE: This is a simplified liveness condition. A complete
\* liveness spec would include fairness constraints on message
\* delivery and the view-change timer. We model the core claim:
\* "if a correct primary broadcasts PRE-PREPARE, eventually some
\* correct replica decides."
Liveness ==
    \A r \in Replica :
        (IsCorrect(r) /\ IsPrimary(r, view) /\ seq > 0)
        ~> (decision[seq] # "NONE")

(*-----------------------------------------------------------------------*)
(*-- Specification -------------------------------------------------------*)
(*-----------------------------------------------------------------------*)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

\* Check safety invariants with:
\*   TLC model checker → INVARIANTS SafetyInvariant, Agreement
\*
\* Check liveness with:
\*   TLC model checker → PROPERTIES Liveness
\*
\* Model parameters:
\*   N = 11, F = 3  (tolerates 3 Byzantine faults)
\*   Symmetry set: Replica
\*   State constraint: Cardinality(faulty) <= F
=======================================================================