# loadtest/locustfile.py  — Protocol 3: Enterprise stress-testing suite
# Run:  locust -f loadtest/locustfile.py --host https://genesis-swarm-rgq5.vercel.app \
#              --users 1000 --spawn-rate 50 --run-time 5m --headless --csv genesis_load
# Env:  export GENESIS_API_KEY=<a valid bearer key>
# Scores: failure ratio, p95/p99 latency, serverless-timeout count, dropped packets.

import os
import json
import random
from locust import HttpUser, task, between, events

API_KEY = os.environ.get("GENESIS_API_KEY", "")
HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}

JURISDICTIONS = ["CSSF", "BaFin", "FCA", "AMF", "AFM"]

def make_state():
    return {
        "capital":   {"tier1_ratio": round(random.uniform(9.0, 16.0), 1),
                       "leverage_ratio": round(random.uniform(2.0, 6.0), 1)},
        "liquidity": {"lcr": round(random.uniform(85, 140), 0)},
        "risk":      {"single_issuer_pct": round(random.uniform(4, 18), 1)},
        "screening": {"ofac_match": random.choice(["true", "false"])},
    }

TIMEOUTS = {"count": 0}
DROPPED  = {"count": 0}

class CorporatePilotUser(HttpUser):
    wait_time = between(0.5, 2.0)   # realistic per-user think time

    @task(5)
    def evaluate_loop(self):
        payload = {"state": make_state(), "jurisdiction": random.choice(JURISDICTIONS)}
        with self.client.post("/api/pillars/demo", json=payload, headers=HEADERS,
                              name="POST /pillars/demo", catch_response=True, timeout=30) as r:
            if r.status_code == 0 or r.elapsed.total_seconds() > 25:
                TIMEOUTS["count"] += 1
                r.failure(f"serverless timeout / slow: {r.elapsed.total_seconds():.1f}s")
            elif r.status_code == 429:
                r.success()  # rate-limit under load is correct behaviour, not a failure
            elif r.status_code != 200:
                r.failure(f"status {r.status_code}")
            else:
                try:
                    body = r.json()
                    if not body.get("verdict") or "redteam" not in body:
                        DROPPED["count"] += 1
                        r.failure("dropped/truncated JSON packet")
                    else:
                        r.success()
                except json.JSONDecodeError:
                    DROPPED["count"] += 1
                    r.failure("malformed JSON")

    @task(2)
    def reject_unauthenticated(self):
        # Negative test: the guard MUST 401 without a key (security regression gate)
        with self.client.post("/api/pillars/demo", json={"state": {}},
                              name="POST /pillars/demo [NO AUTH]",
                              headers={"Content-Type": "application/json"},
                              catch_response=True) as r:
            if r.status_code == 401:
                r.success()
            else:
                r.failure(f"SECURITY: unauthenticated returned {r.status_code}, expected 401")

@events.quitting.add_listener
def assess_enterprise_stability(environment, **_):
    stats = environment.stats.total
    fail_ratio = stats.fail_ratio
    p95 = stats.get_response_time_percentile(0.95)
    p99 = stats.get_response_time_percentile(0.99)
    print("\n================ ENTERPRISE STABILITY SCORE ================")
    print(f" requests      : {stats.num_requests}")
    print(f" failure ratio : {fail_ratio*100:.2f}%")
    print(f" p95 latency   : {p95} ms")
    print(f" p99 latency   : {p99} ms")
    print(f" timeouts      : {TIMEOUTS['count']}")
    print(f" dropped JSON  : {DROPPED['count']}")
    ok = fail_ratio < 0.01 and p95 < 3000 and TIMEOUTS["count"] == 0 and DROPPED["count"] == 0
    print(f" VERDICT       : {'PASS - audit-ready' if ok else 'FAIL - harden before audit'}")
    print("============================================================")
    environment.process_exit_code = 0 if ok else 1
