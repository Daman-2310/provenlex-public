"""Unit tests for the audit chain cryptographic core — pure functions, no DB."""
from __future__ import annotations

import json
import time
import unittest
from unittest.mock import MagicMock

from genesis_swarm.shared.security.audit_chain import (
    AuditEntry,
    AuditEventType,
    compute_entry_hash,
    _canonical,
)


def _entry(seq: int = 1, event_type: str = AuditEventType.LOGIN_SUCCESS, actor: str = "alice",
           tenant: str = "default", prev: str = "0" * 128, payload: dict | None = None) -> AuditEntry:
    e = AuditEntry(
        seq=seq,
        ts=1_716_000_000.0,
        event_type=event_type,
        actor=actor,
        tenant_id=tenant,
        payload=payload or {},
        prev_hash=prev,
        entry_hash="",
        signature="",
    )
    return e


class TestCanonicalSerialization(unittest.TestCase):

    def test_canonical_is_deterministic(self):
        e = _entry()
        self.assertEqual(_canonical(e), _canonical(e))

    def test_canonical_excludes_entry_hash(self):
        e1 = _entry()
        e2 = _entry()
        e2.entry_hash = "some_hash"
        self.assertEqual(_canonical(e1), _canonical(e2))

    def test_canonical_excludes_signature(self):
        e1 = _entry()
        e2 = _entry()
        e2.signature = "deadbeef"
        self.assertEqual(_canonical(e1), _canonical(e2))

    def test_canonical_is_valid_json(self):
        e = _entry(payload={"amount": 1_000_000, "ccy": "EUR"})
        doc = json.loads(_canonical(e))
        self.assertEqual(doc["actor"], "alice")
        self.assertEqual(doc["payload"]["amount"], 1_000_000)

    def test_canonical_uses_sorted_keys(self):
        import json
        doc = json.loads(_canonical(_entry()))
        keys = list(doc.keys())
        self.assertEqual(keys, sorted(keys))

    def test_different_payloads_produce_different_canonical(self):
        e1 = _entry(payload={"x": 1})
        e2 = _entry(payload={"x": 2})
        self.assertNotEqual(_canonical(e1), _canonical(e2))


class TestComputeEntryHash(unittest.TestCase):

    def test_hash_is_128_hex_chars(self):
        h = compute_entry_hash(_entry())
        self.assertEqual(len(h), 128)
        self.assertTrue(all(c in "0123456789abcdef" for c in h))

    def test_hash_is_deterministic(self):
        e = _entry()
        self.assertEqual(compute_entry_hash(e), compute_entry_hash(e))

    def test_different_seq_different_hash(self):
        self.assertNotEqual(compute_entry_hash(_entry(seq=1)), compute_entry_hash(_entry(seq=2)))

    def test_different_actor_different_hash(self):
        self.assertNotEqual(
            compute_entry_hash(_entry(actor="alice")),
            compute_entry_hash(_entry(actor="bob")),
        )

    def test_different_tenant_different_hash(self):
        self.assertNotEqual(
            compute_entry_hash(_entry(tenant="tenant_a")),
            compute_entry_hash(_entry(tenant="tenant_b")),
        )

    def test_different_prev_hash_different_hash(self):
        self.assertNotEqual(
            compute_entry_hash(_entry(prev="a" * 128)),
            compute_entry_hash(_entry(prev="b" * 128)),
        )

    def test_chain_integrity_simulation(self):
        """Simulate a 10-entry chain and verify each hash chains the previous."""
        prev_hash = "0" * 128
        for i in range(1, 11):
            e = _entry(seq=i, prev=prev_hash)
            h = compute_entry_hash(e)
            self.assertEqual(len(h), 128)
            # Each entry must reference the previous hash
            canon = json.loads(_canonical(e))
            self.assertEqual(canon["prev_hash"], prev_hash)
            prev_hash = h

    def test_tampered_payload_breaks_hash(self):
        e = _entry(payload={"amount": 100})
        original_hash = compute_entry_hash(e)
        e.payload["amount"] = 9999
        tampered_hash = compute_entry_hash(e)
        self.assertNotEqual(original_hash, tampered_hash)


class TestAuditEventTypes(unittest.TestCase):

    def test_event_types_are_strings(self):
        for event in [
            AuditEventType.LOGIN_SUCCESS, AuditEventType.LOGOUT,
            AuditEventType.BOT_ALERT, AuditEventType.CONSENSUS_ROUND,
        ]:
            self.assertIsInstance(event, str)

    def test_event_type_values_are_nonempty(self):
        for attr in dir(AuditEventType):
            if not attr.startswith("_"):
                val = getattr(AuditEventType, attr)
                if isinstance(val, str):
                    self.assertTrue(len(val) > 0)


if __name__ == "__main__":
    unittest.main()
