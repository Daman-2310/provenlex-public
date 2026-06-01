"""
Cognitive Chameleon Transport — Censorship & Partition-Evasion Networking.

ChameleonTransport wraps four protocol backends and switches between them
in real time based on live health telemetry from ProtocolProbe.  The
consensus engine sees a single PBFTTransport interface and never needs to
know which physical transport is active.

Protocol priority ladder
------------------------
  1. WebSocket / TLS 1.3  (tier=1)  — lowest latency, preferred
  2. libp2p overlay        (tier=2)  — P2P circuit relay, NAT traversal
  3. WireGuard mesh        (tier=3)  — encrypted UDP, DPI-resistant
  4. Tor SOCKS5 onion      (tier=4)  — maximum censorship resistance

Health scoring (ProtocolProbe, every 10 s)
------------------------------------------
Each backend is probed by sending 3 synthetic HEARTBEAT envelopes and
measuring round-trip latency.  A backend is considered degraded when:
  • loss_rate  > 0.20  (>20% probes lost)
  • p99_latency > 2000 ms
  • consecutive_failures ≥ 2

Downgrade fires immediately when the active tier is degraded.
Upgrade is guarded by PROMOTION_WINDOW_S = 120 s of clean probes
(hysteresis prevents flapping).

Backend availability
--------------------
  WebSocket  — always attempted; fails gracefully if peer unreachable
  libp2p     — requires `genesis-libp2p` binary in PATH and env var
               GENESIS_LIBP2P_BIN; communicates over a Unix socket IPC
  WireGuard  — requires `wgconfig` Python package; Linux kernel ≥ 5.6
  Tor onion  — requires Tor daemon on 127.0.0.1:9050; peer .onion
               addresses configured via `onion_addrs` constructor arg

All backends degrade gracefully: missing binary / package / daemon logs a
warning and marks that tier unavailable without crashing the transport.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import socket
import time
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any, Callable, Optional

from ..consensus.transport import (
    MsgType,
    PBFTEnvelope,
    PBFTTransport,
)

log = logging.getLogger(__name__)

# ── Tuning constants ──────────────────────────────────────────────────────────

_PROBE_INTERVAL_S: float = 10.0
_LOSS_THRESHOLD: float = 0.20
_LATENCY_THRESHOLD_MS: float = 2000.0
_PROMOTION_WINDOW_S: float = 120.0
_PROBE_COUNT: int = 3
_SEND_TIMEOUT_S: float = 8.0


# ── Protocol tier ordering ────────────────────────────────────────────────────

class ProtocolTier(IntEnum):
    WEBSOCKET = 1
    LIBP2P = 2
    WIREGUARD = 3
    ONION = 4


@dataclass
class ProtocolHealth:
    tier: ProtocolTier
    available: bool = True
    loss_rate: float = 0.0
    latency_ms: float = 0.0
    consecutive_failures: int = 0
    last_healthy_ts: float = field(default_factory=time.time)

    def is_degraded(self) -> bool:
        return (
            not self.available
            or self.loss_rate > _LOSS_THRESHOLD
            or self.latency_ms > _LATENCY_THRESHOLD_MS
            or self.consecutive_failures >= 2
        )

    def is_promotable(self) -> bool:
        return (
            self.available
            and not self.is_degraded()
            and (time.time() - self.last_healthy_ts) >= _PROMOTION_WINDOW_S
        )

    def score(self) -> float:
        if not self.available:
            return 0.0
        lat_penalty = min(1.0, self.latency_ms / _LATENCY_THRESHOLD_MS)
        return max(0.0, 1.0 - self.loss_rate - lat_penalty)


# ── WebSocket backend ─────────────────────────────────────────────────────────

class _WebSocketBackend:
    """
    Thin async wrapper around the existing WebSocketTransport.
    Imported lazily to avoid circular imports at module load time.
    """

    def __init__(self, node_id: str, ws_peers: dict[str, str]) -> None:
        self._node_id = node_id
        self._ws_peers = ws_peers
        self._transport: Any = None
        self.available = True

    async def start(self) -> None:
        if not self._ws_peers:
            log.warning("[Chameleon/WS] No WebSocket peers configured")
            self.available = False
            return
        try:
            from ..consensus.grpc.pbft_transport import WebSocketTransport  # type: ignore
            self._transport = WebSocketTransport(
                node_id=self._node_id,
                peers=self._ws_peers,
            )
            await self._transport.start()
        except Exception as exc:
            log.warning("[Chameleon/WS] Start failed: %s", exc)
            self.available = False

    async def stop(self) -> None:
        if self._transport:
            try:
                await self._transport.stop()
            except Exception:
                pass

    async def send(self, peer_id: str, envelope: PBFTEnvelope) -> None:
        if self._transport:
            await self._transport.send(peer_id, envelope)

    async def broadcast(
        self, envelope: PBFTEnvelope, exclude: Optional[set[str]] = None
    ) -> None:
        if self._transport:
            await self._transport.broadcast(envelope, exclude)

    async def probe_rtt_ms(self, peer_id: str) -> float:
        """Fire a HEARTBEAT and measure round-trip time in milliseconds."""
        t0 = time.perf_counter()
        try:
            env = PBFTEnvelope(
                msg_type=MsgType.HEARTBEAT,
                view=0, seq=0,
                digest=hashlib.sha256(b"probe").hexdigest(),
                sender_id=self._node_id,
            )
            await asyncio.wait_for(self.send(peer_id, env), timeout=_SEND_TIMEOUT_S)
            return (time.perf_counter() - t0) * 1000.0
        except Exception:
            return float("inf")

    def connected_peers(self) -> list[str]:
        if self._transport and hasattr(self._transport, "connected_peers"):
            return self._transport.connected_peers()
        return []


# ── libp2p backend ────────────────────────────────────────────────────────────

class _LibP2PBackend:
    """
    Subprocess bridge to a Go libp2p process that exposes NDJSON over a
    Unix domain socket at GENESIS_LIBP2P_SOCKET (default /tmp/genesis-libp2p.sock).

    Message wire format (newline-delimited JSON):
        {"to": "<peer_id>", "env": "<PBFTEnvelope.to_json()>"}

    The Go process handles PeerID ↔ multiaddr resolution, circuit relay,
    mDNS peer discovery, and Noise / TLS 1.3 encryption.
    """

    _DEFAULT_SOCKET = "/tmp/genesis-libp2p.sock"  # noqa: S108

    def __init__(self, node_id: str) -> None:
        self._node_id = node_id
        self._socket_path = os.environ.get(
            "GENESIS_LIBP2P_SOCKET", self._DEFAULT_SOCKET
        )
        self._bin = os.environ.get("GENESIS_LIBP2P_BIN", "genesis-libp2p")
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._reader: Optional[asyncio.StreamReader] = None
        self.available = False

    async def start(self) -> None:
        try:
            self._proc = await asyncio.create_subprocess_exec(
                self._bin,
                "--node-id", self._node_id,
                "--ipc", self._socket_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            # Give the process 1.5 s to bind the Unix socket
            await asyncio.sleep(1.5)
            self._reader, self._writer = await asyncio.open_unix_connection(
                self._socket_path
            )
            self.available = True
            log.info("[Chameleon/libp2p] backend started pid=%d", self._proc.pid)
        except FileNotFoundError:
            log.warning(
                "[Chameleon/libp2p] binary not found: %s — tier disabled", self._bin
            )
        except (ConnectionRefusedError, OSError) as exc:
            log.warning("[Chameleon/libp2p] IPC connection failed: %s — tier disabled", exc)

    async def stop(self) -> None:
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
        if self._proc:
            try:
                self._proc.terminate()
                await asyncio.wait_for(self._proc.wait(), timeout=5.0)
            except Exception:
                pass

    async def send_envelope(self, peer_id: str, envelope: PBFTEnvelope) -> None:
        if not self.available or not self._writer:
            return
        msg = json.dumps({"to": peer_id, "env": envelope.to_json()}) + "\n"
        self._writer.write(msg.encode())
        await self._writer.drain()


# ── WireGuard backend ─────────────────────────────────────────────────────────

class _WireGuardBackend:
    """
    Manages a WireGuard mesh overlay using the `wgconfig` Python package.

    Works on Linux with wireguard-tools installed.  On macOS or where
    wgconfig is absent, the tier is marked unavailable.

    Peers are added programmatically; the WireGuard kernel module routes
    encrypted UDP between nodes.  PBFT messages travel through the existing
    WebSocket transport *inside* the WireGuard tunnel (WireGuard is L3).
    """

    _INTERFACE = "genesis-wg0"

    def __init__(self, private_key_b64: str = "") -> None:
        self._private_key = private_key_b64
        self.available = False
        self._wgconfig: Any = None

    async def start(self) -> None:
        try:
            import wgconfig  # type: ignore
            import wgconfig.wgexec  # type: ignore  # noqa: F401
            self._wgconfig = wgconfig
            self.available = True
            log.info("[Chameleon/WireGuard] backend ready (interface=%s)", self._INTERFACE)
        except ImportError:
            log.warning("[Chameleon/WireGuard] wgconfig not installed — tier disabled")

    async def add_peer(
        self,
        peer_id: str,
        public_key: str,
        endpoint: str,
        allowed_ips: str = "0.0.0.0/0",
    ) -> None:
        if not self.available or not self._wgconfig:
            return
        try:
            import wgconfig.wgexec as wgexec  # type: ignore
            wc = self._wgconfig.WgConfig(self._INTERFACE)
            wc.read_file()
            if public_key not in [p.get("PublicKey", "") for p in wc.peers.values()]:
                wc.add_peer(public_key, friendly_name=peer_id)
                wc.add_attr(public_key, "Endpoint", endpoint)
                wc.add_attr(public_key, "AllowedIPs", allowed_ips)
                wc.add_attr(public_key, "PersistentKeepalive", "25")
                wc.write_file()
                wgexec.syncconf(self._INTERFACE, wc.get_wgconfig_file_name())
                log.info("[Chameleon/WireGuard] peer added: %s @ %s", peer_id, endpoint)
        except Exception as exc:
            log.warning("[Chameleon/WireGuard] add_peer error: %s", exc)

    async def stop(self) -> None:
        pass


# ── Tor onion backend ─────────────────────────────────────────────────────────

class _OnionBackend:
    """
    Routes PBFT envelopes via Tor SOCKS5 (127.0.0.1:9050 by default).

    Each peer must have a .onion hidden-service address configured via
    the `onion_addrs` dict {peer_id: "xxxxx.onion:PORT"}.

    The envelope is HTTP-POSTed to http://{onion_addr}/pbft.
    The receiving node must expose that endpoint via its own Tor HS.
    """

    def __init__(
        self,
        socks_host: str = "127.0.0.1",
        socks_port: int = 9050,
    ) -> None:
        self._socks_url = f"socks5://{socks_host}:{socks_port}"
        self._onion_addrs: dict[str, str] = {}
        self.available = False

    async def start(self) -> None:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2.0)
            s.connect(("127.0.0.1", 9050))
            s.close()
            self.available = True
            log.info("[Chameleon/Tor] SOCKS5 proxy reachable — onion tier enabled")
        except (OSError, ConnectionRefusedError):
            log.warning("[Chameleon/Tor] Tor not running on :9050 — tier disabled")

    def register_onion_addrs(self, addrs: dict[str, str]) -> None:
        self._onion_addrs.update(addrs)

    async def send_envelope(self, peer_id: str, envelope: PBFTEnvelope) -> None:
        if not self.available:
            return
        addr = self._onion_addrs.get(peer_id)
        if not addr:
            log.debug("[Chameleon/Tor] No .onion address for peer %s", peer_id)
            return
        import httpx
        try:
            async with httpx.AsyncClient(
                proxies={"all://": self._socks_url},
                timeout=30.0,
            ) as client:
                resp = await client.post(
                    f"http://{addr}/api/pbft/envelope",
                    content=envelope.to_json().encode(),
                    headers={"Content-Type": "application/json"},
                )
                if resp.status_code != 200:
                    log.warning(
                        "[Chameleon/Tor] %s → %s returned %d",
                        peer_id, addr, resp.status_code,
                    )
        except Exception as exc:
            log.warning("[Chameleon/Tor] send failed for %s: %s", peer_id, exc)

    async def stop(self) -> None:
        pass


# ── Protocol probe ────────────────────────────────────────────────────────────

class ProtocolProbe:
    """
    Fires synthetic HEARTBEAT envelopes to a sample of WebSocket peers
    every _PROBE_INTERVAL_S seconds.  Updates ProtocolHealth for tier 1.

    A future extension can add probes for tiers 2-4 by measuring IPC
    round-trips (libp2p) or WireGuard handshake age (wg show ... latest-handshakes).
    """

    def __init__(
        self,
        ws_backend: _WebSocketBackend,
        health_map: dict[ProtocolTier, ProtocolHealth],
        sample_peers: list[str],
    ) -> None:
        self._ws = ws_backend
        self._health = health_map
        self._peers = sample_peers[:_PROBE_COUNT]

    async def run_forever(self) -> None:
        while True:
            await asyncio.sleep(_PROBE_INTERVAL_S)
            await self._probe_websocket()

    async def _probe_websocket(self) -> None:
        health = self._health[ProtocolTier.WEBSOCKET]
        if not self._peers:
            return

        results = await asyncio.gather(
            *[self._ws.probe_rtt_ms(p) for p in self._peers],
            return_exceptions=True,
        )

        losses = sum(
            1 for r in results if isinstance(r, Exception) or r == float("inf")
        )
        latencies = [
            float(r)
            for r in results
            if not isinstance(r, Exception) and r != float("inf")
        ]

        n = len(self._peers)
        health.loss_rate = losses / n if n else 0.0
        health.latency_ms = (
            sum(latencies) / len(latencies) if latencies else float("inf")
        )

        if health.is_degraded():
            health.consecutive_failures += 1
        else:
            health.consecutive_failures = 0
            health.last_healthy_ts = time.time()

        log.debug(
            "[Probe/WS] loss=%.2f%% latency=%.1fms failures=%d",
            health.loss_rate * 100,
            health.latency_ms,
            health.consecutive_failures,
        )


# ── Chameleon transport ───────────────────────────────────────────────────────

class ChameleonTransport(PBFTTransport):
    """
    A PBFTTransport implementation that autonomously selects the best
    available protocol based on live health telemetry.

    Constructor parameters
    ----------------------
    node_id   : str — this node's PBFT ID
    peers_cfg : dict[str, dict] — per-peer config block:
        {
          "SANCTIONS_BOT": {
            "ws":          "wss://sanctions.genesis.svc:9000",
            "onion":       "xyzabcdef.onion:9001",       # optional
            "wg_pubkey":   "<base64>",                   # optional
            "wg_endpoint": "10.1.0.2:51820",             # optional
            "wg_allowed_ips": "10.1.0.0/24",             # optional
          }
        }
    wg_private_key : str — base64 WireGuard private key for this node
    tor_socks_host : str — Tor SOCKS5 host (default 127.0.0.1)
    tor_socks_port : int — Tor SOCKS5 port (default 9050)
    onion_addrs    : dict[str, str] — pre-configured {peer_id: .onion:port}
    """

    def __init__(
        self,
        node_id: str,
        peers_cfg: dict[str, dict[str, Any]],
        wg_private_key: str = "",
        tor_socks_host: str = "127.0.0.1",
        tor_socks_port: int = 9050,
        onion_addrs: Optional[dict[str, str]] = None,
    ) -> None:
        super().__init__(node_id)
        self._peers_cfg = peers_cfg

        ws_peers = {
            pid: cfg["ws"]
            for pid, cfg in peers_cfg.items()
            if cfg.get("ws")
        }
        self._ws = _WebSocketBackend(node_id, ws_peers)
        self._p2p = _LibP2PBackend(node_id)
        self._wg = _WireGuardBackend(wg_private_key)
        self._tor = _OnionBackend(tor_socks_host, tor_socks_port)

        self._health: dict[ProtocolTier, ProtocolHealth] = {
            t: ProtocolHealth(tier=t) for t in ProtocolTier
        }
        self._active_tier = ProtocolTier.WEBSOCKET
        self._switch_log: list[dict[str, Any]] = []
        self._onion_addrs: dict[str, str] = onion_addrs or {}
        self._probe: Optional[ProtocolProbe] = None
        self._probe_task: Optional[asyncio.Task[None]] = None
        self._watchdog_task: Optional[asyncio.Task[None]] = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        await self._ws.start()
        await self._p2p.start()
        await self._wg.start()
        await self._tor.start()

        for pid, cfg in self._peers_cfg.items():
            if cfg.get("onion"):
                self._onion_addrs[pid] = cfg["onion"]
            if cfg.get("wg_pubkey") and cfg.get("wg_endpoint"):
                await self._wg.add_peer(
                    peer_id=pid,
                    public_key=cfg["wg_pubkey"],
                    endpoint=cfg["wg_endpoint"],
                    allowed_ips=cfg.get("wg_allowed_ips", "0.0.0.0/0"),
                )

        if self._onion_addrs:
            self._tor.register_onion_addrs(self._onion_addrs)

        self._health[ProtocolTier.LIBP2P].available = self._p2p.available
        self._health[ProtocolTier.WIREGUARD].available = self._wg.available
        self._health[ProtocolTier.ONION].available = self._tor.available

        sample_peers = list(self._peers_cfg.keys())[:_PROBE_COUNT]
        self._probe = ProtocolProbe(self._ws, self._health, sample_peers)
        self._probe_task = asyncio.create_task(self._probe.run_forever())
        self._watchdog_task = asyncio.create_task(self._tier_watchdog())

        log.info(
            "[Chameleon] Transport started node=%s active_tier=%s",
            self.node_id, self._active_tier.name,
        )

    async def stop(self) -> None:
        for task in (self._probe_task, self._watchdog_task):
            if task:
                task.cancel()
        await self._ws.stop()
        await self._p2p.stop()
        await self._wg.stop()
        await self._tor.stop()

    # ── Messaging ─────────────────────────────────────────────────────────────

    async def send(self, peer_id: str, envelope: PBFTEnvelope) -> None:
        await self._send_on_tier(self._active_tier, peer_id, envelope)

    async def broadcast(
        self,
        envelope: PBFTEnvelope,
        exclude: Optional[set[str]] = None,
    ) -> None:
        tasks = [
            self._send_on_tier(self._active_tier, pid, envelope)
            for pid in self._peers_cfg
            if not (exclude and pid in exclude)
        ]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _send_on_tier(
        self,
        tier: ProtocolTier,
        peer_id: str,
        envelope: PBFTEnvelope,
    ) -> None:
        try:
            if tier == ProtocolTier.WEBSOCKET:
                await asyncio.wait_for(
                    self._ws.send(peer_id, envelope), timeout=_SEND_TIMEOUT_S
                )
            elif tier == ProtocolTier.LIBP2P:
                await self._p2p.send_envelope(peer_id, envelope)
            elif tier == ProtocolTier.WIREGUARD:
                # WireGuard is a tunnel — route through WebSocket inside it
                await asyncio.wait_for(
                    self._ws.send(peer_id, envelope), timeout=_SEND_TIMEOUT_S
                )
            elif tier == ProtocolTier.ONION:
                await self._tor.send_envelope(peer_id, envelope)
        except asyncio.TimeoutError:
            log.warning(
                "[Chameleon] send timeout on %s → %s, downgrading",
                tier.name, peer_id,
            )
            await self._downgrade()
            if tier.value < ProtocolTier.ONION:
                next_tier = ProtocolTier(tier.value + 1)
                await self._send_on_tier(next_tier, peer_id, envelope)
        except Exception as exc:
            log.warning(
                "[Chameleon] send error on %s → %s: %s, downgrading",
                tier.name, peer_id, exc,
            )
            await self._downgrade()
            if tier.value < ProtocolTier.ONION:
                next_tier = ProtocolTier(tier.value + 1)
                await self._send_on_tier(next_tier, peer_id, envelope)

    # ── Tier watchdog ─────────────────────────────────────────────────────────

    async def _tier_watchdog(self) -> None:
        while True:
            await asyncio.sleep(_PROBE_INTERVAL_S)
            ws_health = self._health[ProtocolTier.WEBSOCKET]

            if (
                self._active_tier == ProtocolTier.WEBSOCKET
                and ws_health.is_degraded()
            ):
                await self._downgrade()
            elif (
                self._active_tier != ProtocolTier.WEBSOCKET
                and ws_health.is_promotable()
            ):
                await self._upgrade(ProtocolTier.WEBSOCKET)

    async def _downgrade(self) -> None:
        if self._active_tier >= ProtocolTier.ONION:
            return
        old = self._active_tier
        candidate = ProtocolTier(self._active_tier.value + 1)

        # Skip unavailable tiers
        while (
            candidate < ProtocolTier.ONION
            and not self._health[candidate].available
        ):
            candidate = ProtocolTier(candidate.value + 1)

        self._active_tier = candidate
        entry: dict[str, Any] = {
            "from": old.name,
            "to": candidate.name,
            "direction": "down",
            "ts": time.time(),
            "reason": (
                f"loss={self._health[old].loss_rate:.2f} "
                f"lat={self._health[old].latency_ms:.0f}ms"
            ),
        }
        self._switch_log.append(entry)
        log.warning(
            "[Chameleon] Protocol DOWNGRADE: %s → %s", old.name, candidate.name
        )

    async def _upgrade(self, target: ProtocolTier) -> None:
        old = self._active_tier
        self._active_tier = target
        entry: dict[str, Any] = {
            "from": old.name,
            "to": target.name,
            "direction": "up",
            "ts": time.time(),
        }
        self._switch_log.append(entry)
        log.info("[Chameleon] Protocol UPGRADE: %s → %s", old.name, target.name)

    # ── PBFTTransport interface ───────────────────────────────────────────────

    def peer_ids(self) -> list[str]:
        return list(self._peers_cfg.keys())

    def connected_peers(self) -> list[str]:
        return self._ws.connected_peers()

    def status(self) -> dict[str, Any]:
        return {
            "node_id": self.node_id,
            "active_tier": self._active_tier.name,
            "health": {
                t.name: {
                    "available": h.available,
                    "loss_rate": round(h.loss_rate, 4),
                    "latency_ms": round(h.latency_ms, 1),
                    "consecutive_failures": h.consecutive_failures,
                    "score": round(h.score(), 4),
                }
                for t, h in self._health.items()
            },
            "switch_log": self._switch_log[-20:],
            "onion_peers": list(self._onion_addrs.keys()),
        }


# ── FastAPI health endpoint ───────────────────────────────────────────────────

from fastapi import APIRouter as _APIRouter  # noqa: E402
from fastapi.responses import JSONResponse as _JSONResponse  # noqa: E402

router = _APIRouter(prefix="/api/networking", tags=["networking"])

_transport_instance: Optional[ChameleonTransport] = None


def init_chameleon_transport(transport: ChameleonTransport) -> None:
    global _transport_instance
    _transport_instance = transport


@router.get("/status", summary="Chameleon transport health and tier status")
async def chameleon_status() -> _JSONResponse:
    if _transport_instance is None:
        return _JSONResponse({"enabled": False})
    return _JSONResponse({"enabled": True, **_transport_instance.status()})


@router.get("/switch-log", summary="Protocol switch event log")
async def chameleon_switch_log() -> _JSONResponse:
    if _transport_instance is None:
        return _JSONResponse({"switches": []})
    return _JSONResponse({"switches": _transport_instance._switch_log})


# ── Callback delegation ───────────────────────────────────────────────────────

def _make_callback_forwarder(
    cb_name: str,
) -> Callable[[str], None]:
    """Returns a callable that invokes a named callback on _transport_instance."""

    def _forward(peer_id: str) -> None:
        if _transport_instance is None:
            return
        cb: Optional[Any] = getattr(_transport_instance, cb_name, None)
        if cb:
            cb(peer_id)

    return _forward
