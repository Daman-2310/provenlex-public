from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from ..shared.alerting import AlertDispatcher, SwarmAlert
from ..shared.audit_logger import AuditLogger
from ..shared.consensus import ConsensusEngine
from ..shared.message_bus import MessageBus
from ..shared.risk_engine import (
    PERSONALITY_CONFIGS,
    calculate_position,
    risk_label,
)
from ..shared.self_healing import HealingAction, HealthMonitor, SelfHealingOrchestrator

log = logging.getLogger(__name__)


@dataclass
class BotStatus:
    bot_id: str
    bot_type: str
    last_heartbeat: float = field(default_factory=time.time)
    last_anomaly_time: float = 0.0
    alert_count: int = 0
    last_score: float = 0.0
    last_summary: str = "Initialising..."
    status: str = "STARTING"  # STARTING | HEALTHY | WARNING | CRITICAL | OFFLINE
    personality: str = "SYSTEMATIC"
    personality_label: str = "Systematic"
    suggested_position_pct: float = 5.0
    risk_label: str = "MINIMAL"


@dataclass
class SwarmSummary:
    timestamp: float
    total_bots: int
    healthy_bots: int
    active_alerts: int
    top_threat: Optional[str]
    top_score: float
    bot_statuses: list[BotStatus]
    healing_events_1h: int
    consensus_rounds_1h: int


class CommanderBot:
    """
    The 11th bot — the brain of the swarm.

    Responsibilities:
      - Monitors heartbeats from all 10 bots
      - Aggregates anomaly signals into a unified threat picture
      - Triggers cross-bot consensus when multiple bots detect correlated threats
      - Dispatches escalation alerts to the operator
      - Provides real-time dashboard data
      - Self-heals: restarts unresponsive bots, adjusts quorum dynamically
      - Manages swarm mode: NORMAL → ALERT → WAR_ROOM → SAFE_HAVEN → LOCKDOWN
      - Tracks capital positions per bot, locks to 0.01% in safe haven
      - Predicts crash bottoms using fear index
      - Generates multi-perspective debate reports when bots disagree
      - Processes Jarvis voice commands
    """

    BOT_TYPE = "COMMANDER_BOT"
    BOT_ID = "commander-001"

    def __init__(
        self,
        bus: MessageBus,
        consensus: ConsensusEngine,
        health_monitor: HealthMonitor,
        alerter: AlertDispatcher,
        auditor: AuditLogger,
        heartbeat_timeout: float = 15.0,
    ):
        self.bot_id = self.BOT_ID
        self.bus = bus
        self.consensus = consensus
        self.health_monitor = health_monitor
        self.alerter = alerter
        self.auditor = auditor
        self._running = False
        self._bot_statuses: dict[str, BotStatus] = {}
        self._alert_history: deque[SwarmAlert] = deque(maxlen=200)
        self._healing_events: deque[dict] = deque(maxlen=500)
        self._consensus_count = 0
        self._last_correlation_alert: float = 0.0
        self._correlation_cooldown: float = 60.0

        # Swarm intelligence state
        self._swarm_mode: str = "NORMAL"  # NORMAL | ALERT | WAR_ROOM | SAFE_HAVEN | LOCKDOWN
        self._fear_index: float = 0.0  # 0-100 rolling fear gauge
        self._fear_history: deque[tuple] = deque(maxlen=60)  # (ts, score)
        self._safe_haven_active: bool = False
        self._safe_haven_ts: float = 0.0
        self._bottom_prediction: Optional[dict] = None
        self._debate_reports: deque[dict] = deque(maxlen=10)
        self._war_room_ts: float = 0.0
        self._war_room_ticker: deque[str] = deque(maxlen=20)

        self._healer = SelfHealingOrchestrator(
            health_monitor=health_monitor,
            escalation_cb=self._on_escalation,
        )
        self._healer.register_handler(HealingAction.ADJUST_QUORUM, self._heal_adjust_quorum)
        self._healer.register_handler(HealingAction.QUARANTINE_BOT, self._heal_quarantine)
        self.alerter.add_hook(self._capture_alert)

    _BOT_SUMMARIES: dict[str, str] = {
        "NAV_DETECTOR": "Monitoring UCITS ETF NAV via Yahoo Finance (IWDA.AS)",
        "CARGO_BOT": "Tracking 5 vessels via AIS — watching for dark ships",
        "COMMODITY_MONITOR": "Scanning WTI, TTF, LNG, bunker fuel & heating oil prices",
        "SANCTIONS_BOT": "Screening counterparties against OFAC SDN + EU list",
        "FX_BOT": "Monitoring EUR/USD, GBP, CHF, JPY, CNY, RUB via ECB",
        "COMPLIANCE_BOT": "Checking AIFMD leverage, liquidity & reporting deadlines",
        "SUCCESSION_BOT": "Scanning UBO chains for offshore structures & PEPs",
        "SOVEREIGN_BOT": "Scoring geopolitical risk across 14 countries",
        "ASSET_TRACKER": "Tracking 6 UHNW assets for sanctioned port calls",
        "SATELLITE_ANALYTICS": "Monitoring 8 satellites for imaging cluster anomalies",
        "COMMANDER_BOT": "Managing swarm — all bots nominal",
    }

    _BOT_PERSONALITIES: dict[str, tuple[str, str]] = {
        "NAV_DETECTOR": ("CONTRARIAN", "Contrarian"),
        "CARGO_BOT": ("SENTINEL", "Sentinel"),
        "COMMODITY_MONITOR": ("MOMENTUM", "Momentum"),
        "SANCTIONS_BOT": ("FORENSIC", "Forensic"),
        "FX_BOT": ("SYSTEMATIC", "Systematic"),
        "COMPLIANCE_BOT": ("CONSERVATIVE", "Conservative"),
        "SUCCESSION_BOT": ("FORENSIC", "Forensic"),
        "SOVEREIGN_BOT": ("MACRO", "Macro"),
        "ASSET_TRACKER": ("SENTINEL", "Sentinel"),
        "SATELLITE_ANALYTICS": ("AGGRESSIVE", "Aggressive"),
    }

    def register_bots(self, bots) -> None:
        """Pre-populate status map so all bots show as HEALTHY immediately."""
        for bot in bots:
            personality, p_label = self._BOT_PERSONALITIES.get(
                bot.BOT_TYPE, ("SYSTEMATIC", "Systematic")
            )
            self._bot_statuses.setdefault(
                bot.bot_id,
                BotStatus(
                    bot_id=bot.bot_id,
                    bot_type=bot.BOT_TYPE,
                    status="HEALTHY",
                    last_summary=self._BOT_SUMMARIES.get(bot.BOT_TYPE, "Running"),
                    personality=personality,
                    personality_label=p_label,
                    suggested_position_pct=calculate_position(personality, 0.0),
                ),
            )

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def start(self) -> None:
        self._running = True
        log.info("[Commander] Starting — watching the swarm")
        await asyncio.gather(
            self._subscribe_all(),
            self._heartbeat_loop(),
            self._healer.watch_heartbeats(),
            self._report_loop(),
            self._intelligence_loop(),
        )

    def stop(self) -> None:
        self._running = False
        log.info("[Commander] Stopping")

    # ── Subscriptions ──────────────────────────────────────────────────────────

    async def _subscribe_all(self) -> None:
        await self.bus.subscribe("heartbeat.*", self._on_heartbeat)
        await self.bus.subscribe("anomaly.*", self._on_anomaly)
        await self.bus.subscribe("consensus.*", self._on_consensus)
        await self.bus.subscribe("healing.*", self._on_healing)
        log.info("[Commander] Subscribed to all swarm topics")

    async def _on_heartbeat(self, topic: str, payload: dict) -> None:
        bot_id = payload.get("bot_id", "unknown")
        bot_type = payload.get("bot_type", "UNKNOWN")
        if bot_type == "COMMANDER_BOT":
            return  # ignore commander's own heartbeat
        self.health_monitor.record_heartbeat(bot_id)
        status = self._bot_statuses.setdefault(bot_id, BotStatus(bot_id=bot_id, bot_type=bot_type))
        status.last_heartbeat = time.time()
        status.status = "HEALTHY"
        # Update score from heartbeat so dashboard shows live values even without anomaly
        score = float(payload.get("score", 0.0))
        if score >= 0:
            status.last_score = score
        summary = payload.get("summary", "")
        if summary:
            status.last_summary = summary

    async def _on_anomaly(self, topic: str, payload: dict) -> None:
        bot_id = payload.get("bot_id", "unknown")
        payload.get("bot_type", "UNKNOWN")
        score = float(payload.get("score", 0))
        summary = payload.get("summary", "")

        status = self._bot_statuses.get(bot_id)
        if status:
            status.last_score = score
            status.last_summary = summary
            status.last_anomaly_time = time.time()
            # Recompute capital position
            status.suggested_position_pct = calculate_position(
                status.personality, score, safe_haven=self._safe_haven_active
            )
            status.risk_label = risk_label(score)
            if score >= 90:
                status.status = "CRITICAL"
            elif score >= 75:
                status.status = "WARNING"

        # Update fear index
        self._update_fear_index(score, bot_id, summary)

        self._consensus_count += 1
        log.info("[Commander] Anomaly from %s: score=%.1f | %s", bot_id, score, summary)

        await self._check_swarm_correlation(score)

    async def _on_consensus(self, topic: str, payload: dict) -> None:
        round_id = payload.get("round_id", "")
        result = payload.get("consensus", "")
        log.debug("[Commander] Consensus %s → %s", round_id, result)

    async def _capture_alert(self, alert: SwarmAlert) -> None:
        if alert not in self._alert_history:
            self._alert_history.append(alert)

    async def _on_healing(self, topic: str, payload: dict) -> None:
        event = {"received_at": time.time(), **payload}
        self._healing_events.append(event)

        bot_id = payload.get("bot_id", "unknown")
        action = payload.get("action", "unknown")
        reason = payload.get("reason", "unknown")
        explanation = payload.get("explanation", "")
        tier = payload.get("tier", "?")
        resolved = payload.get("auto_resolved", True)

        log.warning(
            "[Commander] SELF-HEAL | bot=%-20s reason=%-30s action=%-25s tier=%s auto=%s",
            bot_id,
            reason,
            action,
            tier,
            resolved,
        )
        if explanation:
            log.warning("[Commander] Explanation: %s", explanation)

        status = self._bot_statuses.get(bot_id)
        if status:
            status.last_summary = f"Self-healed: {reason}"

    # ── Swarm Intelligence Loop ────────────────────────────────────────────────

    async def _intelligence_loop(self) -> None:
        """Periodic intelligence: mode upgrades, bottom prediction, safe-haven check."""
        while self._running:
            await asyncio.sleep(3)
            self._update_swarm_mode()
            self._check_safe_haven_recovery()
            self._check_bottom_signal()

    def _update_fear_index(self, score: float, bot_id: str, summary: str) -> None:
        now = time.time()
        self._fear_history.append((now, score))

        # Exponentially weighted fear index: recent high scores dominate
        if self._fear_history:
            scores = [s for _, s in self._fear_history]
            recent = scores[-min(10, len(scores)):]
            self._fear_index = min(
                100.0,
                float(
                    sum(s * (i + 1) for i, s in enumerate(recent)) / sum(range(1, len(recent) + 1))
                ),
            )

        # Add to war room ticker if significant
        if score >= 75:
            self._war_room_ticker.appendleft(f"{bot_id}: {summary[:60]}")

    def _update_swarm_mode(self) -> None:
        now = time.time()
        if self._safe_haven_active:
            self._swarm_mode = "SAFE_HAVEN"
            return

        # Count bots in warning/critical state in last 60s
        recent_high = [
            s
            for s in self._bot_statuses.values()
            if s.last_score >= 75 and (now - s.last_anomaly_time) < 60
        ]

        prev_mode = self._swarm_mode

        if self._fear_index >= 85 or len(recent_high) >= 5:
            self._swarm_mode = "WAR_ROOM"
            if prev_mode != "WAR_ROOM":
                self._war_room_ts = now
                log.critical(
                    "[Commander] ⚠ WAR ROOM ACTIVATED — fear=%.0f, bots_flagging=%d",
                    self._fear_index,
                    len(recent_high),
                )
        elif self._fear_index >= 60 or len(recent_high) >= 3:
            self._swarm_mode = "ALERT"
        elif self._fear_index < 30 and len(recent_high) == 0:
            self._swarm_mode = "NORMAL"

    def _check_safe_haven_recovery(self) -> None:
        """Auto-recover from safe haven when fear drops below 20."""
        if self._safe_haven_active and self._fear_index < 20:
            elapsed = time.time() - self._safe_haven_ts
            if elapsed > 120:  # hold safe haven for at least 2 minutes
                self._safe_haven_active = False
                self._swarm_mode = "NORMAL"
                # Restore positions
                for s in self._bot_statuses.values():
                    s.suggested_position_pct = calculate_position(
                        s.personality, s.last_score, False
                    )
                log.info(
                    "[Commander] Safe haven deactivated — fear index dropped to %.0",
                    self._fear_index,
                )

    def _check_bottom_signal(self) -> None:
        """Detect potential crash bottom when fear is extreme and stabilising."""
        if self._fear_index < 80:
            self._bottom_prediction = None
            return

        # Look for fear deceleration — was higher 30s ago?
        now = time.time()
        old_scores = [s for ts, s in self._fear_history if (now - ts) > 30]
        if not old_scores:
            return

        old_fear = sum(old_scores[-5:]) / len(old_scores[-5:])
        deceleration = old_fear - self._fear_index

        if deceleration > 5 and self._fear_index > 75:
            bots_signalling = sum(1 for s in self._bot_statuses.values() if s.last_score >= 80)
            confidence = min(95, int(self._fear_index * 0.7 + deceleration * 2))
            self._bottom_prediction = {
                "active": True,
                "confidence": confidence,
                "fear_index": round(self._fear_index, 1),
                "fear_deceleration": round(deceleration, 1),
                "bots_in_crisis": bots_signalling,
                "reasoning": (
                    f"Fear index peaked at {old_fear:.0f} and is decelerating ({deceleration:+.1f}). "
                    f"{bots_signalling} bots in crisis. Historical data suggests "
                    "this regime exhaustion pattern precedes a reversal within 12-72 hours."
                ),
                "signal": "BUY THE DIP" if confidence > 70 else "WATCH FOR ENTRY",
                "timestamp": time.time(),
            }
        else:
            self._bottom_prediction = None

    # ── Safe Haven Mode ────────────────────────────────────────────────────────

    async def activate_safe_haven(self, reason: str = "operator_command") -> dict:
        """Lock all positions to 0.01% — emergency capital protection."""
        self._safe_haven_active = True
        self._safe_haven_ts = time.time()
        self._swarm_mode = "SAFE_HAVEN"

        for s in self._bot_statuses.values():
            s.suggested_position_pct = 0.01

        msg = (
            f"SAFE HAVEN ACTIVATED — all {len(self._bot_statuses)} positions "
            f"locked to 0.01% risk. Reason: {reason}"
        )
        log.critical("[Commander] %s", msg)

        alert = SwarmAlert(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            fund_name="SWARM-WIDE",
            anomaly_score=100.0,
            severity="EMERGENCY",
            consensus="CONFIRMED",
            summary=msg,
            details={
                "reason": reason,
                "positions_locked": len(self._bot_statuses),
                "position_pct": 0.01,
                "fear_index": self._fear_index,
            },
            round_id="SAFE-HAVEN",
        )
        await self.alerter.dispatch(alert)
        await self.bus.publish(
            "safe_haven.activated",
            {
                "activated": True,
                "reason": reason,
                "fear_index": self._fear_index,
                "ts": time.time(),
            },
        )
        return {"activated": True, "positions_locked": len(self._bot_statuses), "message": msg}

    # ── Cross-bot threat correlation ───────────────────────────────────────────

    async def _check_swarm_correlation(self, new_score: float) -> None:
        now = time.time()
        if (now - self._last_correlation_alert) < self._correlation_cooldown:
            return

        recent_high = [
            s
            for s in self._bot_statuses.values()
            if s.last_score >= 75 and s.last_anomaly_time > 0 and (now - s.last_anomaly_time) < 30
        ]
        if len(recent_high) < 3:
            return

        self._last_correlation_alert = now
        correlated_bots = [s.bot_id for s in recent_high]

        # Generate multi-perspective debate
        await self._generate_debate_report(recent_high, new_score)

        log.warning("[Commander] CORRELATED THREAT: %d bots flagging in last 30s", len(recent_high))
        alert = SwarmAlert(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            fund_name="SWARM-WIDE",
            anomaly_score=min(new_score + 10, 100),
            severity="EMERGENCY",
            consensus="CONFIRMED",
            summary=f"Correlated swarm threat: {len(recent_high)} bots flagging simultaneously",
            details={
                "correlated_bots": correlated_bots,
                "bot_scores": {s.bot_id: s.last_score for s in recent_high},
                "mode": self._swarm_mode,
            },
            round_id="SWARM-CORRELATION",
        )
        await self.alerter.dispatch(alert)
        self._alert_history.append(alert)
        self.auditor.record(self.bot_id, self.BOT_TYPE, "correlated_threat", alert.to_dict())

        # Auto-escalate to war room if enough bots agree
        if len(recent_high) >= 4 and not self._safe_haven_active:
            self._swarm_mode = "WAR_ROOM"
            self._war_room_ts = now

        # Auto safe-haven if fear is extreme
        if self._fear_index >= 90 and not self._safe_haven_active:
            await self.activate_safe_haven(reason="auto_chaos_defense")

    async def _generate_debate_report(self, flagging_bots: list, score: float) -> None:
        """Generate a multi-perspective report when bots with different personalities disagree."""
        now = time.time()

        aggressive_bots = [
            s for s in flagging_bots if s.personality in ("AGGRESSIVE", "MOMENTUM", "CONTRARIAN")
        ]
        conservative_bots = [
            s
            for s in flagging_bots
            if s.personality in ("CONSERVATIVE", "RISK_AVERSE", "SYSTEMATIC")
        ]
        neutral_bots = [s for s in flagging_bots if s not in aggressive_bots + conservative_bots]

        # Only generate debate if there's actual disagreement in perspective
        if not aggressive_bots or not conservative_bots:
            majority_view = "HIGH CONFIDENCE: All active bots corroborate the threat."
            minority_view = "No dissenting views detected."
            pos = calculate_position('CONSERVATIVE', score)
            capital_rec = f"Reduce exposure by 60%. Suggested position: {pos:.1f}%"
        else:
            aggressive_conf = sum(s.last_score for s in aggressive_bots) / len(aggressive_bots)
            conservative_conf = sum(s.last_score for s in conservative_bots) / len(
                conservative_bots
            )
            majority_view = (
                f"BULLISH ON THREAT ({len(aggressive_bots)} bots): "
                f"{', '.join(s.bot_id for s in aggressive_bots)} are signalling strong conviction "
                f"(avg score {aggressive_conf:.0f}/100). Recommend immediate position reduction."
            )
            conservative_ids = ', '.join(s.bot_id for s in conservative_bots)
            minority_view = (
                f"CAUTIOUS ({len(conservative_bots)} bots): {conservative_ids} see elevated "
                f"but manageable risk (avg score {conservative_conf:.0f}/100). "
                f"Recommend gradual reduction, not full exit."
            )
            if aggressive_conf > conservative_conf + 10:
                pos = calculate_position('CONSERVATIVE', score)
                capital_rec = f"Aggressive view prevails — cut to {pos:.1f}% capital."
            else:
                pos = calculate_position('SYSTEMATIC', score)
                capital_rec = f"Mixed signals — hold {pos:.1f}% with tight stops."

        report = {
            "timestamp": now,
            "trigger_score": round(score, 1),
            "bots_in_session": len(flagging_bots),
            "majority_view": majority_view,
            "minority_view": minority_view,
            "capital_recommendation": capital_rec,
            "fear_index": round(self._fear_index, 1),
            "mode": self._swarm_mode,
            "perspectives": {
                "aggressive": [
                    {"bot_id": s.bot_id, "score": s.last_score, "personality": s.personality_label}
                    for s in aggressive_bots
                ],
                "conservative": [
                    {"bot_id": s.bot_id, "score": s.last_score, "personality": s.personality_label}
                    for s in conservative_bots
                ],
                "neutral": [
                    {"bot_id": s.bot_id, "score": s.last_score, "personality": s.personality_label}
                    for s in neutral_bots
                ],
            },
        }
        self._debate_reports.appendleft(report)
        log.info(
            "[Commander] Debate report generated — %d bots, fear=%.0",
            len(flagging_bots),
            self._fear_index,
        )

    # ── Voice Command (Jarvis) ─────────────────────────────────────────────────

    def process_voice_command(self, text: str) -> str:
        """Process a Jarvis voice command and return a spoken response."""
        t = text.lower().strip()
        summary = self.get_summary()

        if any(w in t for w in ["status", "how are you", "what's happening", "report", "overview"]):
            mode_msg = {
                "NORMAL": "All systems nominal.",
                "ALERT": "Elevated threat level detected.",
                "WAR_ROOM": "WAR ROOM IS ACTIVE. Multiple simultaneous threats detected.",
                "SAFE_HAVEN": "SAFE HAVEN MODE. All positions locked to minimum risk.",
                "LOCKDOWN": "LOCKDOWN ACTIVE. Operator has halted the swarm.",
            }.get(self._swarm_mode, "Status unknown.")
            return (
                "Genesis Swarm status report. "
                f"{summary.healthy_bots} of {summary.total_bots} bots are healthy. "
                f"{mode_msg} "
                f"Current fear index: {self._fear_index:.0f} out of 100. "
                f"{summary.active_alerts} active alerts. "
                f"{summary.healing_events_1h} self-healing events in the last hour."
            )

        if any(w in t for w in ["alert", "threat", "anomaly", "danger", "signal"]):
            alerts = self.get_recent_alerts(3)
            if not alerts:
                return "No active threats detected. All bots reporting nominal readings."
            last = alerts[-1]
            return (
                f"Latest alert: {last.get('summary', 'Unknown')}. "
                f"Severity: {last.get('severity', 'unknown')}. "
                f"Score: {last.get('anomaly_score', 0):.0f} out of 100. "
                f"Total active alerts: {summary.active_alerts}."
            )

        if any(w in t for w in ["heal", "fix", "repair", "recover", "maintenance"]):
            report = self.get_healing_report(3)
            if not report:
                return "No self-healing events recorded. All bot systems are running normally."
            last = report[-1]
            return (
                f"Latest self-healing event: {last.get('explanation', 'System repaired automatically')} "
                f"Status: {'Auto-resolved' if last.get('auto_resolved') else 'Escalated to operator'}."
            )

        if any(w in t for w in ["position", "capital", "money", "allocat", "invest", "risk"]):
            if self._safe_haven_active:
                return (
                    "SAFE HAVEN IS ACTIVE. All positions are locked to 0.01 percent capital risk. "
                    f"Fear index is {self._fear_index:.0f}. Waiting for threat level to subside."
                )
            positions = self.get_positions()
            if not positions:
                return "No position data available yet."
            total_alloc = sum(p["suggested_position_pct"] for p in positions)
            avg_alloc = total_alloc / len(positions) if positions else 0
            return (
                f"Current average capital allocation: {avg_alloc:.1f} percent per bot. "
                f"Swarm mode is {self._swarm_mode}. "
                f"Fear index: {self._fear_index:.0f} out of 100."
            )

        if any(w in t for w in ["war room", "emergency", "crisis", "fear", "chaos"]):
            return (
                f"Swarm mode is currently {self._swarm_mode}. "
                f"Fear index: {self._fear_index:.0f} out of 100. "
                f"{'War room protocol is ACTIVE.' if self._swarm_mode == 'WAR_ROOM' else 'No emergency protocols active.'} "
                f"Bots in critical state: {sum(1 for s in self._bot_statuses.values() if s.status == 'CRITICAL')}."
            )

        if any(w in t for w in ["bottom", "crash", "buy", "dip", "opportunit"]):
            if self._bottom_prediction and self._bottom_prediction.get("active"):
                bp = self._bottom_prediction
                return (
                    f"BOTTOM SIGNAL DETECTED with {bp['confidence']} percent confidence. "
                    f"{bp['reasoning']} "
                    f"Signal: {bp['signal']}."
                )
            return (
                f"No confirmed bottom signal yet. Fear index is {self._fear_index:.0f}. "
                "I will alert you when conditions suggest a crash bottom is forming."
            )

        if any(w in t for w in ["safe haven", "lock", "protect", "guard"]):
            if self._safe_haven_active:
                return "Safe haven is already active. All positions are at minimum risk."
            return (
                "Safe haven mode is currently inactive. "
                f"Fear index at {self._fear_index:.0f}. "
                "To activate safe haven, use the operator dashboard control."
            )

        if any(w in t for w in ["shutdown", "stop", "halt", "kill", "turn of"]):
            return ("Shutdown requires valid operator key authentication. "
                     "Use the operator dashboard panel or the operator-stop command with your secret key.")

        if any(w in t for w in ["bot", "swarm", "team"]):
            healthy = summary.healthy_bots
            total = summary.total_bots
            return (
                f"The Genesis Swarm has {total} bots operational. "
                f"{healthy} are healthy. "
                "Personalities range from Aggressive Orbital Bot to Conservative Compliance Bot. "
                "All bots vote on threats using Byzantine Fault Tolerant consensus."
            )

        return (
            f"I'm JARVIS, the Genesis Swarm AI. Swarm is {self._swarm_mode}. "
            f"{summary.healthy_bots} bots active. Fear index: {self._fear_index:.0f}. "
            "Say: status, alerts, positions, healing, war room, or bottom signal."
        )

    # ── Health monitoring ──────────────────────────────────────────────────────

    async def _heartbeat_loop(self) -> None:
        while self._running:
            self.health_monitor.record_heartbeat(self.bot_id)
            await self.bus.publish(
                f"heartbeat.{self.bot_id}",
                {"bot_id": self.bot_id, "bot_type": self.BOT_TYPE, "ts": time.time()},
            )
            now = time.time()
            for bot_id, status in self._bot_statuses.items():
                if (now - status.last_heartbeat) > 15 and status.status != "OFFLINE":
                    status.status = "OFFLINE"
                    log.warning("[Commander] Bot %s went OFFLINE", bot_id)
                    await self._healer.respond(bot_id, "heartbeat_timeout", {"bot_id": bot_id})
            await asyncio.sleep(5)

    # ── Self-healing actions ───────────────────────────────────────────────────

    async def _heal_adjust_quorum(self, context: dict) -> None:
        online = sum(1 for s in self._bot_statuses.values() if s.status != "OFFLINE")
        new_quorum = max(2, online // 2 + 1)
        self.consensus.quorum = new_quorum
        log.warning("[Commander] Quorum adjusted to %d (online bots: %d)", new_quorum, online)

    async def _heal_quarantine(self, context: dict) -> None:
        bot_id = context.get("bot_id", "")
        if bot_id in self._bot_statuses:
            self._bot_statuses[bot_id].status = "QUARANTINED"
            log.critical("[Commander] Bot %s QUARANTINED", bot_id)

    async def _on_escalation(self, bot_id: str, failure_type: str, context: dict) -> None:
        alert = SwarmAlert(
            bot_id=self.bot_id,
            bot_type=self.BOT_TYPE,
            fund_name="SWARM",
            anomaly_score=100.0,
            severity="EMERGENCY",
            consensus="CONFIRMED",
            summary=f"HUMAN REQUIRED: {failure_type} on {bot_id}",
            details={"bot_id": bot_id, "failure_type": failure_type, **context},
            round_id="ESCALATION",
        )
        await self.alerter.dispatch(alert)

    # ── Reporting ──────────────────────────────────────────────────────────────

    async def _report_loop(self) -> None:
        while self._running:
            await asyncio.sleep(30)
            summary = self.get_summary()
            log.info(
                "[Commander] Swarm status: %d/%d healthy | alerts: %d | mode: %s | fear: %.0",
                summary.healthy_bots,
                summary.total_bots,
                summary.active_alerts,
                self._swarm_mode,
                self._fear_index,
            )

    def get_summary(self) -> SwarmSummary:
        now = time.time()
        statuses = list(self._bot_statuses.values())
        healthy = sum(1 for s in statuses if s.status == "HEALTHY")
        recent_alerts = (
            [
                a
                for a in self._alert_history
                if (now - __import__("datetime").datetime.fromisoformat(a.timestamp).timestamp())
                < 3600
            ]
            if self._alert_history
            else []
        )
        healing_1h = sum(1 for e in self._healing_events if (now - e.get("ts", 0)) < 3600)
        top = max(statuses, key=lambda s: s.last_score, default=None)

        return SwarmSummary(
            timestamp=now,
            total_bots=len(statuses),
            healthy_bots=healthy,
            active_alerts=len(recent_alerts),
            top_threat=top.bot_id if top and top.last_score > 0 else None,
            top_score=top.last_score if top else 0.0,
            bot_statuses=statuses,
            healing_events_1h=healing_1h,
            consensus_rounds_1h=self._consensus_count,
        )

    def get_bot_statuses(self) -> dict[str, dict]:
        cfg = PERSONALITY_CONFIGS
        result = {
            bid: {
                "bot_id": s.bot_id,
                "bot_type": s.bot_type,
                "status": s.status,
                "last_score": round(s.last_score, 1),
                "is_anomaly": s.status in ("ANOMALY", "CRITICAL", "WARNING") or s.last_score >= 75,
                "healthy": s.status == "HEALTHY",
                "threshold": 75.0,
                "last_summary": s.last_summary,
                "last_heartbeat_ago": round(time.time() - s.last_heartbeat, 1),
                "personality": s.personality,
                "personality_label": s.personality_label,
                "personality_color": cfg.get(s.personality, {}).get("color", "#64748b"),
                "personality_motto": cfg.get(s.personality, {}).get("motto", ""),
                "suggested_position_pct": round(s.suggested_position_pct, 2),
                "risk_label": s.risk_label,
            }
            for bid, s in self._bot_statuses.items()
        }
        # Always include COMMANDER_BOT so NodeGraph has a hub node
        result[self.bot_id] = {
            "bot_id": self.bot_id,
            "bot_type": self.BOT_TYPE,
            "status": "HEALTHY",
            "last_score": 0.0,
            "is_anomaly": False,
            "healthy": True,
            "threshold": 75.0,
            "last_summary": "Managing swarm — all bots nominal",
            "last_heartbeat_ago": 0.0,
            "personality": "COMMANDER",
            "personality_label": "Commander",
            "personality_color": "#ffd700",
            "personality_motto": "Sovereign oversight",
            "suggested_position_pct": 0.0,
            "risk_label": "COMMANDER",
        }
        return result

    def get_positions(self) -> list[dict]:
        cfg = PERSONALITY_CONFIGS
        return [
            {
                "bot_id": s.bot_id,
                "bot_type": s.bot_type,
                "personality": s.personality,
                "personality_label": s.personality_label,
                "personality_color": cfg.get(s.personality, {}).get("color", "#64748b"),
                "last_score": round(s.last_score, 1),
                "suggested_position_pct": round(s.suggested_position_pct, 2),
                "risk_label": s.risk_label,
                "mode": "SAFE_HAVEN" if self._safe_haven_active else "NORMAL",
            }
            for s in self._bot_statuses.values()
        ]

    def get_swarm_mode(self) -> dict:
        return {
            "mode": self._swarm_mode,
            "fear_index": round(self._fear_index, 1),
            "safe_haven_active": self._safe_haven_active,
            "war_room_since": (
                round(time.time() - self._war_room_ts, 0) if self._war_room_ts else None
            ),
            "ticker": list(self._war_room_ticker)[:8],
        }

    def get_debate_reports(self, n: int = 3) -> list[dict]:
        return list(self._debate_reports)[:n]

    def get_bottom_prediction(self) -> Optional[dict]:
        return self._bottom_prediction

    # ── Operator Override ──────────────────────────────────────────────────────

    def operator_shutdown(self, operator_key: str) -> str:
        if not self._verify_operator(operator_key):
            log.critical("[Commander] UNAUTHORISED shutdown attempt — rejected")
            return "REJECTED: invalid operator key"
        log.critical("[Commander] OPERATOR SHUTDOWN — all bots stopping")
        self.stop()
        for s in self._bot_statuses.values():
            s.status = "OFFLINE"
        self.auditor.record(self.bot_id, self.BOT_TYPE, "operator_shutdown", {"by": "operator"})
        return "SHUTDOWN: all bots stopped by operator"

    def operator_quarantine(self, bot_id: str, operator_key: str) -> str:
        if not self._verify_operator(operator_key):
            return "REJECTED: invalid operator key"
        status = self._bot_statuses.get(bot_id)
        if not status:
            return f"REJECTED: bot {bot_id} not found"
        status.status = "QUARANTINED"
        self.auditor.record(self.bot_id, self.BOT_TYPE, "operator_quarantine", {"bot_id": bot_id})
        log.critical("[Commander] OPERATOR QUARANTINE: %s", bot_id)
        return f"QUARANTINED: {bot_id} isolated by operator"

    def operator_override_threshold(
        self, bot_id: str, new_threshold: float, operator_key: str
    ) -> str:
        if not self._verify_operator(operator_key):
            return "REJECTED: invalid operator key"
        self.auditor.record(
            self.bot_id,
            self.BOT_TYPE,
            "operator_threshold_override",
            {"bot_id": bot_id, "new_threshold": new_threshold},
        )
        log.warning("[Commander] OPERATOR OVERRIDE: %s threshold → %.1", bot_id, new_threshold)
        return f"OVERRIDE: {bot_id} threshold set to {new_threshold}"

    def operator_status_report(self, operator_key: str) -> dict:
        if not self._verify_operator(operator_key):
            return {"error": "REJECTED: invalid operator key"}
        return {
            "authority": "OPERATOR",
            "swarm_summary": {
                "total_bots": len(self._bot_statuses),
                "healthy": sum(1 for s in self._bot_statuses.values() if s.status == "HEALTHY"),
                "critical": sum(1 for s in self._bot_statuses.values() if s.status == "CRITICAL"),
                "offline": sum(1 for s in self._bot_statuses.values() if s.status == "OFFLINE"),
            },
            "mode": self.get_swarm_mode(),
            "bot_statuses": self.get_bot_statuses(),
            "recent_alerts": self.get_recent_alerts(10),
            "healing_report": self.get_healing_report(10),
            "consensus_rounds": self._consensus_count,
        }

    def _verify_operator(self, key: str) -> bool:
        import hmac
        import os

        expected = os.environ.get("SWARM_OPERATOR_KEY", "")
        if not expected:
            return False
        return hmac.compare_digest(key, expected)

    def get_recent_alerts(self, n: int = 20) -> list[dict]:
        return [a.to_dict() for a in list(self._alert_history)[-n:]]

    def get_healing_report(self, n: int = 20) -> list[dict]:
        events = list(self._healing_events)[-n:]
        return [
            {
                "bot_id": e.get("bot_id", "unknown"),
                "bot_type": e.get("bot_type", "unknown"),
                "reason": e.get("reason", "unknown"),
                "action": e.get("action", "unknown"),
                "explanation": e.get("explanation", "No explanation available."),
                "tier": e.get("tier", "?"),
                "auto_resolved": e.get("auto_resolved", True),
                "time_ago_sec": round(time.time() - e.get("received_at", time.time()), 1),
            }
            for e in events
        ]

    def explain_healing(self, bot_id: str) -> list[dict]:
        return [e for e in self.get_healing_report(n=100) if e["bot_id"] == bot_id]

    def healing_summary(self) -> str:
        report = self.get_healing_report(n=50)
        if not report:
            return "No self-healing events recorded. All bots running normally."
        lines = [f"Self-Healing Report — {len(report)} event(s):"]
        for e in report:
            status = "AUTO-RESOLVED" if e["auto_resolved"] else "ESCALATED"
            lines.append(
                f"  [{status}] {e['bot_id']} — {e['explanation']} ({e['time_ago_sec']}s ago)"
            )
        return "\n".join(lines)
