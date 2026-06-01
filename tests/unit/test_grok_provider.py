"""Unit tests for the Grok (xAI) LLM provider in HybridLLMClient."""

from __future__ import annotations

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx

from genesis_swarm.swarm.llm import (
    HybridLLMClient,
    LLMProvider,
    LLMRequest,
    _GrokClient,
)


class TestGrokClientDefaults:
    def test_provider_label(self):
        c = _GrokClient(api_key="sk-test")
        assert c.provider == LLMProvider.GROK

    def test_base_url(self):
        c = _GrokClient(api_key="sk-test")
        assert c._base_url == "https://api.x.ai/v1"

    def test_default_model(self):
        c = _GrokClient(api_key="sk-test")
        assert c._default_model == "grok-3-fast"

    def test_custom_model(self):
        c = _GrokClient(api_key="sk-test", model="grok-3")
        assert c._default_model == "grok-3"

    def test_auth_header(self):
        c = _GrokClient(api_key="sk-xai-abc123")
        http = c._lazy_http()
        assert http.headers["authorization"] == "Bearer sk-xai-abc123"


class TestFromEnvGrokPriority:
    def test_xai_key_selects_grok_as_primary(self, monkeypatch):
        monkeypatch.setenv("XAI_API_KEY", "sk-xai-test")
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        client = HybridLLMClient.from_env()
        assert client._primary.provider == LLMProvider.GROK
        assert isinstance(client._primary, _GrokClient)

    def test_xai_key_overrides_anthropic(self, monkeypatch):
        monkeypatch.setenv("XAI_API_KEY", "sk-xai-test")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        client = HybridLLMClient.from_env()
        assert client._primary.provider == LLMProvider.GROK

    def test_xai_key_overrides_openai_compat(self, monkeypatch):
        monkeypatch.setenv("XAI_API_KEY", "sk-xai-test")
        monkeypatch.setenv("OPENAI_API_KEY", "sk-oai-test")
        monkeypatch.setenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        client = HybridLLMClient.from_env()
        assert client._primary.provider == LLMProvider.GROK

    def test_no_xai_key_falls_back_to_anthropic(self, monkeypatch):
        monkeypatch.delenv("XAI_API_KEY", raising=False)
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        client = HybridLLMClient.from_env()
        assert client._primary.provider == LLMProvider.ANTHROPIC

    def test_grok_model_env_var(self, monkeypatch):
        monkeypatch.setenv("XAI_API_KEY", "sk-xai-test")
        monkeypatch.setenv("GROK_MODEL", "grok-3")
        client = HybridLLMClient.from_env()
        assert client._primary._default_model == "grok-3"

    def test_grok_in_circuit_breakers(self, monkeypatch):
        monkeypatch.setenv("XAI_API_KEY", "sk-xai-test")
        client = HybridLLMClient.from_env()
        assert LLMProvider.GROK in client._circuit_breakers


class TestGrokComplete:
    @pytest.mark.asyncio
    async def test_successful_completion(self):
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "AIFMD breach detected."}, "finish_reason": "stop"}],
            "model": "grok-3-fast",
            "usage": {"prompt_tokens": 12, "completion_tokens": 5, "total_tokens": 17},
        }

        client = _GrokClient(api_key="sk-xai-test")
        with patch.object(client._lazy_http(), "post", new_callable=AsyncMock, return_value=mock_response):
            result = await client.complete(
                LLMRequest.from_prompt("Analyse NAV break.", model="grok-3-fast")
            )

        assert result.content == "AIFMD breach detected."
        assert result.provider == LLMProvider.GROK
        assert result.model == "grok-3-fast"
        assert result.usage.total_tokens == 17

    @pytest.mark.asyncio
    async def test_provider_label_preserved_after_complete(self):
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
            "model": "grok-3-fast",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        }

        client = _GrokClient(api_key="sk-xai-test")
        with patch.object(client._lazy_http(), "post", new_callable=AsyncMock, return_value=mock_response):
            result = await client.complete(LLMRequest.from_prompt("ping"))

        # model_copy override must keep GROK, not fall back to OPENAI_COMPAT
        assert result.provider == LLMProvider.GROK
