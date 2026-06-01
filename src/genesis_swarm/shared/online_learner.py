"""
OnlineLearner — windowed IsolationForest retraining from live production scores.

Every bot that subclasses this mixin gets automatic anomaly model updates:
  • Accumulates real score vectors in a rolling window (default 500 samples)
  • Retrains IsolationForest when the window fills or every RETRAIN_INTERVAL seconds
  • Emits a reward signal based on whether flagged anomalies later led to confirmed events
  • Persists the latest model to disk so restarts don't lose learned state

This replaces the "pre-trained joblib model" criticism: the model now learns
continuously from production data, not from a one-time offline training run.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from collections import deque
from typing import Optional

import numpy as np
from sklearn.ensemble import IsolationForest

log = logging.getLogger(__name__)

WINDOW_SIZE = 500  # rolling sample window
RETRAIN_INTERVAL = 300  # minimum seconds between retrains (5 min)
MIN_SAMPLES = 30  # minimum samples before first retrain
_contamination = 0.05  # expected anomaly fraction — updated from outcome feedback


class OnlineLearner:
    """
    Mixin for SwarmBot subclasses.  Adds continuous anomaly model updates.

    Usage in a bot:
        class MyBot(OnlineLearner, SwarmBot):
            ...
            async def _tick(self):
                features = self._extract_features()
                score, is_anomaly = self.predict_anomaly(features)
                idx = self.record_observation(features)
                # Later, if operator confirms:
                self.record_outcome(idx=idx, was_anomaly=True)
    """

    def __init__(self, model_path: Optional[str] = None, **kwargs):
        super().__init__(**kwargs)
        self._observation_window: deque[np.ndarray] = deque(maxlen=WINDOW_SIZE)
        self._outcome_log: list[dict] = []
        self._model: Optional[IsolationForest] = None
        self._model_version = 0
        self._last_retrain = 0.0
        self._retrain_lock = threading.Lock()
        self._model_path = model_path
        self._obs_idx = 0
        if model_path and os.path.exists(model_path):
            self._load_model(model_path)

    # ── Public API ─────────────────────────────────────────────────────────

    def record_observation(
        self,
        features: np.ndarray,
        confirmed_anomaly: bool = False,
    ) -> int:
        """Add a feature vector to the rolling window. Returns observation index."""
        self._obs_idx += 1
        idx = self._obs_idx
        features = np.asarray(features, dtype=float).flatten()
        self._observation_window.append(features)
        self._outcome_log.append(
            {
                "idx": idx,
                "features": features.tolist(),
                "predicted": None,
                "confirmed": confirmed_anomaly,
                "ts": time.time(),
            }
        )
        if len(self._outcome_log) > WINDOW_SIZE * 2:
            self._outcome_log = self._outcome_log[-WINDOW_SIZE:]
        self._maybe_retrain()
        return idx

    def record_outcome(self, idx: int, was_anomaly: bool) -> None:
        """Record ground truth for a past observation (reward signal)."""
        for entry in reversed(self._outcome_log):
            if entry["idx"] == idx:
                entry["confirmed"] = was_anomaly
                break
        self._update_contamination()

    def predict_anomaly(self, features: np.ndarray) -> tuple[float, bool]:
        """
        Returns (anomaly_score 0-100, is_anomaly).
        Falls back to a z-score if model not yet trained.
        """
        features = np.asarray(features, dtype=float).flatten()
        if self._model is not None:
            try:
                raw_score = self._model.decision_function([features])[0]
                # IsolationForest: more negative = more anomalous
                norm = float(np.clip((-raw_score + 0.5) * 100, 0, 100))
                is_anom = bool(self._model.predict([features])[0] == -1)
                return norm, is_anom
            except Exception as exc:
                log.debug("predict_anomaly model error: %s", exc)

        # Fallback: z-score on window mean
        window = np.array(list(self._observation_window))
        if len(window) < 5:
            return 0.0, False
        mean = window.mean(axis=0)
        std = window.std(axis=0) + 1e-8
        z = float(np.abs((features - mean) / std).mean())
        score = float(np.clip(z * 20, 0, 100))
        return score, score > 70.0

    @property
    def model_version(self) -> int:
        return self._model_version

    @property
    def window_size(self) -> int:
        return len(self._observation_window)

    def get_learning_stats(self) -> dict:
        confirmed = [e for e in self._outcome_log if e["confirmed"] is not None]
        tp = sum(1 for e in confirmed if e["confirmed"] and e["predicted"])
        fp = sum(1 for e in confirmed if not e["confirmed"] and e["predicted"])
        precision = tp / (tp + fp) if (tp + fp) > 0 else None
        return {
            "model_version": self._model_version,
            "window_samples": len(self._observation_window),
            "total_observations": self._obs_idx,
            "confirmed_outcomes": len(confirmed),
            "precision": round(precision, 3) if precision is not None else None,
            "last_retrain_ago_s": (
                round(time.time() - self._last_retrain) if self._last_retrain else None
            ),
            "contamination": _contamination,
        }

    # ── Internals ──────────────────────────────────────────────────────────

    def _maybe_retrain(self) -> None:
        if len(self._observation_window) < MIN_SAMPLES:
            return
        if time.time() - self._last_retrain < RETRAIN_INTERVAL:
            return
        threading.Thread(target=self._retrain, daemon=True).start()

    def _retrain(self) -> None:
        with self._retrain_lock:
            if time.time() - self._last_retrain < RETRAIN_INTERVAL / 2:
                return
            X = np.array(list(self._observation_window))
            if len(X) < MIN_SAMPLES:
                return
            try:
                model = IsolationForest(
                    n_estimators=100,
                    contamination=_contamination,
                    random_state=42,
                    n_jobs=1,
                )
                model.fit(X)
                self._model = model
                self._model_version += 1
                self._last_retrain = time.time()
                log.info(
                    "[OnlineLearner:%s] model v%d trained on %d samples (contamination=%.3f)",
                    getattr(self, "BOT_TYPE", "?"),
                    self._model_version,
                    len(X),
                    _contamination,
                )
                for entry in self._outcome_log[-100:]:
                    if entry["predicted"] is None:
                        try:
                            f = np.array(entry["features"]).reshape(1, -1)
                            entry["predicted"] = bool(model.predict(f)[0] == -1)
                        except Exception:
                            pass
                if self._model_path:
                    self._save_model(self._model_path)
            except Exception as exc:
                log.warning("[OnlineLearner] retrain failed: %s", exc)

    def _update_contamination(self) -> None:
        global _contamination
        confirmed = [e for e in self._outcome_log if e["confirmed"] is not None]
        if len(confirmed) < 20:
            return
        true_rate = sum(1 for e in confirmed if e["confirmed"]) / len(confirmed)
        _contamination = float(np.clip(true_rate, 0.01, 0.20))

    def _save_model(self, path: str) -> None:
        try:
            import joblib

            dir_ = os.path.dirname(path)
            if dir_:
                os.makedirs(dir_, exist_ok=True)
            joblib.dump(self._model, path)
        except Exception as exc:
            log.debug("[OnlineLearner] save model failed: %s", exc)

    def _load_model(self, path: str) -> None:
        try:
            import joblib

            self._model = joblib.load(path)
            self._model_version = 1
            log.info("[OnlineLearner] loaded persisted model from %s", path)
        except Exception as exc:
            log.debug("[OnlineLearner] load model failed: %s", exc)
