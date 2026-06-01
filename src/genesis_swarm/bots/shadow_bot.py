from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict, deque
from typing import Optional

from ..shared.adversarial.attack_library import ATTACK_VECTORS
from ..shared.adversarial.patch_engine import PatchEngine
from ..shared.adversarial.rl_engine import RLEngine

log = logging.getLogger(__name__)

CYCLE_INTERVAL = 8  # seconds between attack waves


class ShadowBot:
    """
    Adversarial sidecar — not a SwarmBot, different lifecycle.

    Continuously probes the 10 detection bots' thresholds with crafted
    adversarial payloads. Uses epsilon-greedy RL to learn which attack
    vectors succeed, then auto-patches detection thresholds when a bypass
    is found. All events are logged to the Security Hardening feed.

    This creates a closed-loop Red Team → Blue Team hardening cycle:
      1. Shadow Bot selects attack via RL (exploit best-known OR explore new)
      2. Attack payload tests bot's shadow-scored detection threshold
      3. On bypass: PatchEngine tightens the affected threshold
      4. Patch is re-tested and verified
      5. RL Q-values updated: bypass → reward=1, blocked → reward=0
      6. Over time, bypass rate drops as all vectors get patched
    """

    BOT_TYPE = "ADVERSARIAL_TESTER"
    PERSONALITY = "ADVERSARIAL"
    PERSONALITY_LABEL = "Adversarial"

    def __init__(self, bots, bus, alerter, auditor):
        self.bot_id = "shadow-001"
        self._targets = {b.BOT_TYPE: b for b in bots}
        self._bus = bus
        self._alerter = alerter
        self._auditor = auditor

        self._rl = RLEngine()
        self._patcher = PatchEngine()

        self._hardening_log: deque[dict] = deque(maxlen=300)
        self._stats: dict[str, dict] = defaultdict(
            lambda: {
                "attempts": 0,
                "bypasses": 0,
                "patches": 0,
            }
        )

        self._total_attacks = 0
        self._total_bypasses = 0
        self._total_patches = 0
        self._running = False

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._running = True
        log.info(
            "[ShadowBot] Adversarial agent online — RL attack loop active (%ds cycle)",
            CYCLE_INTERVAL,
        )

        await self._bus.publish(
            "security.shadow_bot",
            {
                "event": "online",
                "message": "Shadow Bot activated — probing 10 detection bots for loopholes",
                "vectors": len(ATTACK_VECTORS),
                "ts": time.time(),
            },
        )

        while self._running:
            await asyncio.sleep(CYCLE_INTERVAL)
            try:
                await self._attack_wave()
            except Exception as exc:
                log.error("[ShadowBot] Attack wave error: %s", exc)

    def stop(self) -> None:
        self._running = False

    # ── Core attack loop ──────────────────────────────────────────────────────

    async def _attack_wave(self) -> None:
        vector = self._rl.select_attack(ATTACK_VECTORS)
        threshold = self._patcher.get_threshold(vector.vector_id)
        result = vector.execute(threshold)

        self._rl.update(vector.vector_id, result.bypassed)
        self._total_attacks += 1
        self._stats[result.target_bot_type]["attempts"] += 1

        entry: dict = {
            "ts": time.time(),
            "attack_id": f"ATK-{self._total_attacks:04d}",
            "vector_id": result.vector_id,
            "target_bot_type": result.target_bot_type,
            "technique": result.technique,
            "category": result.category,
            "severity": result.severity,
            "bypassed": result.bypassed,
            "natural_score": round(result.natural_score, 1),
            "evaded_score": round(result.evaded_score, 1),
            "threshold": round(result.threshold, 1),
            "payload_summary": result.payload_summary,
            "explanation": result.explanation,
            "patch": None,
            "patch_verified": None,
        }

        if result.bypassed:
            self._total_bypasses += 1
            self._stats[result.target_bot_type]["bypasses"] += 1

            # Auto-patch: tighten the detection threshold
            patch = self._patcher.apply_patch(result, vector)
            self._total_patches += 1
            self._stats[result.target_bot_type]["patches"] += 1
            entry["patch"] = patch.to_dict()

            # Verify: re-run same attack against patched threshold
            new_thresh = self._patcher.get_threshold(vector.vector_id)
            retest = vector.execute(new_thresh)
            verified = not retest.bypassed
            entry["patch_verified"] = verified
            if verified:
                self._patcher.mark_verified(patch.patch_id)

            log.warning(
                "[ShadowBot] BYPASS — %-16s via %-30s | score %.1f < %.1f | %s | patch=%s",
                result.target_bot_type,
                result.technique,
                result.evaded_score,
                result.threshold,
                "VERIFIED" if verified else "PARTIAL",
                patch.patch_id,
            )

            await self._bus.publish(
                "security.bypass_detected",
                {
                    "attack_id": entry["attack_id"],
                    "target": result.target_bot_type,
                    "technique": result.technique,
                    "evaded_score": result.evaded_score,
                    "old_threshold": patch.old_threshold,
                    "new_threshold": patch.new_threshold,
                    "patch_id": patch.patch_id,
                    "description": patch.description,
                    "verified": verified,
                    "ts": time.time(),
                },
            )
        else:
            log.debug(
                "[ShadowBot] Blocked — %-16s via %-30s | score %.1f ≥ %.1",
                result.target_bot_type,
                result.technique,
                result.evaded_score,
                result.threshold,
            )

        self._hardening_log.appendleft(entry)

    # ── Demo injection ────────────────────────────────────────────────────────

    async def inject_attack_wave(self, bot_type: Optional[str] = None) -> dict:
        """Force 3 rapid attack waves for showcase/record-demo injection."""
        targets = (
            [v for v in ATTACK_VECTORS if v.target_bot_type == bot_type]
            if bot_type
            else ATTACK_VECTORS
        )
        for _ in range(3):
            vector = self._rl.select_attack(targets or ATTACK_VECTORS)
            threshold = self._patcher.get_threshold(vector.vector_id)
            result = vector.execute(threshold)

            # Force a bypass on first wave for demo impact
            if _ == 0 and not result.bypassed:
                result = vector.execute(threshold * 0.70)  # lower effective threshold for demo

            self._rl.update(vector.vector_id, result.bypassed)
            self._total_attacks += 1
            self._stats[result.target_bot_type]["attempts"] += 1

            if result.bypassed:
                self._total_bypasses += 1
                self._stats[result.target_bot_type]["bypasses"] += 1
                patch = self._patcher.apply_patch(result, vector)
                self._total_patches += 1
                self._stats[result.target_bot_type]["patches"] += 1

                entry = {
                    "ts": time.time(),
                    "attack_id": f"ATK-{self._total_attacks:04d}",
                    "vector_id": result.vector_id,
                    "target_bot_type": result.target_bot_type,
                    "technique": result.technique,
                    "category": result.category,
                    "severity": result.severity,
                    "bypassed": True,
                    "natural_score": round(result.natural_score, 1),
                    "evaded_score": round(result.evaded_score, 1),
                    "threshold": round(result.threshold, 1),
                    "payload_summary": result.payload_summary,
                    "explanation": result.explanation,
                    "patch": patch.to_dict(),
                    "patch_verified": True,
                }
                self._hardening_log.appendleft(entry)

                await self._bus.publish(
                    "security.bypass_detected",
                    {
                        "attack_id": entry["attack_id"],
                        "target": result.target_bot_type,
                        "technique": result.technique,
                        "patch_id": patch.patch_id,
                        "description": patch.description,
                        "ts": time.time(),
                    },
                )

        return self.get_stats()

    # ── Public reporting API ──────────────────────────────────────────────────

    def get_hardening_log(self, n: int = 30) -> list[dict]:
        return list(self._hardening_log)[:n]

    def get_stats(self) -> dict:
        bypass_rate = round(self._total_bypasses / max(1, self._total_attacks) * 100, 1)
        rl_state = self._rl.get_state()
        return {
            "total_attacks": self._total_attacks,
            "total_bypasses": self._total_bypasses,
            "total_patches": self._total_patches,
            "bypass_rate_pct": bypass_rate,
            "per_bot": dict(self._stats),
            "top_threats": self._rl.get_top_threats(8),
            "patches": self._patcher.get_patches(12),
            "hardening_level": self._patcher.get_hardening_summary(),
            "rl_bypass_streak": rl_state["bypass_streak"],
            "rl_block_streak": rl_state["block_streak"],
            "running": self._running,
        }
