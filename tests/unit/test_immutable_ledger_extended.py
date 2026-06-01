"""Extended unit tests for ImmutableLedger — targeting uncovered branches."""
from __future__ import annotations

import sqlite3
import tempfile
import time
import unittest

from genesis_swarm.consensus.immutable_ledger import (
    ImmutableLedger,
    LedgerBlock,
    IntegrityReport,
    TamperDetectedError,
)


class TestLedgerBlockComputeHash(unittest.TestCase):

    def _hash(self, **kwargs) -> str:
        defaults = dict(index=0, timestamp_ns=1_716_000_000_000, tenant_id="t",
                        payload=b"test", previous_hash="0" * 128)
        defaults.update(kwargs)
        return LedgerBlock.compute_hash(**defaults)

    def test_returns_64_hex_chars(self):
        h = self._hash()
        self.assertEqual(len(h), 128)
        self.assertTrue(all(c in "0123456789abcdef" for c in h))

    def test_is_deterministic(self):
        self.assertEqual(self._hash(), self._hash())

    def test_different_payload(self):
        self.assertNotEqual(self._hash(payload=b"aaa"), self._hash(payload=b"bbb"))

    def test_different_prev_hash(self):
        self.assertNotEqual(self._hash(previous_hash="a"*64), self._hash(previous_hash="b"*64))

    def test_different_tenant(self):
        self.assertNotEqual(self._hash(tenant_id="t1"), self._hash(tenant_id="t2"))

    def test_different_index(self):
        self.assertNotEqual(self._hash(index=0), self._hash(index=1))

    def test_different_timestamp(self):
        self.assertNotEqual(self._hash(timestamp_ns=1000), self._hash(timestamp_ns=2000))


class TestImmutableLedgerInMemory(unittest.TestCase):

    def setUp(self):
        self.ledger = ImmutableLedger(":memory:")

    def tearDown(self):
        self.ledger.close()

    def test_initial_length_is_zero(self):
        self.assertEqual(self.ledger.length(), 0)

    def test_head_on_empty_returns_none(self):
        self.assertIsNone(self.ledger.head())

    def test_append_single_block(self):
        b = self.ledger.append("tenant-a", b"first payload")
        self.assertIsInstance(b, LedgerBlock)
        self.assertEqual(b.index, 0)
        self.assertEqual(b.payload, b"first payload")
        self.assertEqual(self.ledger.length(), 1)

    def test_append_chain_links_correctly(self):
        b0 = self.ledger.append("tenant-a", b"block0")
        b1 = self.ledger.append("tenant-a", b"block1")
        self.assertEqual(b1.previous_hash, b0.block_hash)

    def test_genesis_block_has_zero_prev_hash(self):
        b = self.ledger.append("tenant-a", b"genesis")
        self.assertEqual(b.previous_hash, "0" * 128)

    def test_get_block_by_index(self):
        self.ledger.append("tenant-a", b"data0")
        self.ledger.append("tenant-a", b"data1")
        b = self.ledger.get(1)
        self.assertEqual(b.payload, b"data1")
        self.assertEqual(b.index, 1)

    def test_head_returns_last_block(self):
        self.ledger.append("tenant-a", b"first")
        last = self.ledger.append("tenant-a", b"last")
        head = self.ledger.head()
        self.assertIsNotNone(head)
        self.assertEqual(head.block_hash, last.block_hash)

    def test_tail_returns_recent_blocks(self):
        for i in range(5):
            self.ledger.append("tenant-a", f"block-{i}".encode())
        tail = self.ledger.tail(3)
        self.assertEqual(len(tail), 3)
        self.assertEqual(tail[-1].payload, b"block-4")

    def test_tail_on_empty_returns_empty(self):
        self.assertEqual(self.ledger.tail(10), [])

    def test_verify_chain_integrity_empty(self):
        self.assertTrue(self.ledger.verify_chain_integrity())

    def test_verify_chain_integrity_valid(self):
        for i in range(10):
            self.ledger.append("tenant-a", f"payload-{i}".encode())
        self.assertTrue(self.ledger.verify_chain_integrity())

    def test_multi_tenant_isolation(self):
        for i in range(3):
            self.ledger.append("tenant-a", f"a-{i}".encode())
        for i in range(2):
            self.ledger.append("tenant-b", f"b-{i}".encode())
        self.assertEqual(self.ledger.length(), 5)

    def test_integrity_report_structure(self):
        for i in range(3):
            self.ledger.append("tenant-a", f"block-{i}".encode())
        report = self.ledger.integrity_report()
        self.assertIsInstance(report, IntegrityReport)
        self.assertEqual(report.chain_length, 3)
        self.assertTrue(report.valid)

    def test_context_manager(self):
        with ImmutableLedger(":memory:") as ledger:
            ledger.append("tenant", b"via context manager")
            self.assertEqual(ledger.length(), 1)

    def test_get_proof_returns_dict(self):
        self.ledger.append("tenant-a", b"provable")
        proof = self.ledger.get_proof(0)
        self.assertIsInstance(proof, dict)
        self.assertIn("block_hash", proof.get("block", proof))

    def test_block_hash_non_empty_after_append(self):
        b = self.ledger.append("tenant-a", b"check hash")
        self.assertEqual(len(b.block_hash), 128)

    def test_recompute_hash_matches_stored(self):
        b = self.ledger.append("tenant-a", b"recompute test")
        self.assertEqual(b.recompute_hash(), b.block_hash)

    def test_50_block_chain_integrity(self):
        for i in range(50):
            self.ledger.append("tenant-a", f"block-{i:04d}".encode())
        self.assertEqual(self.ledger.length(), 50)
        self.assertTrue(self.ledger.verify_chain_integrity())


class TestImmutableLedgerTamperDetection(unittest.TestCase):

    def test_payload_tamper_detected(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name

        with ImmutableLedger(db_path) as ledger:
            ledger.append("tenant-a", b"original")

        conn = sqlite3.connect(db_path)
        conn.execute("UPDATE ledger_blocks SET payload = ? WHERE idx = 0", (b"tampered",))
        conn.commit()
        conn.close()

        with ImmutableLedger(db_path) as ledger:
            with self.assertRaises(TamperDetectedError):
                ledger.verify_chain_integrity()

        import os
        os.unlink(db_path)


if __name__ == "__main__":
    unittest.main()
