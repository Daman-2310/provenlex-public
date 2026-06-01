from __future__ import annotations

import asyncio
import json
import time
from typing import Any

# ---------------------------------------------------------------------------
# Optional ChromaDB import — fall back gracefully if not installed.
# ---------------------------------------------------------------------------

try:
    import chromadb  # type: ignore[import]
    from chromadb.utils import embedding_functions  # type: ignore[import]

    _CHROMADB_AVAILABLE = True
except ImportError:  # pragma: no cover
    chromadb = None  # type: ignore[assignment]
    embedding_functions = None  # type: ignore[assignment]
    _CHROMADB_AVAILABLE = False


# ---------------------------------------------------------------------------
# InstitutionalMemory
# ---------------------------------------------------------------------------


class InstitutionalMemory:
    """Vector DB institutional memory using ChromaDB.

    When ChromaDB is not installed the class falls back to an in-memory
    dict store with simple word-overlap similarity search.  The public
    API is identical in both cases.

    Parameters
    ----------
    persist_dir:
        Directory used by ChromaDB for on-disk persistence.
        Ignored when the fallback backend is active.
    """

    _DECISIONS_COLLECTION = "bft_decisions"
    _DETECTIONS_COLLECTION = "anomaly_detections"

    def __init__(self, persist_dir: str = "./chroma_db") -> None:
        self._backend: str
        if _CHROMADB_AVAILABLE:
            self._backend = "chromadb"
            self._client = chromadb.PersistentClient(path=persist_dir)
            self._embed_fn = self._build_embedding_function()
            self._decisions = self._client.get_or_create_collection(
                name=self._DECISIONS_COLLECTION,
                embedding_function=self._embed_fn,
            )
            self._detections = self._client.get_or_create_collection(
                name=self._DETECTIONS_COLLECTION,
                embedding_function=self._embed_fn,
            )
        else:
            self._backend = "fallback"
            self._fallback_store: list[dict] = []

    # ------------------------------------------------------------------
    # Public async API
    # ------------------------------------------------------------------

    async def store_decision(self, decision: dict) -> str:
        """Embed and store a BFT consensus result.

        Parameters
        ----------
        decision:
            Must contain at least ``round_id`` and ``consensus`` keys.

        Returns
        -------
        str
            The generated document ID: ``BFT-{round_id}-{ts_ms}``.
        """
        ts_ms = int(time.time() * 1000)
        round_id = decision.get("round_id", "unknown")
        doc_id = f"BFT-{round_id}-{ts_ms}"
        document = self._decision_to_text(decision)
        metadata = {
            "bot_type": str(decision.get("bot_type", "")),
            "consensus": str(decision.get("consensus", "")),
            "score": float(decision.get("score", 0.0)),
            "ts": float(decision.get("ts", time.time())),
            "collection": "decision",
        }

        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self._upsert(
                collection_key="decision",
                doc_id=doc_id,
                document=document,
                metadata=metadata,
            ),
        )
        return doc_id

    async def query_similar(
        self,
        query_text: str,
        n: int = 5,
    ) -> list[dict]:
        """Semantic search across both collections.

        Returns
        -------
        list[dict]
            Each element has keys ``id``, ``document``, ``metadata``,
            ``distance``.
        """
        results = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self._query(query_text, n),
        )
        return results

    async def store_detection(self, result_dict: dict) -> str:
        """Store an anomaly detection event.

        Returns the generated document ID.
        """
        ts_ms = int(time.time() * 1000)
        bot_id = result_dict.get("bot_id", "unknown")
        doc_id = f"DET-{bot_id}-{ts_ms}"
        document = self._detection_to_text(result_dict)
        metadata = {
            "bot_id": str(result_dict.get("bot_id", "")),
            "bot_type": str(result_dict.get("bot_type", "")),
            "score": float(result_dict.get("score", 0.0)),
            "is_anomaly": bool(result_dict.get("is_anomaly", False)),
            "ts": float(time.time()),
            "collection": "detection",
        }

        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self._upsert(
                collection_key="detection",
                doc_id=doc_id,
                document=document,
                metadata=metadata,
            ),
        )
        return doc_id

    def get_stats(self) -> dict:
        """Return storage statistics."""
        if self._backend == "chromadb":
            return {
                "total_decisions": self._decisions.count(),
                "total_detections": self._detections.count(),
                "backend": "chromadb",
            }
        decisions = sum(1 for r in self._fallback_store if r.get("collection") == "decision")
        detections = sum(1 for r in self._fallback_store if r.get("collection") == "detection")
        return {
            "total_decisions": decisions,
            "total_detections": detections,
            "backend": "fallback",
        }

    # ------------------------------------------------------------------
    # ChromaDB helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_embedding_function() -> Any:
        try:
            return embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name="all-MiniLM-L6-v2"
            )
        except Exception:
            # sentence-transformers not installed — use default ChromaDB embeddings
            return embedding_functions.DefaultEmbeddingFunction()

    def _upsert(
        self,
        collection_key: str,
        doc_id: str,
        document: str,
        metadata: dict,
    ) -> None:
        if self._backend == "chromadb":
            collection = self._decisions if collection_key == "decision" else self._detections
            collection.upsert(
                ids=[doc_id],
                documents=[document],
                metadatas=[metadata],
            )
        else:
            self._fallback_store.append(
                {
                    "id": doc_id,
                    "document": document,
                    "metadata": metadata,
                    "collection": metadata.get("collection", collection_key),
                }
            )

    def _query(self, query_text: str, n: int) -> list[dict]:
        if self._backend == "chromadb":
            # Query both collections and merge, sort by distance
            results: list[dict] = []
            for collection in (self._decisions, self._detections):
                count = collection.count()
                if count == 0:
                    continue
                k = min(n, count)
                res = collection.query(
                    query_texts=[query_text],
                    n_results=k,
                    include=["documents", "metadatas", "distances"],
                )
                for i, doc_id in enumerate(res["ids"][0]):
                    results.append(
                        {
                            "id": doc_id,
                            "document": res["documents"][0][i],
                            "metadata": res["metadatas"][0][i],
                            "distance": res["distances"][0][i],
                        }
                    )
            results.sort(key=lambda x: x["distance"])
            return results[:n]
        else:
            return self._fallback_query(query_text, n)

    def _fallback_query(self, query_text: str, n: int) -> list[dict]:
        """Word-overlap similarity search for the fallback backend."""
        query_words = set(query_text.lower().split())
        scored: list[tuple[float, dict]] = []
        for record in self._fallback_store:
            doc_words = set(record.get("document", "").lower().split())
            overlap = len(query_words & doc_words)
            union = len(query_words | doc_words)
            # Jaccard similarity; distance = 1 - similarity
            similarity = overlap / max(1, union)
            distance = 1.0 - similarity
            scored.append(
                (
                    distance,
                    {
                        "id": record["id"],
                        "document": record.get("document", ""),
                        "metadata": record.get("metadata", {}),
                        "distance": distance,
                    },
                )
            )
        scored.sort(key=lambda x: x[0])
        return [item for _, item in scored[:n]]

    # ------------------------------------------------------------------
    # Document text builders
    # ------------------------------------------------------------------

    @staticmethod
    def _decision_to_text(decision: dict) -> str:
        round_id = decision.get("round_id", "unknown")
        consensus = decision.get("consensus", "unknown")
        bot_type = decision.get("bot_type", "unknown")
        score = decision.get("score", 0.0)
        ts = decision.get("ts", time.time())
        corroborate = decision.get("corroborate", 0)
        contradict = decision.get("contradict", 0)
        neutral = decision.get("neutral", 0)
        byz = decision.get("byzantine_flags", [])
        byzantine_count = len(byz) if isinstance(byz, list) else int(byz)
        return (
            f"BFT consensus round {round_id} for bot type {bot_type}. "
            f"Outcome: {consensus}. Anomaly score: {score:.4f}. "
            f"Votes — corroborate: {corroborate}, contradict: {contradict}, "
            f"neutral: {neutral}. Byzantine flags: {byzantine_count}. "
            f"Timestamp: {ts}."
        )

    @staticmethod
    def _detection_to_text(result: dict) -> str:
        bot_id = result.get("bot_id", "unknown")
        bot_type = result.get("bot_type", "unknown")
        score = result.get("score", 0.0)
        is_anomaly = result.get("is_anomaly", False)
        threshold = result.get("threshold", 0.0)
        summary = result.get("summary", "")
        details = result.get("details", {})
        details_text = json.dumps(details, separators=(",", ":")) if details else "{}"
        return (
            f"Anomaly detection by {bot_type} bot {bot_id}. "
            f"Score: {score:.4f} (threshold: {threshold:.4f}). "
            f"Anomaly detected: {is_anomaly}. "
            f"Summary: {summary}. Details: {details_text}."
        )
