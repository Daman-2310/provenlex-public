"""
SHAP-based explainability for IsolationForest anomaly predictions.

Each alert now carries a feature-importance breakdown: "why did this fire?"
IsolationForest is tree-based so TreeExplainer works directly — no approximation.

Usage in OnlineLearner subclass:
    from genesis_swarm.shared.explainability import SHAPExplainer

    class MyBot(OnlineLearner, SwarmBot):
        def _tick(self):
            features = self._extract_features()
            score, is_anomaly = self.predict_anomaly(features)
            if is_anomaly:
                explanation = self._explainer.explain(features, self._model, self._feature_names)
                alert.details["shap"] = explanation

Or standalone via the API endpoint:
    GET /api/v1/alerts/{round_id}/explain
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import numpy as np

try:
    import shap

    _SHAP_OK = True
except ImportError:
    _SHAP_OK = False

log = logging.getLogger(__name__)


class SHAPExplainer:
    """
    Wraps SHAP TreeExplainer for IsolationForest models.
    Falls back to feature importance via mean absolute SHAP approximation
    if the full TreeExplainer is unavailable.
    """

    def explain(
        self,
        features: np.ndarray,
        model: Any,
        feature_names: Optional[list[str]] = None,
        top_n: int = 5,
    ) -> dict:
        """
        Returns:
            {
                "method":   "shap_tree" | "feature_importance" | "zscore",
                "top_features": [
                    {"name": "nav_deviation", "contribution": 0.42, "value": 1.87},
                    ...
                ],
                "base_score":  float,  # expected anomaly rate
                "total_score": float,  # sum of contributions
            }
        """
        features = np.asarray(features, dtype=float).flatten()
        n_features = len(features)
        names = feature_names or [f"feature_{i}" for i in range(n_features)]

        if _SHAP_OK and model is not None:
            return self._shap_tree_explain(features, model, names, top_n)
        elif model is not None:
            return self._feature_importance_explain(features, model, names, top_n)
        else:
            return self._zscore_explain(features, names, top_n)

    def _shap_tree_explain(
        self, features: np.ndarray, model: Any, names: list[str], top_n: int
    ) -> dict:
        try:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(features.reshape(1, -1))[0]

            # IsolationForest SHAP values: negative = more anomalous contribution
            # We negate so higher = more anomalous (consistent with score direction)
            contributions = -shap_values
            base_score = float(-explainer.expected_value)

            top_idx = np.argsort(np.abs(contributions))[::-1][:top_n]
            top_features = [
                {
                    "name": names[i] if i < len(names) else f"feature_{i}",
                    "contribution": round(float(contributions[i]), 4),
                    "value": round(float(features[i]), 4),
                }
                for i in top_idx
            ]

            return {
                "method": "shap_tree",
                "top_features": top_features,
                "base_score": round(base_score, 4),
                "total_score": round(float(np.sum(contributions)), 4),
                "n_features": len(features),
            }
        except Exception as exc:
            log.debug("SHAP TreeExplainer failed: %s — falling back", exc)
            return self._feature_importance_explain(features, model, names, top_n)

    def _feature_importance_explain(
        self, features: np.ndarray, model: Any, names: list[str], top_n: int
    ) -> dict:
        """Use IsolationForest feature_importances_ as a proxy for SHAP."""
        try:
            importances = model.feature_importances_  # tree-based, available on IF
            contributions = importances * np.abs(features)

            top_idx = np.argsort(contributions)[::-1][:top_n]
            top_features = [
                {
                    "name": names[i] if i < len(names) else f"feature_{i}",
                    "contribution": round(float(contributions[i]), 4),
                    "value": round(float(features[i]), 4),
                    "importance": round(float(importances[i]), 4),
                }
                for i in top_idx
            ]
            return {
                "method": "feature_importance",
                "top_features": top_features,
                "base_score": 0.0,
                "total_score": round(float(np.sum(contributions)), 4),
                "n_features": len(features),
            }
        except Exception as exc:
            log.debug("Feature importance explain failed: %s", exc)
            return self._zscore_explain(features, names, top_n)

    def _zscore_explain(self, features: np.ndarray, names: list[str], top_n: int) -> dict:
        """
        Fallback: z-score magnitudes as proxy contributions.
        No model required.
        """
        # Without population statistics we use the feature magnitudes themselves
        contributions = np.abs(features)
        top_idx = np.argsort(contributions)[::-1][:top_n]
        top_features = [
            {
                "name": names[i] if i < len(names) else f"feature_{i}",
                "contribution": round(float(contributions[i]), 4),
                "value": round(float(features[i]), 4),
            }
            for i in top_idx
        ]
        return {
            "method": "zscore_magnitude",
            "top_features": top_features,
            "base_score": 0.0,
            "total_score": round(float(np.sum(contributions)), 4),
            "n_features": len(features),
            "note": "Install shap>=0.45 for full SHAP TreeExplainer values",
        }


def explain_alert(
    features: list[float],
    model: Any,
    feature_names: Optional[list[str]] = None,
    bot_type: str = "UNKNOWN",
) -> dict:
    """
    Top-level convenience function for API endpoints.
    Returns a plain dict suitable for JSON serialisation.
    """
    explainer = SHAPExplainer()
    explanation = explainer.explain(np.array(features), model, feature_names)
    explanation["bot_type"] = bot_type
    return explanation
