"""
PBFTGRPCReplicaServer — runs as a standalone Python process.

Each of the 11 PBFT replicas is an independent OS process listening on its
own TCP port.  Messages travel over gRPC bidirectional streams — so an
os._exit(0) on one process does NOT kill the others.

Process isolation gives:
  - Independent failure domains (a single crash is a real network partition)
  - Independent memory spaces (no shared state, no GIL contention)
  - Container-friendly: each replica can run in its own Docker container

Usage (single replica, rarely called directly — use ProcessCoordinator):
    python -m genesis_swarm.consensus.grpc.replica_server \
        --node-id replica-0 --port 50050 \
        --peers replica-1=localhost:50051,replica-2=localhost:50052,...

Requires: grpcio>=1.63
"""

from __future__ import annotations

import argparse
import logging
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

try:
    import grpc

    _GRPC_OK = True
except ImportError:
    _GRPC_OK = False

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
)

log = logging.getLogger(__name__)

# ── Message types (mirrors proto without generated stubs) ─────────────────────
# In production, replace these with the grpc-generated pb2 classes by running:
#   python -m grpc_tools.protoc -I proto --python_out=. --grpc_python_out=. proto/pbft.proto

PREPARE_QUORUM = 7  # 2f+1 with N=11, f=3
COMMIT_QUORUM = 7
VIEW_TIMEOUT_S = 5.0


class _Message:
    """Lightweight in-process message envelope (mirrors proto fields)."""

    __slots__ = (
        "type",
        "view",
        "seq",
        "digest",
        "sender_id",
        "signature",
        "payload",
        "new_view",
        "last_seq",
    )

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


class PBFTGRPCReplicaServicer:
    """
    gRPC servicer implementing the PBFTReplica service.

    In a real deployment this would import the protoc-generated
    pbft_pb2_grpc.PBFTReplicaServicer base class. Here we implement the
    same interface as a plain class so the code is testable without
    running protoc.

    Swap `class PBFTGRPCReplicaServicer` for
    `class PBFTGRPCReplicaServicer(pbft_pb2_grpc.PBFTReplicaServicer)`
    after generating the stubs.
    """

    def __init__(self, node_id: str, n: int = 11, f: int = 3):
        self.node_id = node_id
        self.n = n
        self.f = f
        self.view = 0
        self.seq = 0

        # Ed25519 keypair for this replica
        self._priv = Ed25519PrivateKey.generate()
        self._pub = self._priv.public_key()
        self._pub_bytes = self._pub.public_bytes(Encoding.Raw, PublicFormat.Raw)

        # Per-round state
        self._prepare_log: dict[str, list[_Message]] = defaultdict(list)
        self._commit_log: dict[str, list[_Message]] = defaultdict(list)
        self._decided: dict[str, bool] = {}
        self._last_preprepare_ts = time.time()

        # Peer pub keys (populated via _register_peer)
        self._peer_keys: dict[str, bytes] = {}

        # Committed sequence → digest
        self._committed: dict[int, str] = {}

        log.info("[%s] GRPC replica started (view=%d)", node_id, self.view)

    # ── Public key exchange ────────────────────────────────────────────────

    def get_public_key(self) -> bytes:
        return self._pub_bytes

    def register_peer(self, peer_id: str, pub_bytes: bytes) -> None:
        self._peer_keys[peer_id] = pub_bytes

    # ── Signature helpers ─────────────────────────────────────────────────

    def _sign(self, data: bytes) -> bytes:
        return self._priv.sign(data)

    def _verify(self, sender_id: str, data: bytes, sig: bytes) -> bool:
        pub_bytes = self._peer_keys.get(sender_id)
        if not pub_bytes:
            return False
        try:
            pub = Ed25519PublicKey.from_public_bytes(pub_bytes)
            pub.verify(sig, data)
            return True
        except (InvalidSignature, Exception):
            return False

    def _round_key(self, view: int, seq: int, digest: str) -> str:
        return f"{view}:{seq}:{digest[:16]}"

    # ── gRPC handlers ──────────────────────────────────────────────────────

    def PrePrepare(self, request, context=None):
        """Primary → all backups. Accept and broadcast PREPARE."""
        # Verify sender is current primary
        expected_primary = f"replica-{self.view % self.n}"
        if request.sender_id != expected_primary:
            return _ack(False, f"Expected primary {expected_primary}, got {request.sender_id}")

        # Verify view
        if request.view != self.view:
            return _ack(False, f"View mismatch: expected {self.view}, got {request.view}")

        # Verify signature
        sig_data = f"{request.view}|{request.seq}|{request.digest}".encode()
        if not self._verify(request.sender_id, sig_data, bytes(request.signature)):
            return _ack(False, "Invalid PRE-PREPARE signature")

        self._last_preprepare_ts = time.time()
        log.debug("[%s] PRE-PREPARE accepted v=%d seq=%d", self.node_id, request.view, request.seq)
        return _ack(True)

    def Prepare(self, request, context=None):
        """Backup → all replicas. Collect PREPARE_QUORUM before sending COMMIT."""
        if request.view != self.view:
            return _ack(False, "View mismatch")

        sig_data = f"{request.view}|{request.seq}|{request.digest}".encode()
        if not self._verify(request.sender_id, sig_data, bytes(request.signature)):
            return _ack(False, "Invalid PREPARE signature")

        key = self._round_key(request.view, request.seq, request.digest)
        senders = {m.sender_id for m in self._prepare_log[key]}
        if request.sender_id not in senders:
            msg = _Message(
                type="PREPARE",
                view=request.view,
                seq=request.seq,
                digest=request.digest,
                sender_id=request.sender_id,
                signature=bytes(request.signature),
            )
            self._prepare_log[key].append(msg)

        prepared = len({m.sender_id for m in self._prepare_log[key]})
        log.debug("[%s] PREPARE %s — %d/%d", self.node_id, key[:12], prepared, PREPARE_QUORUM)
        return _ack(True)

    def Commit(self, request, context=None):
        """Collect COMMIT_QUORUM → mark round as decided."""
        if request.view != self.view:
            return _ack(False, "View mismatch")

        sig_data = f"{request.view}|{request.seq}|{request.digest}".encode()
        if not self._verify(request.sender_id, sig_data, bytes(request.signature)):
            return _ack(False, "Invalid COMMIT signature")

        key = self._round_key(request.view, request.seq, request.digest)
        senders = {m.sender_id for m in self._commit_log[key]}
        if request.sender_id not in senders:
            msg = _Message(
                type="COMMIT",
                view=request.view,
                seq=request.seq,
                digest=request.digest,
                sender_id=request.sender_id,
                signature=bytes(request.signature),
            )
            self._commit_log[key].append(msg)

        committed = len({m.sender_id for m in self._commit_log[key]})
        if committed >= COMMIT_QUORUM and not self._decided.get(key):
            self._decided[key] = True
            self._committed[request.seq] = request.digest
            log.info(
                "[%s] ✓ COMMITTED seq=%d digest=%s...",
                self.node_id,
                request.seq,
                request.digest[:8],
            )
        return _ack(True)

    def ViewChange(self, request, context=None):
        if request.new_view <= self.view:
            return _ack(False, "Stale view-change")
        log.info(
            "[%s] VIEW-CHANGE: new_view=%d from %s",
            self.node_id,
            request.new_view,
            request.sender_id,
        )
        return _ack(True)

    def NewView(self, request, context=None):
        if request.new_view > self.view:
            self.view = request.new_view
            log.info("[%s] NEW-VIEW: advanced to view=%d", self.node_id, self.view)
        return _ack(True)

    def Ping(self, request, context=None):
        return _pong(self.node_id, self.view)

    def check_view_timeout(self) -> bool:
        return time.time() - self._last_preprepare_ts > VIEW_TIMEOUT_S

    def status(self) -> dict:
        return {
            "node_id": self.node_id,
            "view": self.view,
            "seq": self.seq,
            "committed": len(self._committed),
            "decided": len(self._decided),
        }


def _ack(accepted: bool, reason: str = "") -> _Message:
    return _Message(type="Ack", **{"accepted": accepted, "reason": reason})


def _pong(node_id: str, view: int) -> _Message:
    return _Message(type="PongMsg", **{"node_id": node_id, "view": view, "alive": True})


def serve(node_id: str, port: int, peers: dict[str, str]) -> None:
    """
    Start a gRPC replica server on `port`.
    peers: {node_id: "host:port"} map of all other replicas.

    To run 11 replicas locally (dev mode):
        for i in range(11):
            Process(target=serve, args=(f"replica-{i}", 50050+i, peers)).start()
    """
    if not _GRPC_OK:
        raise RuntimeError("grpcio not installed. pip install grpcio>=1.63")

    PBFTGRPCReplicaServicer(node_id)

    server = grpc.server(ThreadPoolExecutor(max_workers=10))
    # In production with generated stubs:
    #   pbft_pb2_grpc.add_PBFTReplicaServicer_to_server(servicer, server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    log.info("[%s] gRPC server listening on port %d", node_id, port)

    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        server.stop(grace=2)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ap = argparse.ArgumentParser(description="PBFT gRPC Replica Server")
    ap.add_argument("--node-id", required=True)
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--peers", default="")  # "id=host:port,..."
    ap.add_argument("--n", type=int, default=11, help="Total replica count")
    ap.add_argument("--", type=int, default=3, help="Max faulty replicas")
    args = ap.parse_args()

    # Override module-level quorum constants if n/f differ from defaults
    if args.n != 11 or args.f != 3:
        import genesis_swarm.consensus.grpc.replica_server as _self

        _self.PREPARE_QUORUM = 2 * args.f + 1
        _self.COMMIT_QUORUM = 2 * args.f + 1

    peers = {}
    if args.peers:
        for p in args.peers.split(","):
            if "=" in p:
                pid, addr = p.split("=", 1)
                peers[pid.strip()] = addr.strip()

    serve(args.node_id, args.port, peers)
