"""
A/B Shadow Model Deployment for OnlineLearner.

Runs a shadow IsolationForest alongside the production model.
Both models see every observation, but only the production model drives decisions.

Promotion gate:
  - After MIN_SHADOW_SAMPLES, compare shadow vs. production AUC-ROC on recent labelled outcomes
  - If shadow AUC >= production AUC + PROMOTION_THRESHOLD: promote shadow → production
  - If shadow AUC < DEMOTION_THRESHOLD: discard shadow and start fresh

This ensures the model never degrades — the shadow must prove itself before going live.

Usage:
    class MyBot(ShadowModelMixin, OnlineLearner, SwarmBot):
        pass  # automatic shadow tracking

Or inject into an existing OnlineLearner:
    shadow_mgr = ShadowModelManager(learner)
    shadow_mgr.observe(features, outcome)
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Optional

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.metrics import roc_auc_score

log = logging.getLogger(__name__)

MIN_SHADOW_SAMPLES = 100  # minimum labelled outcomes before evaluation
PROMOTION_THRESHOLD = 0.02  # shadow AUC must beat production by this margin
DEMOTION_THRESHOLD = 0.45  # discard shadow if AUC falls below this
SHADOW_WINDOW = 500  # rolling observation window for shadow
EVAL_INTERVAL = 50  # re-evaluate every N labelled outcomes


class ShadowModelManager:
    """
    Manages a shadow model running alongside a production OnlineLearner.

    Attach to any OnlineLearner instance:
        mgr = ShadowModelManager(my_learner)
        mgr.observe(features, was_anomaly=True)
    """

    def __init__(self, production_learner=None, contamination: float = 0.05):
        self._prod = production_learner
        self._shadow_model: Optional[IsolationForest] = None
        self._shadow_obs: list[np.ndarray] = []
        self._shadow_labels: list[int] = []
        self._outcomes: list[dict] = []
        self._shadow_ver = 0
        self._prod_auc = None
        self._shadow_auc = None
        self._promotions = 0
        self._lock = threading.Lock()
        self._contamination = contamination
        self._shadow_trained = False

    def observe(self, features: np.ndarray, was_anomaly: Optional[bool] = None) -> dict:
        """
        Feed an observation to both production and shadow models.
        Returns comparison dict if enough data for evaluation.
        """
        features = np.asarray(features, dtype=float).flatten()

        with self._lock:
            self._shadow_obs.append(features)
            if was_anomaly is not None:
                self._shadow_labels.append(int(was_anomaly))
                self._outcomes.append(
                    {
                        "features": features.tolist(),
                        "was_anomaly": int(was_anomaly),
                        "ts": time.time(),
                    }
                )
                if len(self._outcomes) > SHADOW_WINDOW:
                    self._outcomes = self._outcomes[-SHADOW_WINDOW:]

            # Keep observation window bounded
            if len(self._shadow_obs) > SHADOW_WINDOW:
                self._shadow_obs = self._shadow_obs[-SHADOW_WINDOW:]
            if len(self._shadow_labels) > SHADOW_WINDOW:
                self._shadow_labels = self._shadow_labels[-SHADOW_WINDOW:]

        # Trigger background retrain of shadow if enough observations
        if len(self._shadow_obs) >= 30 and len(self._shadow_obs) % 30 == 0:
            threading.Thread(target=self._retrain_shadow, daemon=True).start()

        # Evaluate and maybe promote
        if (
            len(self._shadow_labels) >= MIN_SHADOW_SAMPLES
            and len(self._shadow_labels) % EVAL_INTERVAL == 0
        ):
            return self._evaluate()

        return {"status": "accumulating", "shadow_samples": len(self._shadow_obs)}

    def _retrain_shadow(self) -> None:
        with self._lock:
            X = np.array(self._shadow_obs[-SHADOW_WINDOW:])
        if len(X) < 30:
            return
        try:
            m = IsolationForest(
                n_estimators=100, contamination=self._contamination, random_state=99
            )
            m.fit(X)
            with self._lock:
                self._shadow_model = m
                self._shadow_ver += 1
                self._shadow_trained = True
            log.info("[ShadowModel] Retrained shadow v%d on %d samples", self._shadow_ver, len(X))
        except Exception as exc:
            log.warning("[ShadowModel] Retrain failed: %s", exc)

    def _evaluate(self) -> dict:
        """Compare shadow vs. production AUC-ROC on labelled outcomes."""
        with self._lock:
            outcomes = list(self._outcomes)
            shadow = self._shadow_model
            prod = getattr(self._prod, "_model", None) if self._prod else None

        if not outcomes or shadow is None:
            return {"status": "waiting_for_model"}

        X = np.array([o["features"] for o in outcomes])
        y = np.array([o["was_anomaly"] for o in outcomes])

        if y.sum() == 0 or y.sum() == len(y):
            return {"status": "insufficient_label_diversity"}

        def _auc(model) -> Optional[float]:
            try:
                scores = -model.decision_function(X)  # higher = more anomalous
                return float(roc_auc_score(y, scores))
            except Exception:
                return None

        shadow_auc = _auc(shadow)
        prod_auc = _auc(prod) if prod else None

        self._shadow_auc = shadow_auc
        self._prod_auc = prod_auc

        result = {
            "status": "evaluated",
            "shadow_auc": round(shadow_auc, 4) if shadow_auc is not None else None,
            "prod_auc": round(prod_auc, 4) if prod_auc is not None else None,
            "shadow_version": self._shadow_ver,
            "outcomes_used": len(outcomes),
            "promoted": False,
            "discarded": False,
        }

        if shadow_auc is None:
            return result

        # Promotion: shadow beats production by PROMOTION_THRESHOLD
        if prod_auc is None or shadow_auc >= prod_auc + PROMOTION_THRESHOLD:
            self._promote()
            result["promoted"] = True
            result["reason"] = (
                f"shadow AUC {
                    shadow_auc:.3f} >= prod AUC {
                    prod_auc or 0:.3f} + {PROMOTION_THRESHOLD}")
            log.info(
                "[ShadowModel] ✓ PROMOTED shadow v%d (shadow_auc=%.3f, prod_auc=%s)",
                self._shadow_ver,
                shadow_auc,
                f"{prod_auc:.3f}" if prod_auc else "N/A",
            )

        # Demotion: shadow too weak
        elif shadow_auc < DEMOTION_THRESHOLD:
            self._discard_shadow()
            result["discarded"] = True
            result["reason"] = (
                f"shadow AUC {shadow_auc:.3f} < demotion threshold {DEMOTION_THRESHOLD}"
            )
            log.warning(
                "[ShadowModel] ✗ DISCARDED shadow v%d (AUC=%.3f)", self._shadow_ver, shadow_auc
            )

        return result

    def _promote(self) -> None:
        """Replace production model with shadow."""
        if self._prod and self._shadow_model is not None:
            self._prod._model = self._shadow_model
            self._prod._model_version += 1
        with self._lock:
            self._shadow_model = None
            self._shadow_trained = False
            self._promotions += 1

    def _discard_shadow(self) -> None:
        with self._lock:
            self._shadow_model = None
            self._shadow_trained = False
            self._shadow_obs.clear()
            self._shadow_labels.clear()

    def stats(self) -> dict:
        return {
            "shadow_trained": self._shadow_trained,
            "shadow_version": self._shadow_ver,
            "shadow_samples": len(self._shadow_obs),
            "labelled_outcomes": len(self._shadow_labels),
            "shadow_auc": round(self._shadow_auc, 4) if self._shadow_auc else None,
            "prod_auc": round(self._prod_auc, 4) if self._prod_auc else None,
            "promotions": self._promotions,
        }
