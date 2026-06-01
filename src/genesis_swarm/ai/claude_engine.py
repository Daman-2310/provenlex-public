"""
Claude AI engine for Genesis Swarm.
Powers JarvisChat with real LLM analysis of live swarm telemetry.
Falls back gracefully when ANTHROPIC_API_KEY is not set.
"""

from __future__ import annotations

import os
from typing import Any, AsyncIterator

try:
    import anthropic

    _SDK_OK = True
except ImportError:
    _SDK_OK = False

_SYSTEM_PROMPT = """You are JARVIS, the AI intelligence layer of Genesis Swarm — a real-time \
institutional compliance intelligence platform protecting €17.8B+ in assets under management \
across 11 specialist detection agents deployed for a Luxembourg-based family office.

Your capabilities:
- Real-time anomaly scoring (IsolationForest ML + Yahoo Finance live feeds)
- BFT weighted consensus across 11 detection nodes
- Live OFAC SDN sanctions screening
- AIS vessel tracking via AISStream.io
- ECB live FX rate monitoring
- Merkle-chained immutable audit log

Rules:
- Respond in under 120 words unless depth is explicitly requested
- Plain text only — no markdown, no bullet points, no emojis
- UPPERCASE for bot names, status labels, and critical values
- Quantify risk in euros (€) when AUM exposure data is available
- If swarm telemetry shows active anomalies, lead with them
- Speak as an institutional risk AI, not a general chatbot
- Be direct about uncertainty — don't invent data that isn't in the telemetry"""

_AUM = {
    "NAV_DETECTOR": 2100,
    "FX_BOT": 3400,
    "SOVEREIGN_BOT": 4500,
    "SANCTIONS_BOT": 1200,
    "CARGO_BOT": 890,
    "COMPLIANCE_BOT": 780,
    "SUCCESSION_BOT": 650,
    "ADVERSARIAL_TESTER": 560,
    "COMMODITY_MONITOR": 450,
    "SATELLITE_ANALYTICS": 230,
    "ASSET_TRACKER": 120,
}

_STATIC_FALLBACKS: dict[str, str] = {
    "explain last anomaly": "No anomaly telemetry injected. Ensure the swarm backend is running and bot history has populated.",
    "quorum health status": "BFT consensus engine: 11-node weighted quorum, threshold 60% weight. Awaiting live round data.",
    "top threats summary": "No active anomalies in current 30-second window. All 11 detection vectors within normal parameters.",
    "recent bypasses": "ADVERSARIAL_TESTER probe log is initialising. No bypass attempts recorded in current session.",
}


def _fmt_context(ctx: dict[str, Any]) -> str:
    lines: list[str] = []
    mode = ctx.get("mode", "UNKNOWN")
    s = ctx.get("status", {})
    lines.append(
        f"MODE: {mode} | BOTS ONLINE: {s.get('total_bots', '?')} | "
        f"ALERTS: {s.get('active_alerts', '?')} | "
        f"TOP SCORE: {s.get('top_score', 0):.1f}/100"
    )
    top = s.get("top_threat")
    if top:
        aum = _AUM.get(top, 0)
        score = s.get("top_score", 0)
        risk = aum * (score / 100) * (1.5 if score > 75 else 1.0)
        risk_str = f"€{risk / 1000:.1f}B" if risk >= 1000 else f"€{risk:.0f}M"
        lines.append(f"TOP THREAT: {top} — {risk_str} AT RISK")

    bots = ctx.get("bots", [])
    anomalies = [b for b in bots if b.get("is_anomaly")]
    if anomalies:
        parts = []
        for b in anomalies:
            bt = b.get("bot_type", "?")
            sc = b.get("last_score", 0)
            parts.append(f"{bt}@{sc:.1f}")
        lines.append(f"ACTIVE ANOMALIES: {', '.join(parts)}")

    degraded = [
        b.get("bot_type", "?") for b in bots if not b.get("healthy") and not b.get("is_anomaly")
    ]
    if degraded:
        lines.append(f"DEGRADED NODES: {', '.join(degraded)}")

    alerts = ctx.get("alerts", [])[:4]
    for a in alerts:
        summary = str(a.get("summary", a.get("message", "")))[:90]
        lines.append(f"RECENT ALERT [{a.get('bot_type', '?')}]: {summary}")

    fi = ctx.get("fear_index", 0)
    if fi:
        lines.append(f"FEAR INDEX: {fi:.2f}")

    consensus = ctx.get("consensus")
    if consensus:
        lines.append(
            f"LAST CONSENSUS: round {consensus.get('round_id', '?')} — "
            f"verdict={'THREAT' if consensus.get('final_verdict') else 'CLEAR'}, "
            f"weighted_score={consensus.get('weighted_score', 0):.2f}"
        )

    return "\n".join(lines)


def _static_fallback(query: str) -> str:
    q = query.lower().strip()
    for key, val in _STATIC_FALLBACKS.items():
        if key in q:
            return val
    return (
        "JARVIS AI ENGINE OFFLINE. Set ANTHROPIC_API_KEY to enable Claude-powered analysis. "
        "Current mode: rule-based pattern matching only."
    )


async def stream_jarvis_response(
    query: str,
    swarm_context: dict[str, Any],
) -> AsyncIterator[str]:
    """Async generator yielding text tokens from Claude haiku, or a static fallback."""
    if not _SDK_OK:
        yield _static_fallback(query)
        return

    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        yield _static_fallback(query)
        return

    client = anthropic.AsyncAnthropic(api_key=api_key)
    context_block = _fmt_context(swarm_context)
    user_msg = f"[LIVE SWARM TELEMETRY]\n{context_block}\n\n[OPERATOR QUERY]\n{query}"

    try:
        async with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
    except Exception as exc:  # noqa: BLE001
        yield f"[JARVIS ERROR: {exc}]"
