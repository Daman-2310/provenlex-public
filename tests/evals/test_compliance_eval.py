"""
JARVIS Compliance Evaluation Runner

Loads compliance_eval.yaml and scores JARVIS responses.
Requires: ANTHROPIC_API_KEY env var
          GENESIS_URL env var (optional — for live JARVIS endpoint test)

Run: pytest tests/evals/test_compliance_eval.py -v
     ANTHROPIC_API_KEY=sk-... pytest tests/evals/test_compliance_eval.py -v

Produces: eval_results.json with per-question scores and overall pass rate.
Target: ≥ 80 / 100 PASS.
"""
from __future__ import annotations

import json
import os
import pathlib
from typing import Any

import pytest
import yaml

EVAL_FILE = pathlib.Path(__file__).parent / "compliance_eval.yaml"
RESULTS_FILE = pathlib.Path("eval_results.json")

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def eval_questions() -> list[dict]:
    with open(EVAL_FILE) as f:
        data = yaml.safe_load(f)
    return data["evals"]


@pytest.fixture(scope="session")
def anthropic_client():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        pytest.skip("ANTHROPIC_API_KEY not set — skipping JARVIS eval")
    try:
        import anthropic
        return anthropic.Anthropic(api_key=api_key)
    except ImportError:
        pytest.skip("anthropic package not installed")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are JARVIS, the AI compliance analyst for Genesis Swarm —
an open-source financial crime detection system for European fund administrators.
You have deep expertise in:
- DORA (Regulation EU 2022/2554) — Digital Operational Resilience Act
- CSSF Circular 18/698 — ICT Risk Management
- EU and US AML/CFT regulations (AMLD, FATF, OFAC)
- Financial fraud patterns (NAV manipulation, trade-based ML, Ponzi schemes)
- Genesis Swarm's technical architecture (PBFT consensus, IsolationForest, SHAP)

Answer questions concisely and accurately. If you are unsure, say so clearly.
"""


def _ask_jarvis(client, question: str) -> str:
    response = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": question}],
    )
    return response.content[0].text


def _score(answer: str, expected_keywords: list[str], forbidden_keywords: list[str]) -> dict:
    lower = answer.lower()
    missing = [kw for kw in expected_keywords if kw.lower() not in lower]
    triggered = [kw for kw in forbidden_keywords if kw.lower() in lower]
    passed = not missing and not triggered
    return {
        "passed": passed,
        "missing_keywords": missing,
        "forbidden_triggered": triggered,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_eval_file_has_100_questions(eval_questions):
    assert len(eval_questions) == 100, \
        f"Expected 100 eval questions, found {len(eval_questions)}"


def test_all_questions_have_required_fields(eval_questions):
    required = {"id", "question", "expected_keywords", "forbidden_keywords", "domain", "difficulty"}
    for q in eval_questions:
        missing = required - set(q.keys())
        assert not missing, f"Question {q.get('id')} missing fields: {missing}"


def test_jarvis_compliance_score(anthropic_client, eval_questions):
    """Score JARVIS on all 100 compliance questions. Target: ≥ 80/100 PASS."""
    results = []
    passed_count = 0

    for q in eval_questions:
        answer = _ask_jarvis(anthropic_client, q["question"])
        score = _score(answer, q["expected_keywords"], q["forbidden_keywords"])
        results.append({
            "id": q["id"],
            "domain": q["domain"],
            "difficulty": q["difficulty"],
            "question": q["question"],
            "answer": answer[:500],
            **score,
        })
        if score["passed"]:
            passed_count += 1

    total = len(eval_questions)
    pass_rate = passed_count / total

    # Write results
    RESULTS_FILE.write_text(json.dumps({
        "summary": {
            "passed": passed_count,
            "total": total,
            "pass_rate": pass_rate,
            "target": 0.80,
        },
        "results": results,
    }, indent=2))

    # Domain breakdown
    domain_scores: dict[str, Any] = {}
    for r in results:
        d = r["domain"]
        domain_scores.setdefault(d, {"passed": 0, "total": 0})
        domain_scores[d]["total"] += 1
        if r["passed"]:
            domain_scores[d]["passed"] += 1

    print(f"\n{'─' * 60}")
    print(f"JARVIS Compliance Eval: {passed_count}/{total} PASSED ({pass_rate:.0%})")
    print(f"{'─' * 60}")
    for domain, ds in sorted(domain_scores.items()):
        pct = ds["passed"] / ds["total"]
        status = "✅" if pct >= 0.75 else "⚠️"
        print(f"  {status} {domain}: {ds['passed']}/{ds['total']} ({pct:.0%})")
    print(f"{'─' * 60}")

    assert pass_rate >= 0.80, (
        f"JARVIS pass rate {pass_rate:.1%} below 80% target. "
        f"See {RESULTS_FILE} for per-question breakdown."
    )


def test_jarvis_no_hallucination_on_dora_dates(anthropic_client):
    """JARVIS should not confuse DORA deadlines (a common LLM error)."""
    answer = _ask_jarvis(
        anthropic_client,
        "What is the initial notification deadline for a major ICT incident under DORA Article 19?"
    )
    lower = answer.lower()
    assert "4 hours" in lower, f"Expected '4 hours' in answer, got: {answer[:200]}"
    assert "24 hours" not in lower, f"Hallucinated '24 hours' deadline: {answer[:200]}"


def test_jarvis_knows_genesis_swarm_architecture(anthropic_client):
    """JARVIS should accurately describe the PBFT configuration."""
    answer = _ask_jarvis(
        anthropic_client,
        "How many bots does Genesis Swarm run and how many Byzantine faults can it tolerate?"
    )
    lower = answer.lower()
    assert "11" in lower, f"Expected '11 bots' in answer: {answer[:200]}"
    assert "3" in lower or "three" in lower, f"Expected 'f=3' in answer: {answer[:200]}"
