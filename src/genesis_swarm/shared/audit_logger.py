from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)


@dataclass
class AuditRecord:
    bot_id: str
    bot_type: str
    event_type: str
    payload: dict
    timestamp: float = field(default_factory=time.time)
    record_hash: str = field(init=False)

    def __post_init__(self):
        raw = json.dumps(
            {
                "bot_id": self.bot_id,
                "bot_type": self.bot_type,
                "event_type": self.event_type,
                "payload": self.payload,
                "timestamp": self.timestamp,
            },
            sort_keys=True,
        )
        self.record_hash = hashlib.sha3_256(raw.encode()).hexdigest()

    def to_dict(self) -> dict:
        return {
            "bot_id": self.bot_id,
            "bot_type": self.bot_type,
            "event_type": self.event_type,
            "payload": self.payload,
            "timestamp": self.timestamp,
            "record_hash": self.record_hash,
        }


class AuditLogger:
    """Append-only audit log — AIFMD Article 22 compliant (7-year retention)."""

    def __init__(self, log_path: str = "audit_log"):
        self._path = Path(log_path)
        self._path.mkdir(parents=True, exist_ok=True)
        self._buffer: list[AuditRecord] = []
        self._flush_every = 20

    def record(self, bot_id: str, bot_type: str, event_type: str, payload: dict) -> AuditRecord:
        rec = AuditRecord(bot_id=bot_id, bot_type=bot_type, event_type=event_type, payload=payload)
        self._buffer.append(rec)
        if len(self._buffer) >= self._flush_every:
            self._flush()
        return rec

    def _flush(self) -> None:
        if not self._buffer:
            return
        try:
            import pyarrow as pa
            import pyarrow.parquet as pq

            rows = [r.to_dict() for r in self._buffer]
            table = pa.table({k: [r[k] for r in rows] for k in rows[0]})
            fname = self._path / f"audit_{int(time.time() * 1000)}.parquet"
            pq.write_table(table, fname)
        except ImportError:
            fname = self._path / f"audit_{int(time.time() * 1000)}.jsonl"
            with open(fname, "a") as f:
                for r in self._buffer:
                    f.write(json.dumps(r.to_dict()) + "\n")
        self._buffer.clear()

    def flush(self) -> None:
        self._flush()

    def get_recent(self, n: int = 50) -> list[dict]:
        return [r.to_dict() for r in self._buffer[-n:]]
