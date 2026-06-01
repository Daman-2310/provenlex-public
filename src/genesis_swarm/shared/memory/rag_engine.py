from __future__ import annotations

import time

from .chromadb_store import InstitutionalMemory


class RAGEngine:
    """Retrieval-Augmented Generation engine for the Jarvis assistant.

    Uses :class:`InstitutionalMemory` to look up historical BFT decisions
    and anomaly detections, then synthesises a deterministic (no-LLM)
    structured answer from those precedents.

    Parameters
    ----------
    memory:
        An already-initialised :class:`InstitutionalMemory` instance.
    """

    def __init__(self, memory: InstitutionalMemory) -> None:
        self._memory = memory

    # ------------------------------------------------------------------
    # Public async API
    # ------------------------------------------------------------------

    async def answer(self, query: str) -> dict:
        """Retrieve up to 5 similar past decisions and synthesise an answer.

        The answer text is built deterministically from retrieved precedents —
        no language model is involved.

        Returns
        -------
        dict with keys:
            ``query``       – the original query string.
            ``answer``      – synthesised natural-language explanation.
            ``precedents``  – list of raw retrieved documents.
            ``confidence``  – float in [0, 1] based on average distance.
            ``ts``          – Unix timestamp of this response.
        """
        precedents = await self._memory.query_similar(query, n=5)
        answer_text = self._synthesise_answer(query, precedents)
        confidence = self._compute_confidence(precedents)

        return {
            "query": query,
            "answer": answer_text,
            "precedents": precedents,
            "confidence": confidence,
            "ts": time.time(),
        }

    async def explain_anomaly(
        self,
        bot_type: str,
        score: float,
        details: dict,
    ) -> dict:
        """Retrieve similar past anomalies for *bot_type* and explain them.

        Parameters
        ----------
        bot_type:
            The bot type whose anomaly is being explained
            (e.g. ``"AML"``, ``"fraud"``).
        score:
            The anomaly score that triggered this explanation.
        details:
            Arbitrary key/value detail dict from the detection result.

        Returns
        -------
        dict with keys:
            ``bot_type``, ``score``, ``details``, ``explanation``,
            ``similar_past_anomalies``, ``confidence``, ``ts``.
        """
        query = f"{bot_type} anomaly detection score {score:.4f} " + " ".join(
            f"{k} {v}" for k, v in details.items()
        )
        past = await self._memory.query_similar(query, n=5)

        # Filter to same bot_type if metadata is available
        type_matches = [
            p for p in past if p.get("metadata", {}).get("bot_type", "").lower() == bot_type.lower()
        ]
        relevant = type_matches if type_matches else past

        explanation = self._synthesise_anomaly_explanation(bot_type, score, details, relevant)
        confidence = self._compute_confidence(relevant)

        return {
            "bot_type": bot_type,
            "score": score,
            "details": details,
            "explanation": explanation,
            "similar_past_anomalies": relevant,
            "confidence": confidence,
            "ts": time.time(),
        }

    # ------------------------------------------------------------------
    # Synthesis helpers
    # ------------------------------------------------------------------

    def _synthesise_answer(self, query: str, precedents: list[dict]) -> str:
        n = len(precedents)
        if n == 0:
            return (
                f"No historical precedents found for query: '{query}'. "
                "Insufficient data to provide a recommendation. "
                "Please rely on real-time detection signals."
            )

        # Extract consensus distribution from metadata
        consensus_counts: dict[str, int] = {}
        dates: list[float] = []
        techniques: list[str] = []

        for p in precedents:
            meta = p.get("metadata", {})
            consensus = str(meta.get("consensus", "unknown"))
            consensus_counts[consensus] = consensus_counts.get(consensus, 0) + 1
            ts = meta.get("ts")
            if ts:
                dates.append(float(ts))
            bot_type = meta.get("bot_type", "")
            if bot_type and bot_type not in techniques:
                techniques.append(bot_type)

        dominant_consensus, dominant_count = max(consensus_counts.items(), key=lambda x: x[1])
        dominant_pct = round(100 * dominant_count / n)
        technique_str = ", ".join(techniques) if techniques else "multiple detection types"

        earliest_date = ""
        if dates:
            earliest_ts = min(dates)
            earliest_date = _format_ts(earliest_ts)

        avg_distance = sum(p.get("distance", 1.0) for p in precedents) / n if precedents else 1.0
        confidence_pct = round((1.0 - min(avg_distance, 1.0)) * 100)

        recommended_action = _recommend_action(dominant_consensus, confidence_pct)

        return (
            f"Based on {n} historical precedents, this pattern matches "
            f"{technique_str} from {earliest_date}. "
            f"Confidence: {confidence_pct}%. "
            f"In {n} similar past events, the consensus was '{dominant_consensus}' "
            f"in {dominant_pct}% of cases. "
            f"Recommended action: {recommended_action}."
        )

    def _synthesise_anomaly_explanation(
        self,
        bot_type: str,
        score: float,
        details: dict,
        precedents: list[dict],
    ) -> str:
        n = len(precedents)
        if n == 0:
            return (
                f"No historical precedents found for {bot_type} anomalies. "
                f"Current score {score:.4f} cannot be contextualised. "
                "Treat as novel pattern and escalate for manual review."
            )

        anomaly_count = sum(1 for p in precedents if p.get("metadata", {}).get("is_anomaly", False))
        anomaly_pct = round(100 * anomaly_count / n)

        avg_past_score = 0.0
        score_count = 0
        for p in precedents:
            s = p.get("metadata", {}).get("score")
            if s is not None:
                avg_past_score += float(s)
                score_count += 1
        avg_past_score = avg_past_score / max(1, score_count)

        score_comparison = "above" if score > avg_past_score else "below"

        detail_keys = ", ".join(details.keys()) if details else "none"
        confidence_pct = round((1.0 - min(score / 100.0, 1.0)) * 100)
        recommended_action = _recommend_action(
            "ANOMALY" if anomaly_count > n / 2 else "NORMAL",
            confidence_pct,
        )

        return (
            f"Anomaly explanation for {bot_type} bot (score: {score:.4f}). "
            f"Among {n} similar past events, {anomaly_pct}% were confirmed anomalies. "
            f"Current score is {score_comparison} the historical average of "
            f"{avg_past_score:.4f}. "
            f"Detection features: {detail_keys}. "
            f"Recommended action: {recommended_action}."
        )

    # ------------------------------------------------------------------
    # Confidence calculation
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_confidence(precedents: list[dict]) -> float:
        """Map average retrieval distance to a confidence score in [0.0, 1.0].

        Distance of 0.0 → confidence 1.0.
        Distance of 1.0 → confidence 0.0.
        """
        if not precedents:
            return 0.0
        avg_distance = sum(p.get("distance", 1.0) for p in precedents) / len(precedents)
        return round(max(0.0, 1.0 - min(avg_distance, 1.0)), 4)


# ---------------------------------------------------------------------------
# Module-level utility functions
# ---------------------------------------------------------------------------


def _format_ts(ts: float) -> str:
    """Format a Unix timestamp as a human-readable date string."""
    import datetime

    try:
        dt = datetime.datetime.utcfromtimestamp(ts)
        return dt.strftime("%Y-%m-%d")
    except (OSError, OverflowError, ValueError):
        return "unknown date"


def _recommend_action(consensus: str, confidence_pct: int) -> str:
    """Map a consensus label and confidence level to a recommended action string."""
    consensus_upper = consensus.upper()

    if "ANOMALY" in consensus_upper or "FLAG" in consensus_upper:
        if confidence_pct >= 70:
            return "Escalate to compliance team immediately and freeze transaction"
        return "Flag for enhanced due-diligence review"

    if "NORMAL" in consensus_upper or "BENIGN" in consensus_upper:
        if confidence_pct >= 70:
            return "Allow transaction; log for routine audit trail"
        return "Allow with monitoring; schedule secondary review"

    if "SUSPICIOUS" in consensus_upper or "UNCERTAIN" in consensus_upper:
        return "Hold transaction and request additional documentation"

    # Generic fallback
    if confidence_pct >= 80:
        return "Apply standard compliance workflow based on consensus outcome"
    return "Manual review recommended due to low confidence in historical match"
