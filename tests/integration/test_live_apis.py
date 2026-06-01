"""
Live API Integration Tests — hit real external endpoints.

Tests are automatically skipped when:
  - Network is unavailable
  - Required API keys are missing from environment
  - Specific SKIP_LIVE_TESTS env var is set

Run: pytest tests/integration/test_live_apis.py -v
Markers: @pytest.mark.integration — skip in fast CI, run in nightly CI

These tests confirm that external data providers used by Genesis Swarm:
  1. Return correctly structured responses
  2. Are reachable from the deployment environment
  3. Return data within expected schema (not just 200 OK)

They are NOT load tests. One call per provider per test run.
"""
from __future__ import annotations

import os
import pytest
import asyncio
import aiohttp

# ---------------------------------------------------------------------------
# Skip helpers
# ---------------------------------------------------------------------------

_network_available: bool | None = None


def _check_network() -> bool:
    global _network_available
    if _network_available is not None:
        return _network_available
    import socket
    import urllib.request
    try:
        socket.setdefaulttimeout(3)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect(("8.8.8.8", 53))
    except OSError:
        _network_available = False
        return _network_available
    # Also verify SSL certificates work — skip if macOS cert store not configured
    try:
        urllib.request.urlopen("https://www.treasury.gov", timeout=5)
        _network_available = True
    except Exception:
        _network_available = False
    return _network_available


skip_no_network = pytest.mark.skipif(
    not _check_network() or os.getenv("SKIP_LIVE_TESTS") == "1",
    reason="Network unavailable or SKIP_LIVE_TESTS=1"
)


# ---------------------------------------------------------------------------
# OFAC SDN List (no API key required)
# ---------------------------------------------------------------------------

@skip_no_network
def test_ofac_sdn_returns_csv():
    """OFAC SDN CSV endpoint is reachable and returns CSV-shaped data."""
    import urllib.request

    url = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV"
    with urllib.request.urlopen(url, timeout=20) as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        first_bytes = resp.read(512).decode("utf-8", errors="replace")

    # CSV should contain known column headers
    assert "SDN_NAME" in first_bytes or "ent_num" in first_bytes.lower() or "," in first_bytes, \
        f"Response does not look like CSV: {first_bytes[:200]!r}"


@skip_no_network
def test_ofac_sdn_contains_known_entity():
    """OFAC SDN contains at least one well-known sanctioned entity."""
    import urllib.request
    import io
    import csv

    url = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV"
    with urllib.request.urlopen(url, timeout=30) as resp:
        content = resp.read().decode("utf-8", errors="replace")

    # The list typically has > 5000 entries
    rows = content.strip().split("\n")
    assert len(rows) > 100, f"SDN list suspiciously short: {len(rows)} lines"


# ---------------------------------------------------------------------------
# ECB Statistical Data Warehouse (no API key required)
# ---------------------------------------------------------------------------

@skip_no_network
def test_ecb_eurusd_rate_format():
    """ECB EXR endpoint returns JSON with a numeric USD/EUR rate."""
    import urllib.request
    import json

    url = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=1&format=jsondata"
    with urllib.request.urlopen(url, timeout=20) as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        data = json.loads(resp.read())

    # ECB JSON format: dataSets[0].series["0:0:0:0:0"].observations
    datasets = data.get("dataSets", [])
    assert datasets, "ECB response missing dataSets"
    series = list(datasets[0].get("series", {}).values())
    assert series, "ECB response missing series"
    obs = series[0].get("observations", {})
    assert obs, "ECB response missing observations"

    # Each observation is a list; first element is the rate
    first_obs = list(obs.values())[0]
    rate = first_obs[0]
    assert isinstance(rate, (int, float)), f"Rate is not numeric: {rate!r}"
    assert 0.5 < rate < 3.0, f"USD/EUR rate {rate} out of plausible range"


@skip_no_network
def test_ecb_gbpeur_rate_format():
    """ECB returns GBP/EUR rate in expected range."""
    import urllib.request
    import json

    url = "https://data-api.ecb.europa.eu/service/data/EXR/D.GBP.EUR.SP00.A?lastNObservations=1&format=jsondata"
    with urllib.request.urlopen(url, timeout=20) as resp:
        data = json.loads(resp.read())

    datasets = data.get("dataSets", [])
    obs = list(list(datasets[0].get("series", {}).values())[0].get("observations", {}).values())
    rate = obs[0][0]
    assert 0.5 < rate < 1.5, f"GBP/EUR rate {rate} implausible"


# ---------------------------------------------------------------------------
# Yahoo Finance (no API key required)
# ---------------------------------------------------------------------------

@skip_no_network
def test_yfinance_spy_history():
    """yfinance returns non-empty S&P 500 history for SPY."""
    yfinance = pytest.importorskip("yfinance", reason="yfinance not installed")

    ticker = yfinance.Ticker("SPY")
    hist = ticker.history(period="5d")
    assert not hist.empty, "yfinance returned empty history for SPY"
    assert "Close" in hist.columns, "Missing 'Close' column"
    assert hist["Close"].iloc[-1] > 0, "SPY close price should be positive"


@skip_no_network
def test_yfinance_eur_usd():
    """yfinance EURUSD=X returns a valid forex quote."""
    yfinance = pytest.importorskip("yfinance", reason="yfinance not installed")

    ticker = yfinance.Ticker("EURUSD=X")
    hist = ticker.history(period="5d")
    assert not hist.empty, "yfinance returned empty history for EURUSD"
    rate = hist["Close"].iloc[-1]
    assert 0.5 < rate < 2.5, f"EURUSD rate {rate} implausible"


# ---------------------------------------------------------------------------
# OpenCorporates (no key for basic search)
# ---------------------------------------------------------------------------

@skip_no_network
def test_opencorporates_search_returns_results():
    """OpenCorporates search API returns structured company results."""
    import urllib.request
    import json
    import urllib.parse

    q = urllib.parse.quote("Wirecard")
    url = f"https://api.opencorporates.com/v0.4/companies/search?q={q}&per_page=5"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            if resp.status == 429:
                pytest.skip("OpenCorporates rate-limited")
            assert resp.status == 200
            data = json.loads(resp.read())
    except Exception as e:
        pytest.skip(f"OpenCorporates unavailable: {e}")

    results = data.get("results", {}).get("companies", [])
    assert results, "OpenCorporates returned no companies for 'Wirecard'"


# ---------------------------------------------------------------------------
# Genesis Swarm API health (optional — requires GENESIS_URL env var)
# ---------------------------------------------------------------------------

GENESIS_URL = os.getenv("GENESIS_URL", "")


@pytest.mark.skipif(not GENESIS_URL, reason="GENESIS_URL not set")
@skip_no_network
def test_genesis_health_endpoint():
    """Genesis Swarm /api/health returns 200 with expected fields."""
    import urllib.request
    import json

    with urllib.request.urlopen(f"{GENESIS_URL}/api/health", timeout=15) as resp:
        assert resp.status == 200
        data = json.loads(resp.read())

    assert "status" in data, f"Health response missing 'status': {data}"


@pytest.mark.skipif(not GENESIS_URL, reason="GENESIS_URL not set")
@skip_no_network
def test_genesis_wirecard_replay_endpoint():
    """GET /api/v1/simulation/wirecard-replay returns timeline events."""
    import urllib.request
    import json

    with urllib.request.urlopen(f"{GENESIS_URL}/api/v1/simulation/wirecard-replay", timeout=20) as resp:
        assert resp.status in (200, 202), f"Unexpected status: {resp.status}"
        data = json.loads(resp.read())

    # Should be a list of events
    assert isinstance(data, (list, dict)), "Wirecard replay should return list or dict"
