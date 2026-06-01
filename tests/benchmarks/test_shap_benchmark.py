"""
SHAP Explainability Benchmark
================================
Compares SHAP feature importances against synthetic ground-truth anomalies.

The test verifies that the explainer correctly identifies the features
responsible for anomaly scores — i.e. that explanations are not random noise.

Run:
    pytest tests/benchmarks/test_shap_benchmark.py -v -s
"""
from __future__ import annotations

import numpy as np
import pytest
from sklearn.ensemble import IsolationForest


FEATURE_NAMES = [
    "nav_deviation_pct",
    "volume_zscore",
    "price_velocity",
    "spread_ratio",
    "dark_pool_pct",
]
N_NORMAL = 200
N_ANOMALY = 20
SEED = 42


def _build_dataset():
    rng = np.random.default_rng(SEED)
    # Normal samples: all features near zero
    X_normal = rng.normal(0, 1, (N_NORMAL, len(FEATURE_NAMES)))
    # Anomalies: feature 0 (nav_deviation_pct) is the dominant signal
    X_anomaly = rng.normal(0, 1, (N_ANOMALY, len(FEATURE_NAMES)))
    X_anomaly[:, 0] = rng.uniform(8, 12, N_ANOMALY)   # nav_deviation massively elevated
    return np.vstack([X_normal, X_anomaly]), np.array([0] * N_NORMAL + [1] * N_ANOMALY)


def _train_model(X_train):
    model = IsolationForest(n_estimators=100, contamination=0.1, random_state=SEED)
    model.fit(X_train)
    return model


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_shap_identifies_dominant_anomaly_feature():
    """SHAP must rank nav_deviation_pct as the top feature for synthetic NAV anomalies."""
    from genesis_swarm.shared.explainability import SHAPExplainer

    X, y = _build_dataset()
    model = _train_model(X)

    explainer = SHAPExplainer()
    anomaly_sample = X[N_NORMAL]  # first anomaly (nav_deviation is elevated)

    result = explainer.explain(
        features=anomaly_sample,
        model=model,
        feature_names=FEATURE_NAMES,
        top_n=3,
    )

    assert result is not None, "Explainer must return a result"
    top_features = [f["name"] for f in result.get("top_features", [])]
    print(f"\n[SHAP] Top features for NAV anomaly: {top_features}")
    print(f"[SHAP] Method used: {result.get('method')}")

    # nav_deviation_pct must be in the top 2 features
    assert "nav_deviation_pct" in top_features[:2], (
        f"nav_deviation_pct must be a top-2 feature for a NAV anomaly. "
        f"Got: {top_features}"
    )


def test_shap_normal_sample_low_contributions():
    """For a normal sample, SHAP contributions should be small (no dominant feature)."""
    from genesis_swarm.shared.explainability import SHAPExplainer

    X, y = _build_dataset()
    model = _train_model(X)

    explainer = SHAPExplainer()
    normal_sample = X[0]  # first normal sample

    result = explainer.explain(
        features=normal_sample,
        model=model,
        feature_names=FEATURE_NAMES,
        top_n=3,
    )

    assert result is not None
    top_features = result.get("top_features", [])
    if top_features:
        top_score = top_features[0].get("importance", 0)
        print(f"\n[SHAP] Top importance for normal sample: {top_score:.4f}")
        # Normal samples should not have one massively dominant feature
        # (loose threshold to allow for statistical noise)
        assert top_score < 5.0, "Normal samples must not have extreme feature contributions"


def test_shap_consistency_across_anomaly_samples():
    """SHAP must consistently rank nav_deviation_pct as top feature across multiple anomalies."""
    from genesis_swarm.shared.explainability import SHAPExplainer

    X, y = _build_dataset()
    model = _train_model(X)
    explainer = SHAPExplainer()

    hits = 0
    for i in range(N_NORMAL, N_NORMAL + N_ANOMALY):
        result = explainer.explain(X[i], model, FEATURE_NAMES, top_n=2)
        top = [f["name"] for f in result.get("top_features", [])]
        if "nav_deviation_pct" in top:
            hits += 1

    consistency = hits / N_ANOMALY
    print(
        f"\n[SHAP] Consistency: nav_deviation_pct in top-2 for {hits}/{N_ANOMALY} anomalies ({consistency:.0%})")
    assert consistency >= 0.7, (
        f"SHAP must identify the ground-truth feature in ≥70% of anomalies. "
        f"Got {consistency:.0%}. Explanations may be noise."
    )


def test_shap_fallback_works_without_shap_package():
    """Explainer must work even if shap package is not installed (uses feature_importances_)."""
    import sys
    import unittest.mock as mock

    X, y = _build_dataset()
    model = _train_model(X)

    # Temporarily hide shap from imports
    with mock.patch.dict(sys.modules, {"shap": None}):
        from importlib import reload
        import genesis_swarm.shared.explainability as exp_mod
        reload(exp_mod)
        explainer = exp_mod.SHAPExplainer()
        result = explainer.explain(X[N_NORMAL], model, FEATURE_NAMES)

    assert result is not None
    assert result.get("method") in ("feature_importance", "zscore", "zscore_magnitude")
    print(f"\n[SHAP] Fallback method: {result.get('method')}")
