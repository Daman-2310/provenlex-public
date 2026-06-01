"""
ImmutableLedger integrity tests.

Exercises:
  - verify_chain_integrity() round-trips cleanly on genuine data
  - Tamper detection: mutating any block raises TamperDetectedError
  - AsyncImmutableLedger async wrapper passes the same checks
"""
from __future__ import annotations

import asyncio
import json
import sqlite3
from pathlib import Path

import pytest

from genesis_swarm.consensus.immutable_ledger import (
    AsyncImmutableLedger,
    ImmutableLedger,
    TamperDetectedError,
)


# ── Synchronous ledger ─────────────────────────────────────────────────────────


class TestImmutableLedger:
    def test_verify_chain_integrity_empty(self, tmp_path: Path) -> None:
        with ImmutableLedger(tmp_path / "empty.db") as ledger:
            assert ledger.verify_chain_integrity() is True

    def test_verify_chain_integrity_single_block(self, tmp_path: Path) -> None:
        with ImmutableLedger(tmp_path / "single.db") as ledger:
            ledger.append("tenant-a", b'{"event": "trade", "amount": 5000}')
            assert ledger.verify_chain_integrity() is True

    def test_verify_chain_integrity_multi_block(self, tmp_path: Path) -> None:
        with ImmutableLedger(tmp_path / "multi.db") as ledger:
            for i in range(20):
                ledger.append("tenant-a", json.dumps({"i": i}).encode())
            assert ledger.verify_chain_integrity() is True

    def test_tamper_detection_payload_mutation(self, tmp_path: Path) -> None:
        db_path = tmp_path / "tamper.db"
        with ImmutableLedger(db_path) as ledger:
            for i in range(5):
                ledger.append("fund-x", json.dumps({"score": i * 10}).encode())

        # Directly mutate the payload of block 2 in the raw database
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "UPDATE ledger_blocks SET payload = ? WHERE idx = 2",
            (b"TAMPERED",),
        )
        conn.commit()
        conn.close()

        with ImmutableLedger(db_path) as ledger:
            with pytest.raises(TamperDetectedError):
                ledger.verify_chain_integrity()

    def test_tamper_detection_hash_rewrite(self, tmp_path: Path) -> None:
        db_path = tmp_path / "rehash.db"
        with ImmutableLedger(db_path) as ledger:
            ledger.append("fund-y", b"original")

        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "UPDATE ledger_blocks SET block_hash = ? WHERE idx = 0",
            ("a" * 64,),
        )
        conn.commit()
        conn.close()

        with ImmutableLedger(db_path) as ledger:
            with pytest.raises(TamperDetectedError):
                ledger.verify_chain_integrity()

    def test_integrity_report_ok(self, tmp_path: Path) -> None:
        with ImmutableLedger(tmp_path / "report.db") as ledger:
            for i in range(3):
                ledger.append("t", json.dumps({"n": i}).encode())
            report = ledger.integrity_report()
        assert report.valid is True
        assert report.chain_length >= 3

    def test_wal_checkpoint_on_close(self, tmp_path: Path) -> None:
        db_path = tmp_path / "wal.db"
        with ImmutableLedger(db_path) as ledger:
            ledger.append("t", b"payload")
        # WAL file should be gone or empty after a clean close
        wal = Path(str(db_path) + "-wal")
        assert not wal.exists() or wal.stat().st_size == 0


# ── Async wrapper ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_async_verify_chain_integrity(tmp_path: Path) -> None:
    db_path = tmp_path / "async_ledger.db"
    async with AsyncImmutableLedger(db_path) as ledger:
        for i in range(10):
            await ledger.append("fund-z", json.dumps({"seq": i}).encode())
        ok = await ledger.verify_chain_integrity()
    assert ok is True


@pytest.mark.asyncio
async def test_async_tamper_detection(tmp_path: Path) -> None:
    db_path = tmp_path / "async_tamper.db"
    async with AsyncImmutableLedger(db_path) as ledger:
        await ledger.append("fund-z", b"legitimate")

    # Corrupt via raw sqlite
    conn = sqlite3.connect(str(db_path))
    conn.execute("UPDATE ledger_blocks SET payload = ? WHERE idx = 0", (b"evil",))
    conn.commit()
    conn.close()

    async with AsyncImmutableLedger(db_path) as ledger:
        with pytest.raises(TamperDetectedError):
            await ledger.verify_chain_integrity()
