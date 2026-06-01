from __future__ import annotations

PERSONALITY_CONFIGS: dict[str, dict] = {
    "AGGRESSIVE": {
        "base_alloc": 15.0,
        "color": "#f97316",
        "label": "Aggressive",
        "motto": "Act before the crowd moves",
    },
    "CONTRARIAN": {
        "base_alloc": 12.0,
        "color": "#a855f7",
        "label": "Contrarian",
        "motto": "Buy when others panic",
    },
    "MOMENTUM": {
        "base_alloc": 10.0,
        "color": "#3b82f6",
        "label": "Momentum",
        "motto": "Ride the trend until it breaks",
    },
    "TREND_FOLLOWER": {
        "base_alloc": 9.0,
        "color": "#6366f1",
        "label": "Trend Follower",
        "motto": "The trend is your only friend",
    },
    "SYSTEMATIC": {
        "base_alloc": 8.0,
        "color": "#06b6d4",
        "label": "Systematic",
        "motto": "Trust the signal, not the story",
    },
    "MACRO": {
        "base_alloc": 7.0,
        "color": "#14b8a6",
        "label": "Macro",
        "motto": "Regimes change — position accordingly",
    },
    "FORENSIC": {
        "base_alloc": 5.0,
        "color": "#f59e0b",
        "label": "Forensic",
        "motto": "Follow the money trail",
    },
    "SENTINEL": {
        "base_alloc": 4.0,
        "color": "#ef4444",
        "label": "Sentinel",
        "motto": "I watch what others miss",
    },
    "CONSERVATIVE": {
        "base_alloc": 3.0,
        "color": "#22c55e",
        "label": "Conservative",
        "motto": "Protect capital above all else",
    },
    "RISK_AVERSE": {
        "base_alloc": 2.0,
        "color": "#94a3b8",
        "label": "Risk Averse",
        "motto": "No position beats a bad one",
    },
}


def calculate_position(personality: str, anomaly_score: float, safe_haven: bool = False) -> float:
    """Return suggested capital allocation % (0-100)."""
    if safe_haven:
        return 0.01
    cfg = PERSONALITY_CONFIGS.get(personality, {"base_alloc": 5.0})
    base = cfg["base_alloc"]
    risk = (anomaly_score / 100.0) ** 0.75
    return round(max(0.01, base * (1.0 - risk)), 2)


def risk_label(score: float) -> str:
    if score < 20:
        return "MINIMAL"
    if score < 40:
        return "LOW"
    if score < 60:
        return "MODERATE"
    if score < 80:
        return "HIGH"
    return "EXTREME"


def risk_color(score: float) -> str:
    if score < 20:
        return "#22c55e"
    if score < 40:
        return "#84cc16"
    if score < 60:
        return "#eab308"
    if score < 80:
        return "#f97316"
    return "#ef4444"


def personality_confidence_modifier(personality: str, is_high_risk: bool) -> float:
    """Returns a vote-confidence modifier (0.5-1.5) based on personality stance on risk."""
    # Aggressive + high risk → votes with high confidence
    # Conservative + high risk → lower confidence (more cautious)
    modifiers = {
        "AGGRESSIVE": (1.4 if is_high_risk else 1.0),
        "CONTRARIAN": (1.3 if not is_high_risk else 0.7),
        "MOMENTUM": (1.2 if is_high_risk else 1.0),
        "TREND_FOLLOWER": (1.1 if is_high_risk else 1.0),
        "SYSTEMATIC": 1.0,
        "MACRO": (1.1 if is_high_risk else 0.9),
        "FORENSIC": (1.2 if is_high_risk else 0.9),
        "SENTINEL": (1.3 if is_high_risk else 0.8),
        "CONSERVATIVE": (0.6 if is_high_risk else 1.0),
        "RISK_AVERSE": (0.5 if is_high_risk else 1.0),
    }
    return modifiers.get(personality, 1.0)
