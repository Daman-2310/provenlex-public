from __future__ import annotations

import urllib.request

from fastapi.testclient import TestClient


def test_ofac_screener_does_not_fetch_on_construction(monkeypatch):
    from genesis_swarm.compliance.ofac_screener import OFACScreener

    def fail_urlopen(*args, **kwargs):
        raise AssertionError("OFACScreener should lazy-load feeds after construction")

    monkeypatch.setattr(urllib.request, "urlopen", fail_urlopen)
    screener = OFACScreener()

    assert screener.get_stats()["loaded"] is False
    assert screener.get_stats()["screen_count"] == 0


def test_status_endpoint_has_stable_starting_contract():
    from genesis_swarm.api.server import app, _state

    old_commander = _state["commander"]
    _state["commander"] = None
    try:
        response = TestClient(app).get("/api/status")
    finally:
        _state["commander"] = old_commander

    assert response.status_code == 200
    assert response.json() == {
        "status": "starting",
        "uptime_seconds": 0,
        "total_bots": 0,
        "healthy_bots": 0,
        "active_alerts": 0,
        "top_threat": None,
        "top_score": 0.0,
        "consensus_rounds": 0,
        "healing_events": 0,
        "mode": "NORMAL",
        "fear_index": 0.0,
        "safe_haven": False,
    }


def test_consensus_metrics_alias_matches_frontend_contract():
    from genesis_swarm.api.server import app, _state

    _state["consensus_latency_ms"].clear()
    _state["consensus_latency_ms"].append({"ts": 100.0, "value": 42.5})
    _state["consensus_latency_ms"].append({"ts": 101.0, "value": 85.0})

    response = TestClient(app).get("/api/metrics/consensus")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"p50_ms", "p95_ms", "p99_ms", "rounds_per_min", "last_round_ts", "history"}
    assert body["p50_ms"] >= 0
    assert body["p95_ms"] >= body["p50_ms"]
    assert body["last_round_ts"] == 101.0
    assert body["history"] == [
        {"ts": 100.0, "latency_ms": 42.5},
        {"ts": 101.0, "latency_ms": 85.0},
    ]


def test_case_writes_require_authentication(tmp_path, monkeypatch):
    import genesis_swarm.api.server as server

    monkeypatch.setattr(server, "_DB_PATH", str(tmp_path / "cases.db"))
    server._init_db()
    client = TestClient(server.app)

    unauthenticated = client.post(
        "/api/cases",
        json={"bot_type": "NAV_DETECTOR", "score": 80, "summary": "blocked"},
    )
    assert unauthenticated.status_code == 401

    login = client.post("/api/auth/login", json={"username": "admin", "password": "genesis2024"})
    assert login.status_code == 200
    token = login.json()["token"]

    created = client.post(
        "/api/cases",
        json={"bot_type": "NAV_DETECTOR", "score": 80, "summary": "allowed"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert created.status_code == 201  # 201 Created
    assert created.json()["status"] == "OPEN"


def test_investor_brief_is_diligence_ready(tmp_path, monkeypatch):
    import genesis_swarm.api.server as server

    monkeypatch.setattr(server, "_DB_PATH", str(tmp_path / "cases.db"))
    server._init_db()

    response = TestClient(server.app).get("/api/investor/brief")

    assert response.status_code == 200
    body = response.json()
    assert body["readiness_score"] >= 50
    assert body["protected_aum_eur_m"] > 0
    assert body["annual_value_eur_m"] > 0
    assert body["payback_days"] > 0
    assert body["speedup_multiple"] > 1000
    assert body["evidence"]["jwt_protected_writes"] is True
    assert body["evidence"]["ci_gate"] is True
    assert len(body["moat"]) >= 5


def test_boardroom_mode_script_and_start(tmp_path, monkeypatch):
    import genesis_swarm.api.server as server

    monkeypatch.setattr(server, "_DB_PATH", str(tmp_path / "cases.db"))
    server._init_db()
    client = TestClient(server.app)

    script = client.get("/api/boardroom/script")
    assert script.status_code == 200
    assert script.json()["total_duration_ms"] > 0
    assert len(script.json()["steps"]) >= 6

    blocked = client.post("/api/boardroom/start")
    assert blocked.status_code == 401

    login = client.post("/api/auth/login", json={"username": "admin", "password": "genesis2024"})
    token = login.json()["token"]
    started = client.post("/api/boardroom/start", headers={"Authorization": f"Bearer {token}"})

    assert started.status_code == 200
    body = started.json()
    assert body["case_id"]
    assert body["crisis"]["status"] == "CRISIS_TRIGGERED"
    assert body["report_url"] == "/api/report/compliance"

    status = client.get("/api/boardroom/status")
    assert status.status_code == 200
    assert status.json()["active"] is True
