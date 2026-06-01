from __future__ import annotations

import asyncio
import logging
import random
import time
from collections import deque
from enum import Enum
from typing import Optional

log = logging.getLogger(__name__)

BOT_TYPE = "CHAOS_MONKEY"
PERSONALITY = "ADVERSARIAL"

ATTACK_CYCLE_INTERVAL = 45  # seconds between autonomous attack cycles

_BOT_TYPES = [
    "NAV_DETECTOR",
    "COMMANDER_BOT",
    "FX_BOT",
    "COMMODITY_MONITOR",
    "CARGO_BOT",
    "SATELLITE_ANALYTICS",
    "SANCTIONS_BOT",
    "COMPLIANCE_BOT",
    "SOVEREIGN_BOT",
    "SUCCESSION_BOT",
    "ASSET_TRACKER",
    "ADVERSARIAL_TESTER",
]


class AttackType(str, Enum):
    DATA_POISON = "DATA_POISON"
    DUPLICATE_MSG = "DUPLICATE_MSG"
    TIMING_ATTACK = "TIMING_ATTACK"
    NULL_INJECTION = "NULL_INJECTION"
    BYZANTINE_VOTE = "BYZANTINE_VOTE"
    SCHEMA_VIOLATION = "SCHEMA_VIOLATION"
    REPLAY_ATTACK = "REPLAY_ATTACK"


class ChaosMonkeyBot:
    """
    DORA-compliance chaos engineering bot — tests BFT quorum resilience
    by injecting adversarial payloads, byzantine votes, schema violations,
    and timing floods into the Genesis Swarm message bus.

    Attack results are recorded with full metadata and published to the
    ``security.chaos_monkey`` bus topic for real-time observability.
    """

    BOT_TYPE = "CHAOS_MONKEY"
    PERSONALITY = "ADVERSARIAL"
    PERSONALITY_LABEL = "Adversarial"

    def __init__(self, bots, bus, alerter, auditor) -> None:
        self._bots = {b.BOT_TYPE: b for b in bots} if bots else {}
        self._bus = bus
        self._alerter = alerter
        self._auditor = auditor

        self._running: bool = False
        self._attacks: deque[dict] = deque(maxlen=200)

        self._total_attacks: int = 0
        self._attacks_blocked: int = 0
        self._attacks_succeeded: int = 0

        # Keep the most-recent outbound message for replay attacks
        self._last_published: Optional[dict] = None

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def start(self) -> None:
        """Run attack cycle every 45 seconds while ``_running``."""
        self._running = True
        log.info(
            "[ChaosMonkey] DORA chaos engine online — attack cycle every %ds",
            ATTACK_CYCLE_INTERVAL,
        )
        await self._bus.publish(
            "security.chaos_monkey",
            {
                "event": "online",
                "message": "ChaosMonkeyBot activated — BFT quorum resilience testing begins",
                "attack_types": [a.value for a in AttackType],
                "ts": time.time(),
            },
        )

        while self._running:
            await asyncio.sleep(ATTACK_CYCLE_INTERVAL)
            try:
                await self._run_chaos_cycle()
            except Exception as exc:
                log.error("[ChaosMonkey] Cycle error: %s", exc)

    def stop(self) -> None:
        """Halt the autonomous attack loop."""
        self._running = False
        log.info("[ChaosMonkey] Chaos engine stopping.")

    # ── Core cycle ─────────────────────────────────────────────────────────────

    async def _run_chaos_cycle(self) -> None:
        """Pick a random attack type, execute it, log and publish the result."""
        attack_type = random.choice(list(AttackType))
        result = await self._dispatch_attack(attack_type)
        self._attacks.appendleft(result)
        log.info(
            "[ChaosMonkey] %s → target=%s blocked=%s severity=%s detection_ms=%.1",
            result["attack_type"],
            result["target_bot"],
            result["blocked"],
            result["severity"],
            result["detection_time_ms"],
        )
        await self._bus.publish("security.chaos_monkey", result)

    async def _dispatch_attack(self, attack_type: AttackType) -> dict:
        """Route to the appropriate attack coroutine."""
        dispatch = {
            AttackType.DATA_POISON: self._attack_data_poison,
            AttackType.DUPLICATE_MSG: self._attack_duplicate_msg,
            AttackType.TIMING_ATTACK: self._attack_timing_attack,
            AttackType.NULL_INJECTION: self._attack_null_injection,
            AttackType.BYZANTINE_VOTE: self._attack_byzantine_vote,
            AttackType.SCHEMA_VIOLATION: self._attack_schema_violation,
            AttackType.REPLAY_ATTACK: self._attack_replay_attack,
        }
        return await dispatch[attack_type]()

    # ── Attack implementations ─────────────────────────────────────────────────

    async def _attack_data_poison(self) -> dict:
        """Inject a detection result with score=99.9 into a random bot's detect channel."""
        target = random.choice(_BOT_TYPES)
        topic = f"detect.{target.lower()}"
        payload = {
            "bot_type": target,
            "anomaly_score": 99.9,
            "alert_level": "CRITICAL",
            "poisoned": True,
            "source": "CHAOS_MONKEY",
            "ts": time.time(),
        }
        return await self._execute_attack(
            attack_type=AttackType.DATA_POISON,
            target_bot=target,
            topic=topic,
            payload=payload,
            payload_summary=f"Poisoned detection score 99.9 → {topic}",
            severity="HIGH",
        )

    async def _attack_duplicate_msg(self) -> dict:
        """Publish the same message twice in quick succession to test idempotency."""
        target = random.choice(_BOT_TYPES)
        topic = f"detect.{target.lower()}"
        payload = {
            "bot_type": target,
            "anomaly_score": round(random.uniform(50, 80), 2),
            "msg_id": f"DEDUP-{self._total_attacks:04d}",
            "source": "CHAOS_MONKEY",
            "ts": time.time(),
        }
        blocked = False
        start = time.perf_counter()
        try:
            await self._bus.publish(topic, payload)
            await asyncio.sleep(0.01)
            await self._bus.publish(topic, payload)  # exact duplicate
        except Exception:
            blocked = True
        detection_ms = (time.perf_counter() - start) * 1000

        return self._make_result(
            attack_type=AttackType.DUPLICATE_MSG,
            target_bot=target,
            payload_summary=f"Duplicate msg_id={payload['msg_id']} x2 → {topic}",
            blocked=blocked,
            detection_ms=detection_ms,
            severity="LOW",
        )

    async def _attack_timing_attack(self) -> dict:
        """Flood queue with 20 rapid messages to stress-test throughput."""
        target = random.choice(_BOT_TYPES)
        topic = f"telemetry.{target.lower()}"
        blocked = False
        start = time.perf_counter()
        try:
            for i in range(20):
                await self._bus.publish(
                    topic,
                    {
                        "bot_type": target,
                        "seq": i,
                        "flood": True,
                        "source": "CHAOS_MONKEY",
                        "ts": time.time(),
                    },
                )
        except Exception:
            blocked = True
        detection_ms = (time.perf_counter() - start) * 1000

        return self._make_result(
            attack_type=AttackType.TIMING_ATTACK,
            target_bot=target,
            payload_summary=f"20-message flood burst → {topic}",
            blocked=blocked,
            detection_ms=detection_ms,
            severity="MEDIUM",
        )

    async def _attack_null_injection(self) -> dict:
        """Publish empty-dict or None-equivalent payloads to probe null-handling."""
        target = random.choice(_BOT_TYPES)
        topic = f"detect.{target.lower()}"
        null_variants = [{}, {"data": None}, {"payload": ""}, {}]
        payload = random.choice(null_variants)
        return await self._execute_attack(
            attack_type=AttackType.NULL_INJECTION,
            target_bot=target,
            topic=topic,
            payload=payload,
            payload_summary=f"Null/empty payload → {topic}: {payload!r}",
            severity="LOW",
        )

    async def _attack_byzantine_vote(self) -> dict:
        """Publish a forged consensus vote with a fabricated bot signature."""
        fake_bot_id = f"FAKE-BOT-{random.randint(1000, 9999)}"
        topic = "consensus.vote"
        payload = {
            "round_id": f"BFT-FAKE-{self._total_attacks:04d}",
            "bot_id": fake_bot_id,
            "bot_type": random.choice(_BOT_TYPES),
            "vote": random.choice(["CONFIRM", "REJECT"]),
            "anomaly_score": round(random.uniform(0, 100), 2),
            "byzantine": True,
            "signature": "FORGED-SIG-DEADBEEF",
            "source": "CHAOS_MONKEY",
            "ts": time.time(),
        }
        return await self._execute_attack(
            attack_type=AttackType.BYZANTINE_VOTE,
            target_bot="CONSENSUS_ENGINE",
            topic=topic,
            payload=payload,
            payload_summary=f"Byzantine vote from fake bot {fake_bot_id} → {topic}",
            severity="CRITICAL",
        )

    async def _attack_schema_violation(self) -> dict:
        """Publish a message deliberately missing required fields."""
        target = random.choice(_BOT_TYPES)
        topic = f"detect.{target.lower()}"
        # All required fields stripped — only garbage keys remain
        payload = {
            "garbage_field": "schema_violation",
            "unexpected_key": random.random(),
            "source": "CHAOS_MONKEY",
            # Intentionally missing: bot_type, anomaly_score, ts
        }
        return await self._execute_attack(
            attack_type=AttackType.SCHEMA_VIOLATION,
            target_bot=target,
            topic=topic,
            payload=payload,
            payload_summary=f"Schema-violating payload (missing required fields) → {topic}",
            severity="MEDIUM",
        )

    async def _attack_replay_attack(self) -> dict:
        """Re-publish an old message with a stale timestamp to test replay protection."""
        target = random.choice(_BOT_TYPES)
        topic = f"detect.{target.lower()}"
        stale_ts = time.time() - random.uniform(3600, 86400)  # 1h–24h ago
        payload = {
            "bot_type": target,
            "anomaly_score": round(random.uniform(60, 90), 2),
            "replay": True,
            "original_ts": stale_ts,
            "ts": stale_ts,  # deliberately old timestamp
            "msg_id": f"REPLAY-{self._total_attacks:04d}",
            "source": "CHAOS_MONKEY",
        }
        age_h = round((time.time() - stale_ts) / 3600, 1)
        return await self._execute_attack(
            attack_type=AttackType.REPLAY_ATTACK,
            target_bot=target,
            topic=topic,
            payload=payload,
            payload_summary=f"Replay of {age_h}h-old message → {topic}",
            severity="HIGH",
        )

    # ── Shared execution helper ────────────────────────────────────────────────

    async def _execute_attack(
        self,
        *,
        attack_type: AttackType,
        target_bot: str,
        topic: str,
        payload: dict,
        payload_summary: str,
        severity: str,
    ) -> dict:
        """
        Attempt to publish ``payload`` on ``topic``.

        The BFT quorum / bus validation may raise an exception (treated as
        "blocked"). A clean publish is treated as "succeeded" — the quorum
        logic running downstream will catch byzantine votes separately.
        """
        blocked = False
        start = time.perf_counter()
        try:
            await self._bus.publish(topic, payload)
            self._last_published = {"topic": topic, "payload": payload, "ts": time.time()}
        except Exception as exc:
            blocked = True
            log.debug("[ChaosMonkey] Attack blocked by bus: %s", exc)
        detection_ms = (time.perf_counter() - start) * 1000

        return self._make_result(
            attack_type=attack_type,
            target_bot=target_bot,
            payload_summary=payload_summary,
            blocked=blocked,
            detection_ms=detection_ms,
            severity=severity,
        )

    def _make_result(
        self,
        *,
        attack_type: AttackType,
        target_bot: str,
        payload_summary: str,
        blocked: bool,
        detection_ms: float,
        severity: str,
    ) -> dict:
        self._total_attacks += 1
        if blocked:
            self._attacks_blocked += 1
        else:
            self._attacks_succeeded += 1

        return {
            "ts": time.time(),
            "attack_id": f"CHAOS-{self._total_attacks:04d}",
            "attack_type": (
                attack_type.value if isinstance(attack_type, AttackType) else str(attack_type)
            ),
            "target_bot": target_bot,
            "payload_summary": payload_summary,
            "blocked": blocked,
            "detection_time_ms": round(detection_ms, 2),
            "severity": severity,
        }

    # ── Public API ─────────────────────────────────────────────────────────────

    async def inject_manual(self, attack_type: str) -> dict:
        """Force a specific attack type for demo / integration testing.

        Parameters
        ----------
        attack_type:
            One of the ``AttackType`` enum values (case-insensitive string).

        Returns
        -------
        dict
            The attack result record.
        """
        try:
            at = AttackType(attack_type.upper())
        except ValueError:
            valid = [a.value for a in AttackType]
            raise ValueError(f"Unknown attack_type {attack_type!r}. Valid: {valid}")

        result = await self._dispatch_attack(at)
        self._attacks.appendleft(result)
        await self._bus.publish("security.chaos_monkey", result)
        log.info("[ChaosMonkey] Manual inject: %s", result["attack_id"])
        return result

    def get_stats(self) -> dict:
        """Return aggregated chaos engineering statistics."""
        block_rate = round(self._attacks_blocked / max(1, self._total_attacks) * 100, 1)
        return {
            "total_attacks": self._total_attacks,
            "blocked": self._attacks_blocked,
            "succeeded": self._attacks_succeeded,
            "block_rate_pct": block_rate,
            "running": self._running,
            "recent_attacks": self.get_recent_attacks(20),
        }

    def get_recent_attacks(self, n: int = 20) -> list[dict]:
        """Return the *n* most recent attack result dicts."""
        return list(self._attacks)[:n]
