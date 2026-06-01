"""Unit tests for the ROI metrics engine — pure functions and model validation."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone

from genesis_swarm.analytics.metrics_engine import (
    FraudMetrics,
    ComplianceMetrics,
    AuditMetrics,
    _SwarmSnapshot,
    _monthly_licence_cost,
    _snapshot_from_app_state,
    _AVG_FRAUD_INCIDENT_EUR,
    _AVG_REGULATORY_FINE_EUR,
    _AVG_AUDIT_RATE_EUR,
)


class TestMonthlyLicenceCost(unittest.TestCase):

    def test_known_tiers(self):
        self.assertEqual(_monthly_licence_cost("free"), 0.0)
        self.assertEqual(_monthly_licence_cost("starter"), 499.0)
        self.assertEqual(_monthly_licence_cost("professional"), 1_999.0)
        self.assertEqual(_monthly_licence_cost("enterprise"), 9_500.0)

    def test_unknown_tier_returns_zero(self):
        self.assertEqual(_monthly_licence_cost("nonexistent"), 0.0)
        self.assertEqual(_monthly_licence_cost(""), 0.0)

    def test_case_sensitive(self):
        self.assertEqual(_monthly_licence_cost("Enterprise"), 0.0)
        self.assertEqual(_monthly_licence_cost("STARTER"), 0.0)


class TestSwarmSnapshotDefaults(unittest.TestCase):

    def test_default_values(self):
        s = _SwarmSnapshot()
        self.assertEqual(s.total_rounds, 0)
        self.assertEqual(s.successful_rounds, 0)
        self.assertAlmostEqual(s.consensus_accuracy, 0.97)
        self.assertAlmostEqual(s.uptime_days, 30.0)

    def test_override_values(self):
        s = _SwarmSnapshot(total_rounds=1000, successful_rounds=970, anomalies_flagged=42)
        self.assertEqual(s.total_rounds, 1000)
        self.assertEqual(s.anomalies_flagged, 42)


class TestSnapshotFromAppState(unittest.TestCase):

    def _make_state(self, **kwargs):
        class FakeState:
            consensus_state = kwargs
        return FakeState()

    def test_empty_state_returns_defaults(self):
        snap = _snapshot_from_app_state(object())
        self.assertEqual(snap.total_rounds, 0)
        self.assertAlmostEqual(snap.consensus_accuracy, 0.97)

    def test_none_consensus_state_returns_defaults(self):
        class S:
            consensus_state = None
        snap = _snapshot_from_app_state(S())
        self.assertEqual(snap.total_rounds, 0)

    def test_full_state_parsed(self):
        state = self._make_state(
            total_rounds=5000, successful_rounds=4900, total_alerts=200,
            critical_alerts=15, false_positives=10, anomalies_flagged=88,
            breaches_prevented=7, accuracy=0.98, uptime_days=45.5,
        )
        snap = _snapshot_from_app_state(state)
        self.assertEqual(snap.total_rounds, 5000)
        self.assertEqual(snap.anomalies_flagged, 88)
        self.assertAlmostEqual(snap.consensus_accuracy, 0.98)
        self.assertAlmostEqual(snap.uptime_days, 45.5)

    def test_string_values_coerced(self):
        state = self._make_state(total_rounds="1000", accuracy="0.95")
        snap = _snapshot_from_app_state(state)
        self.assertEqual(snap.total_rounds, 1000)
        self.assertAlmostEqual(snap.consensus_accuracy, 0.95)


class TestFraudMetricsModel(unittest.TestCase):

    def _make(self, vol=10_000_000.0, acc=0.97, events=1000, crit=5, fpr=0.02):
        return FraudMetrics(
            simulated_fraud_volume_eur=vol,
            consensus_accuracy_rate=acc,
            damages_avoided_eur=vol * acc,
            events_analysed=events,
            critical_alerts=crit,
            false_positive_rate=fpr,
        )

    def test_basic_construction(self):
        m = self._make()
        self.assertAlmostEqual(m.damages_avoided_eur, 9_700_000.0)
        self.assertEqual(m.events_analysed, 1000)

    def test_accuracy_bounds(self):
        import pydantic
        with self.assertRaises(pydantic.ValidationError):
            FraudMetrics(
                simulated_fraud_volume_eur=1.0, consensus_accuracy_rate=1.5,
                damages_avoided_eur=1.5, events_analysed=0, critical_alerts=0, false_positive_rate=0.0,
            )


class TestComplianceMetricsModel(unittest.TestCase):

    def test_basic_construction(self):
        m = ComplianceMetrics(
            anomalies_flagged=10,
            avg_regulatory_fine_eur=_AVG_REGULATORY_FINE_EUR,
            penalty_mitigation_eur=10 * _AVG_REGULATORY_FINE_EUR,
            breaches_prevented=3,
            jurisdictions_covered=4,
        )
        self.assertEqual(m.anomalies_flagged, 10)
        self.assertEqual(m.breaches_prevented, 3)
        self.assertEqual(m.jurisdictions_covered, 4)


class TestAuditMetricsModel(unittest.TestCase):

    def test_basic_construction(self):
        m = AuditMetrics(
            automated_checks_run=500,
            manual_hours_saved=240.0,
            hourly_rate_eur=_AVG_AUDIT_RATE_EUR,
            overhead_reduction_eur=240.0 * _AVG_AUDIT_RATE_EUR,
            audit_cycle_days_reduced=14.0,
        )
        self.assertAlmostEqual(m.overhead_reduction_eur, 240.0 * _AVG_AUDIT_RATE_EUR)
        self.assertEqual(m.automated_checks_run, 500)


class TestIndustryBenchmarks(unittest.TestCase):

    def test_fraud_benchmark_plausible(self):
        self.assertGreater(_AVG_FRAUD_INCIDENT_EUR, 1_000_000.0)
        self.assertLess(_AVG_FRAUD_INCIDENT_EUR, 100_000_000.0)

    def test_fine_benchmark_plausible(self):
        self.assertGreater(_AVG_REGULATORY_FINE_EUR, 1_000_000.0)

    def test_audit_rate_plausible(self):
        self.assertGreater(_AVG_AUDIT_RATE_EUR, 50.0)
        self.assertLess(_AVG_AUDIT_RATE_EUR, 1_000.0)


if __name__ == "__main__":
    unittest.main()
