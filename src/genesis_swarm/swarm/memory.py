"""
Vectorized Memory Mesh — Pillar 5.

SwarmMemoryBridge provides a long-term, cross-agent shared memory layer backed
by Qdrant vector database.  Embeddings are stored with cosine-similarity search
enabling contextual memory retrieval across the entire agent mesh.

Architecture
------------
- Collection schema: 1536-dimensional dense vectors, cosine distance metric
  (compatible with OpenAI text-embedding-3-small, ada-002, and Anthropic outputs)
- Self-healing: collection is auto-created with HNSW index on first access if missing
- Thread-safety: all blocking Qdrant I/O dispatched to a dedicated ThreadPoolExecutor
  via run_in_executor so the main asyncio event loop is never blocked
- Retry: tenacity AsyncRetrying on transient connection failures (3 attempts, jitter)

Install
-------
    pip install 'genesis-swarm[vectordb]'

Env vars
--------
QDRANT_URL                  http://localhost:6333 (default)
QDRANT_API_KEY              optional; set for Qdrant Cloud authentication
GENESIS_MEMORY_COLLECTION   swarm_memory (default)
GENESIS_EMBEDDING_DIM       1536 (default)

Usage
-----
    async with SwarmMemoryBridge.from_env() as mem:
        embedding = embed_text("NAV break detected: 12% deviation")  # list[float] len=1536
        await mem.store_memory(
            agent_id="compliance-bot",
            content="NAV break detected: 12% deviation from benchmark",
            embedding=embedding,
            metadata={"case_id": "C-001", "severity": "high"},
        )
        results = await mem.query_shared_memory(
            embedding=embed_text("NAV deviation"),
            top_k=5,
            filter_agent_id="compliance-bot",
        )
        for hit in results:
            print(hit.score, hit.content)
"""

from __future__ import annotations

import asyncio
import functools
import logging
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Callable, TypeVar

from pydantic import BaseModel, ConfigDict, Field
from tenacity import (
    AsyncRetrying,
    RetryError,
    before_sleep_log,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

_log = logging.getLogger(__name__)
_T = TypeVar("_T")

# ── Optional Qdrant import ────────────────────────────────────────────────────

try:
    from qdrant_client import QdrantClient  # type: ignore[import-untyped]
    from qdrant_client.http import models as qmodels  # type: ignore[import-untyped]

    _QDRANT_AVAILABLE = True
except ImportError:
    _QDRANT_AVAILABLE = False

_EMBEDDING_DIM_DEFAULT: int = 1536
_COLLECTION_DEFAULT: str = "swarm_memory"
_RETRY_ATTEMPTS: int = 3


# ── Memory models ─────────────────────────────────────────────────────────────


class MemoryRecord(BaseModel):
    """A single memory unit passed to store_memory()."""

    model_config = ConfigDict(frozen=True)

    record_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str
    content: str
    embedding: list[float]
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: float = Field(default_factory=time.time)
    tenant_id: str = "default"


@dataclass(frozen=True)
class MemoryHit:
    """A single search result returned by query_shared_memory()."""

    record_id: str
    score: float
    agent_id: str
    content: str
    metadata: dict[str, Any]
    created_at: float


# ── Exceptions ────────────────────────────────────────────────────────────────


class MemoryUnavailableError(Exception):
    """Raised when the vector database is unreachable after all retry attempts."""


# ── SwarmMemoryBridge ─────────────────────────────────────────────────────────


class SwarmMemoryBridge:
    """
    Async long-term memory bridge backed by Qdrant vector database.

    All blocking Qdrant client calls are dispatched to a dedicated
    ThreadPoolExecutor via asyncio.get_event_loop().run_in_executor() so
    the asyncio event loop is never blocked by network I/O.

    The Qdrant collection is automatically registered on first access with:
      - 1536-dimensional dense vectors (cosine distance)
      - HNSW index (m=16, ef_construct=200)
      - 2 default segments for parallel read throughput

    Parameters
    ----------
    url:
        Qdrant server URL, e.g. ``http://localhost:6333``.
    api_key:
        Optional Qdrant Cloud authentication key.
    collection_name:
        Target collection name in Qdrant.
    embedding_dim:
        Vector dimension — must exactly match the embedding model output.
    max_workers:
        Thread pool size for blocking I/O dispatch.
    """

    def __init__(
        self,
        url: str = "http://localhost:6333",
        api_key: str | None = None,
        collection_name: str = _COLLECTION_DEFAULT,
        embedding_dim: int = _EMBEDDING_DIM_DEFAULT,
        max_workers: int = 4,
    ) -> None:
        if not _QDRANT_AVAILABLE:
            raise ImportError(
                "qdrant-client is required for SwarmMemoryBridge. "
                "Install with: pip install 'genesis-swarm[vectordb]'"
            )
        self._url = url
        self._api_key = api_key
        self._collection = collection_name
        self._embedding_dim = embedding_dim
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="qdrant-io",
        )
        self._client: Any = None  # QdrantClient, lazily connected
        self._collection_ready: bool = False
        self._lock = asyncio.Lock()

    @classmethod
    def from_env(cls) -> "SwarmMemoryBridge":
        """Construct from environment variables."""
        return cls(
            url=os.getenv("QDRANT_URL", "http://localhost:6333"),
            api_key=os.getenv("QDRANT_API_KEY") or None,
            collection_name=os.getenv("GENESIS_MEMORY_COLLECTION", _COLLECTION_DEFAULT),
            embedding_dim=int(os.getenv("GENESIS_EMBEDDING_DIM", str(_EMBEDDING_DIM_DEFAULT))),
        )

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def connect(self) -> None:
        """Open the Qdrant client and trigger self-healing collection setup."""
        async with self._lock:
            if self._client is not None:
                return
            self._client = QdrantClient(
                url=self._url,
                api_key=self._api_key,
                timeout=10,
            )
        await self._ensure_collection()
        _log.info(
            "memory_bridge_connected",
            extra={"url": self._url, "collection": self._collection},
        )

    async def disconnect(self) -> None:
        """Close the Qdrant client and shut down the I/O thread pool."""
        async with self._lock:
            if self._client is not None:
                self._client.close()
                self._client = None
        self._executor.shutdown(wait=False)
        _log.info("memory_bridge_disconnected")

    async def __aenter__(self) -> "SwarmMemoryBridge":
        await self.connect()
        return self

    async def __aexit__(self, _et: Any, _ev: Any, _tb: Any) -> None:
        await self.disconnect()

    # ── Executor bridge ───────────────────────────────────────────────────────

    async def _run_sync(self, fn: Callable[..., _T], *args: Any, **kwargs: Any) -> _T:
        """
        Dispatch a blocking callable to the dedicated I/O thread pool.

        Keyword arguments are captured via functools.partial because
        run_in_executor only accepts positional arguments after the callable.
        The coroutine awaits completion, yielding the event loop while the
        blocking call executes in the background thread.
        """
        loop = asyncio.get_event_loop()
        wrapped = functools.partial(fn, *args, **kwargs) if kwargs else functools.partial(fn, *args)
        return await loop.run_in_executor(self._executor, wrapped)

    @property
    def _c(self) -> Any:
        if self._client is None:
            raise RuntimeError(
                "SwarmMemoryBridge is not connected. Call connect() or use as async context manager."
            )
        return self._client

    # ── Self-healing collection management ────────────────────────────────────

    async def _ensure_collection(self) -> None:
        """
        Idempotently register the Qdrant collection schema.

        If the collection does not exist, it is created with:
          - 1536-dim dense vectors with cosine distance
          - HNSW index: m=16, ef_construct=200, full_scan_threshold=10_000
          - 2 default segments for parallel read performance

        Retries up to 3 times with exponential-jitter backoff on transient
        connection errors before raising MemoryUnavailableError.

        The _collection_ready flag acts as a fast-path to skip re-checking
        the schema on every subsequent store or query operation.
        """
        if self._collection_ready:
            return

        async with self._lock:
            if self._collection_ready:
                return

            try:
                async for attempt in AsyncRetrying(
                    retry=retry_if_exception_type((ConnectionError, OSError, TimeoutError)),
                    wait=wait_exponential_jitter(initial=0.5, max=10.0, jitter=0.5),
                    stop=stop_after_attempt(_RETRY_ATTEMPTS),
                    before_sleep=before_sleep_log(_log, logging.WARNING),
                    reraise=True,
                ):
                    with attempt:
                        collections_response = await self._run_sync(self._c.get_collections)
                        existing_names = {c.name for c in collections_response.collections}

                        if self._collection not in existing_names:
                            _log.info(
                                "memory_collection_creating",
                                extra={
                                    "collection": self._collection,
                                    "dim": self._embedding_dim,
                                    "distance": "cosine",
                                },
                            )
                            await self._run_sync(
                                self._c.create_collection,
                                self._collection,
                                vectors_config=qmodels.VectorParams(
                                    size=self._embedding_dim,
                                    distance=qmodels.Distance.COSINE,
                                    hnsw_config=qmodels.HnswConfigDiff(
                                        m=16,
                                        ef_construct=200,
                                        full_scan_threshold=10_000,
                                    ),
                                ),
                                optimizers_config=qmodels.OptimizersConfigDiff(
                                    default_segment_number=2,
                                    indexing_threshold=20_000,
                                ),
                                replication_factor=1,
                            )
                            _log.info(
                                "memory_collection_created",
                                extra={
                                    "collection": self._collection,
                                    "embedding_dim": self._embedding_dim,
                                },
                            )
                        else:
                            _log.debug(
                                "memory_collection_exists",
                                extra={"collection": self._collection},
                            )

            except RetryError as exc:
                raise MemoryUnavailableError(
                    f"Qdrant at {self._url!r} unreachable after {_RETRY_ATTEMPTS} attempts. "
                    f"Last error: {exc}"
                ) from exc

            self._collection_ready = True

    # ── store_memory ──────────────────────────────────────────────────────────

    async def store_memory(
        self,
        agent_id: str,
        content: str,
        embedding: list[float],
        *,
        metadata: dict[str, Any] | None = None,
        tenant_id: str = "default",
        record_id: str | None = None,
    ) -> str:
        """
        Persist an agent memory vector to Qdrant via an upsert operation.

        The embedding is stored alongside a payload containing the raw text
        content, agent identifier, tenant partition, and any caller-supplied
        metadata.  Subsequent queries return these payloads alongside scores.

        Parameters
        ----------
        agent_id:
            Identifier of the agent that produced this memory.
        content:
            Raw text content of the memory (stored in the point payload).
        embedding:
            Pre-computed dense vector. Length must equal ``embedding_dim``.
        metadata:
            Arbitrary key-value pairs appended to the point payload.
            Keys ``agent_id``, ``content``, ``tenant_id``, and ``created_at``
            are reserved — user-supplied values for these keys will overwrite.
        tenant_id:
            Tenant partition stored in the payload for filtered queries.
        record_id:
            Optional stable UUID for the vector point. Auto-generated if
            not provided. Upsert semantics: same ID overwrites prior data.

        Returns
        -------
        str
            The UUID string of the stored vector point.

        Raises
        ------
        ValueError
            If the embedding length does not match the configured dimension.
        MemoryUnavailableError
            If the Qdrant server is unreachable after all retry attempts.
        """
        if len(embedding) != self._embedding_dim:
            raise ValueError(
                f"Embedding length {len(embedding)} does not match "
                f"configured dimension {self._embedding_dim}. "
                "Ensure your embedding model output size matches GENESIS_EMBEDDING_DIM."
            )

        await self._ensure_collection()

        rid = record_id or str(uuid.uuid4())
        payload: dict[str, Any] = {
            "agent_id": agent_id,
            "content": content,
            "tenant_id": tenant_id,
            "created_at": time.time(),
        }
        if metadata:
            payload.update(metadata)

        point = qmodels.PointStruct(id=rid, vector=embedding, payload=payload)

        try:
            async for attempt in AsyncRetrying(
                retry=retry_if_exception_type((ConnectionError, OSError, TimeoutError)),
                wait=wait_exponential_jitter(initial=0.25, max=8.0, jitter=0.5),
                stop=stop_after_attempt(_RETRY_ATTEMPTS),
                before_sleep=before_sleep_log(_log, logging.WARNING),
                reraise=True,
            ):
                with attempt:
                    await self._run_sync(
                        self._c.upsert,
                        collection_name=self._collection,
                        points=[point],
                        wait=True,
                    )
        except RetryError as exc:
            raise MemoryUnavailableError(
                f"store_memory failed for agent={agent_id!r} after "
                f"{_RETRY_ATTEMPTS} retries: {exc}"
            ) from exc

        _log.debug(
            "memory_stored",
            extra={
                "record_id": rid,
                "agent_id": agent_id,
                "tenant_id": tenant_id,
                "content_len": len(content),
                "embedding_dim": len(embedding),
            },
        )
        return rid

    # ── query_shared_memory ───────────────────────────────────────────────────

    async def query_shared_memory(
        self,
        embedding: list[float],
        *,
        top_k: int = 10,
        score_threshold: float = 0.70,
        filter_agent_id: str | None = None,
        filter_tenant_id: str | None = None,
        extra_filter: Any | None = None,
    ) -> list[MemoryHit]:
        """
        Retrieve the most contextually similar memories by cosine similarity.

        The query embedding is compared against all stored vectors using
        Qdrant's HNSW approximate nearest-neighbour search.  Results below
        ``score_threshold`` are excluded before returning.

        Parameters
        ----------
        embedding:
            Query vector. Length must equal ``embedding_dim``.
        top_k:
            Maximum number of results to return.
        score_threshold:
            Minimum cosine similarity score (0.0–1.0) for inclusion.
            0.70 retains contextually relevant matches; raise to 0.85+ for
            near-exact matches only.
        filter_agent_id:
            Optional equality filter on the ``agent_id`` payload field.
            Pass to restrict results to memories from a specific agent.
        filter_tenant_id:
            Optional equality filter on the ``tenant_id`` payload field.
        extra_filter:
            Fully-specified ``qdrant_client.http.models.Filter`` for
            advanced multi-field or range queries.  Merged with any
            ``filter_agent_id`` / ``filter_tenant_id`` conditions via AND.

        Returns
        -------
        list[MemoryHit]
            Hits sorted by descending cosine similarity score.

        Raises
        ------
        ValueError
            If the embedding length does not match the configured dimension.
        MemoryUnavailableError
            If the Qdrant server is unreachable after all retry attempts.
        """
        if len(embedding) != self._embedding_dim:
            raise ValueError(
                f"Query embedding length {len(embedding)} does not match "
                f"configured dimension {self._embedding_dim}."
            )

        await self._ensure_collection()

        # Build filter conditions list
        conditions: list[Any] = []
        if filter_agent_id is not None:
            conditions.append(
                qmodels.FieldCondition(
                    key="agent_id",
                    match=qmodels.MatchValue(value=filter_agent_id),
                )
            )
        if filter_tenant_id is not None:
            conditions.append(
                qmodels.FieldCondition(
                    key="tenant_id",
                    match=qmodels.MatchValue(value=filter_tenant_id),
                )
            )

        # Merge explicit conditions with any caller-supplied filter
        query_filter: Any | None = extra_filter
        if conditions:
            must_clauses = list(conditions)
            if extra_filter is not None and getattr(extra_filter, "must", None):
                must_clauses.extend(extra_filter.must)
            query_filter = qmodels.Filter(must=must_clauses)

        try:
            async for attempt in AsyncRetrying(
                retry=retry_if_exception_type((ConnectionError, OSError, TimeoutError)),
                wait=wait_exponential_jitter(initial=0.25, max=8.0, jitter=0.5),
                stop=stop_after_attempt(_RETRY_ATTEMPTS),
                before_sleep=before_sleep_log(_log, logging.WARNING),
                reraise=True,
            ):
                with attempt:
                    search_results = await self._run_sync(
                        self._c.search,
                        collection_name=self._collection,
                        query_vector=embedding,
                        limit=top_k,
                        score_threshold=score_threshold,
                        query_filter=query_filter,
                        with_payload=True,
                    )
        except RetryError as exc:
            raise MemoryUnavailableError(
                f"query_shared_memory failed after {_RETRY_ATTEMPTS} retries: {exc}"
            ) from exc

        hits: list[MemoryHit] = []
        for scored_point in search_results:
            payload = scored_point.payload or {}
            hits.append(
                MemoryHit(
                    record_id=str(scored_point.id),
                    score=scored_point.score,
                    agent_id=payload.get("agent_id", "unknown"),
                    content=payload.get("content", ""),
                    metadata={
                        k: v
                        for k, v in payload.items()
                        if k not in ("agent_id", "content", "tenant_id", "created_at")
                    },
                    created_at=float(payload.get("created_at", 0.0)),
                )
            )

        _log.debug(
            "memory_queried",
            extra={
                "hits": len(hits),
                "top_k": top_k,
                "score_threshold": score_threshold,
                "filter_agent_id": filter_agent_id,
                "filter_tenant_id": filter_tenant_id,
            },
        )
        return hits

    # ── Utility ───────────────────────────────────────────────────────────────

    async def delete_memory(self, record_id: str) -> None:
        """Delete a single memory point by its UUID string."""
        await self._ensure_collection()
        await self._run_sync(
            self._c.delete,
            collection_name=self._collection,
            points_selector=qmodels.PointIdsList(points=[record_id]),
        )
        _log.debug("memory_deleted", extra={"record_id": record_id})

    async def collection_stats(self) -> dict[str, Any]:
        """Return Qdrant collection statistics for observability endpoints."""
        await self._ensure_collection()
        info = await self._run_sync(
            self._c.get_collection, collection_name=self._collection
        )
        return {
            "collection": self._collection,
            "vectors_count": getattr(info, "vectors_count", None),
            "indexed_vectors_count": getattr(info, "indexed_vectors_count", None),
            "points_count": getattr(info, "points_count", None),
            "segments_count": getattr(info, "segments_count", None),
            "status": info.status.value if hasattr(info, "status") and info.status else "unknown",
            "embedding_dim": self._embedding_dim,
            "url": self._url,
        }

    async def batch_store(self, records: list[MemoryRecord]) -> list[str]:
        """
        Upsert multiple memory records in a single Qdrant batch operation.

        More efficient than calling store_memory() repeatedly for bulk ingestion.
        All records must share the same embedding dimension.

        Returns the list of stored record IDs in input order.
        """
        if not records:
            return []

        for rec in records:
            if len(rec.embedding) != self._embedding_dim:
                raise ValueError(
                    f"Record {rec.record_id!r} embedding length {len(rec.embedding)} "
                    f"!= configured dim {self._embedding_dim}"
                )

        await self._ensure_collection()

        points = [
            qmodels.PointStruct(
                id=rec.record_id,
                vector=rec.embedding,
                payload={
                    "agent_id": rec.agent_id,
                    "content": rec.content,
                    "tenant_id": rec.tenant_id,
                    "created_at": rec.created_at,
                    **rec.metadata,
                },
            )
            for rec in records
        ]

        try:
            async for attempt in AsyncRetrying(
                retry=retry_if_exception_type((ConnectionError, OSError, TimeoutError)),
                wait=wait_exponential_jitter(initial=0.5, max=15.0, jitter=1.0),
                stop=stop_after_attempt(_RETRY_ATTEMPTS),
                before_sleep=before_sleep_log(_log, logging.WARNING),
                reraise=True,
            ):
                with attempt:
                    await self._run_sync(
                        self._c.upsert,
                        collection_name=self._collection,
                        points=points,
                        wait=True,
                    )
        except RetryError as exc:
            raise MemoryUnavailableError(
                f"batch_store of {
                    len(records)} records failed after {_RETRY_ATTEMPTS} retries: {exc}") from exc

        record_ids = [rec.record_id for rec in records]
        _log.info(
            "memory_batch_stored",
            extra={"count": len(records)},
        )
        return record_ids
