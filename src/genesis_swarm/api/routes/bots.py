from __future__ import annotations

import math
import time
from collections import deque

from fastapi import APIRouter

from ..state import _state

router = APIRouter()

_SIM_BOT_TYPES = [
    "COMMANDER_BOT","NAV_DETECTOR","CARGO_BOT","FUEL_BOT","SANCTIONS_BOT",
    "FX_BOT","COMPLIANCE_BOT","SUCCESSION_BOT","SOVEREIGN_BOT","YACHT_GUARDIAN",
    "ORBITAL_BOT","SHADOW_BOT",
]


def _sim_snapshots() -> dict:
    import numpy as np
    now = time.time()
    result = {}
    for i, bt in enumerate(_SIM_BOT_TYPES):
        scores = [
            round(abs(math.sin((now - (59 - j) * 30 + i * 17) / 45)) * 60, 2)
            for j in range(60)
        ]
        history = [{"ts": now - (59 - j) * 30, "score": s, "bot_type": bt} for j, s in enumerate(scores)]
        arr = np.array(scores, dtype=float)
        n = len(arr)
        x = np.arange(n, dtype=float)
        coeffs = np.polyfit(x, arr, 1)
        slope = float(coeffs[0])
        future_x = np.arange(n, n + 30, dtype=float)
        pred = np.polyval(coeffs, future_x)
        std = float(np.std(arr))
        forecast = {
            "forecast": np.clip(pred, 0, 100).tolist(),
            "upper": np.clip(pred + std, 0, 100).tolist(),
            "lower": np.clip(pred - std, 0, 100).tolist(),
            "trend": "rising" if slope > 0.5 else "falling" if slope < -0.5 else "stable",
            "growth_pct": round(slope * 30, 1),
            "current_score": round(float(arr[-1]), 2),
            "predicted_peak": round(float(np.clip(pred + std, 0, 100).max()), 2),
        }
        result[bt] = {"history": history, "forecast": forecast}
    return result


@router.get("/api/bots/snapshots")
def get_all_bot_snapshots():
    """Single endpoint returning history + forecast for all bots.
    Replaces 22 parallel per-bot calls (11 history + 11 forecast) with one request.
    """
    import numpy as np

    if not _state["bot_history"]:
        return _sim_snapshots()

    result = {}
    for bot_type, hist_deque in _state["bot_history"].items():
        history = list(hist_deque)
        forecast: dict = {
            "forecast": [],
            "upper": [],
            "lower": [],
            "trend": "insufficient_data",
            "growth_pct": 0,
        }
        if len(history) >= 10:
            scores = np.array([h["score"] for h in history], dtype=float)
            n = len(scores)
            x = np.arange(n, dtype=float)
            coeffs = np.polyfit(x, scores, 1)
            slope = float(coeffs[0])
            future_x = np.arange(n, n + 30, dtype=float)
            pred = np.polyval(coeffs, future_x)
            std = float(np.std(scores))
            forecast = {
                "forecast": pred.clip(0, 100).tolist(),
                "upper": (pred + std).clip(0, 100).tolist(),
                "lower": (pred - std).clip(0, 100).tolist(),
                "trend": "rising" if slope > 0.5 else "falling" if slope < -0.5 else "stable",
                "growth_pct": round(slope * 30, 1),
                "current_score": float(scores[-1]),
                "predicted_peak": float((pred + std).clip(0, 100).max()),
            }
        result[bot_type] = {"history": history, "forecast": forecast}
    return result


@router.get("/api/bots/{bot_type}/history")
def get_bot_history(bot_type: str):
    history = _state["bot_history"].get(bot_type.upper(), deque())
    return list(history)


@router.get("/api/bots/{bot_type}/forecast")
def get_bot_forecast(bot_type: str, steps: int = 30):
    import numpy as np

    history = list(_state["bot_history"].get(bot_type.upper(), deque()))
    if len(history) < 10:
        return {
            "forecast": [],
            "upper": [],
            "lower": [],
            "trend": "insufficient_data",
            "growth_pct": 0,
        }

    scores = np.array([h["score"] for h in history], dtype=float)
    n = len(scores)
    x = np.arange(n, dtype=float)

    # Linear regression
    coeffs = np.polyfit(x, scores, 1)
    slope = float(coeffs[0])

    # Extrapolate
    x_future = np.arange(n, n + steps, dtype=float)
    trend_values = np.polyval(coeffs, x_future)

    # Confidence band from residual std
    residuals = scores - np.polyval(coeffs, x)
    std = float(np.std(residuals))

    # Clamp to [0, 100]
    forecast = np.clip(trend_values, 0, 100).tolist()
    upper = np.clip(trend_values + 1.96 * std, 0, 100).tolist()
    lower = np.clip(trend_values - 1.96 * std, 0, 100).tolist()

    # Growth prediction
    current = float(scores[-1])
    predicted_end = float(trend_values[-1])
    growth_pct = ((predicted_end - current) / (current + 1e-9)) * 100

    trend_label = "rising" if slope > 0.5 else "falling" if slope < -0.5 else "stable"

    return {
        "forecast": [round(v, 2) for v in forecast],
        "upper": [round(v, 2) for v in upper],
        "lower": [round(v, 2) for v in lower],
        "trend": trend_label,
        "slope": round(slope, 4),
        "growth_pct": round(growth_pct, 1),
        "current_score": round(current, 1),
        "predicted_peak": round(float(np.max(trend_values)), 1),
        "steps": steps,
    }
