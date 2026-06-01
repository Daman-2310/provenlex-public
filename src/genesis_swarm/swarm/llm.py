"""
Hybrid Local/Cloud LLM client with circuit-breaker fallback — Pillar 4.

Wraps cloud API gateways (Anthropic, any OpenAI-compatible endpoint) with a
tenacity retry layer and a per-provider circuit breaker.  On CB-open or
exhausted retries the client falls through to a local fallback chain (Ollama,
then vLLM) without touching the agent's FSM state or conversation memory.

Provider selection (from_env)
------------------------------
Primary (checked in order — first match wins):
  XAI_API_KEY                      → _GrokClient (grok-3-fast, https://api.x.ai/v1)
  ANTHROPIC_API_KEY                → _AnthropicClient
  OPENAI_API_KEY + OPENAI_BASE_URL → _OpenAICompatClient

Fallbacks (in priority order):
  OLLAMA_BASE_URL (default http://localhost:11434)  → _OllamaClient
  VLLM_BASE_URL   (optional)                        → _VLLMClient

Retry & circuit breaker
-----------------------
- tenacity: 429 / timeout → exponential-backoff-jitter, up to max_retries
- CircuitBreaker per provider: trips OPEN on cb_failure_threshold consecutive
  failures; probes HALF_OPEN after cb_recovery_timeout seconds

State preservation
------------------
``complete_with_state()`` threads ``agent_state`` and ``memory`` through the
call unchanged, guaranteeing the FSM path continues from the exact same
position regardless of which provider served the request.

Usage
-----
    client = HybridLLMClient.from_env()
    response = await client.complete(
        LLMRequest.from_prompt("Analyse this NAV break...", max_tokens=2048)
    )
    print(response.content, "— provider:", response.provider.value)
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from enum import Enum
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field
from tenacity import (
    AsyncRetrying,
    RetryError,
    before_sleep_log,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from ..shared.circuit_breaker import CircuitBreaker, CircuitBreakerOpen

_log = logging.getLogger(__name__)


# ── Provider enumeration ──────────────────────────────────────────────────────


class LLMProvider(str, Enum):
    ANTHROPIC = "anthropic"
    GROK = "grok"
    OPENAI_COMPAT = "openai_compat"
    OLLAMA = "ollama"
    VLLM = "vllm"


# ── Request / Response models ─────────────────────────────────────────────────


class LLMMessage(BaseModel):
    model_config = ConfigDict(frozen=True)

    role: str
    content: str


class LLMRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    messages: tuple[LLMMessage, ...]
    model: str = "claude-opus-4-7"
    max_tokens: int = Field(ge=1, le=200_000, default=2048)
    temperature: float = Field(ge=0.0, le=2.0, default=0.7)
    system: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_prompt(
        cls,
        prompt: str,
        *,
        model: str = "claude-opus-4-7",
        max_tokens: int = 2048,
        system: str | None = None,
    ) -> "LLMRequest":
        return cls(
            messages=(LLMMessage(role="user", content=prompt),),
            model=model,
            max_tokens=max_tokens,
            system=system,
        )


class LLMUsage(BaseModel):
    model_config = ConfigDict(frozen=True)

    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class LLMResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    content: str
    provider: LLMProvider
    model: str
    usage: LLMUsage = Field(default_factory=LLMUsage)
    latency_ms: float = 0.0
    fallback_used: bool = False
    finish_reason: str = "stop"


# ── Domain exceptions ─────────────────────────────────────────────────────────


class LLMRateLimitError(Exception):
    """HTTP 429 from a cloud provider — signals tenacity to back off and retry."""


class LLMTimeoutError(Exception):
    """Connection or read timeout — signals tenacity to back off and retry."""


class LLMUnavailableError(Exception):
    """All providers (primary + fallbacks) are exhausted."""


# ── Anthropic adapter ─────────────────────────────────────────────────────────


class _AnthropicClient:
    provider = LLMProvider.ANTHROPIC

    def __init__(self, api_key: str, *, timeout_s: float = 60.0) -> None:
        self._api_key = api_key
        self._timeout = timeout_s
        self._client: Any = None

    def _lazy_client(self) -> Any:
        if self._client is None:
            import anthropic  # type: ignore[import-untyped]

            self._client = anthropic.AsyncAnthropic(
                api_key=self._api_key,
                timeout=self._timeout,
            )
        return self._client

    async def complete(self, request: LLMRequest) -> LLMResponse:
        import anthropic  # type: ignore[import-untyped]

        start = time.perf_counter()
        try:
            kwargs: dict[str, Any] = {
                "model": request.model,
                "max_tokens": request.max_tokens,
                "messages": [
                    {"role": m.role, "content": m.content} for m in request.messages
                ],
            }
            if request.system:
                kwargs["system"] = request.system
            if request.temperature != 1.0:
                kwargs["temperature"] = request.temperature

            msg = await self._lazy_client().messages.create(**kwargs)
            elapsed_ms = (time.perf_counter() - start) * 1_000

            content = ""
            if msg.content:
                first = msg.content[0]
                content = first.text if hasattr(first, "text") else str(first)

            return LLMResponse(
                content=content,
                provider=LLMProvider.ANTHROPIC,
                model=request.model,
                usage=LLMUsage(
                    input_tokens=msg.usage.input_tokens,
                    output_tokens=msg.usage.output_tokens,
                    total_tokens=msg.usage.input_tokens + msg.usage.output_tokens,
                ),
                latency_ms=elapsed_ms,
                finish_reason=msg.stop_reason or "stop",
            )

        except anthropic.RateLimitError as exc:
            raise LLMRateLimitError(f"Anthropic rate limit: {exc}") from exc
        except (anthropic.APIConnectionError, httpx.ConnectTimeout) as exc:
            raise LLMTimeoutError(f"Anthropic connection error: {exc}") from exc
        except anthropic.APIStatusError as exc:
            if exc.status_code == 429:
                raise LLMRateLimitError(f"Anthropic 429: {exc}") from exc
            raise



# ── OpenAI-compatible adapter ─────────────────────────────────────────────────


class _OpenAICompatClient:
    """Adapter for any OpenAI-compatible /chat/completions endpoint."""

    provider = LLMProvider.OPENAI_COMPAT

    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        default_model: str = "gpt-4o",
        timeout_s: float = 60.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._default_model = default_model
        self._timeout = timeout_s
        self._http: httpx.AsyncClient | None = None

    def _lazy_http(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(
                base_url=self._base_url,
                headers={"Authorization": f"Bearer {self._api_key}"},
                timeout=self._timeout,
            )
        return self._http

    async def complete(self, request: LLMRequest) -> LLMResponse:
        start = time.perf_counter()
        model = (
            self._default_model
            if request.model == "claude-opus-4-7"
            else request.model
        )
        messages: list[dict[str, str]] = []
        if request.system:
            messages.append({"role": "system", "content": request.system})
        messages.extend(
            {"role": m.role, "content": m.content} for m in request.messages
        )
        body: dict[str, Any] = {
            "model": model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "messages": messages,
        }
        try:
            resp = await self._lazy_http().post("/chat/completions", json=body)
        except (httpx.ConnectTimeout, httpx.ReadTimeout) as exc:
            raise LLMTimeoutError(f"OpenAI-compat timeout: {exc}") from exc

        if resp.status_code == 429:
            raise LLMRateLimitError(f"OpenAI-compat rate limit: {resp.text}")
        resp.raise_for_status()

        data = resp.json()
        elapsed_ms = (time.perf_counter() - start) * 1_000
        choice = data["choices"][0]
        usage_raw = data.get("usage", {})

        return LLMResponse(
            content=choice["message"]["content"],
            provider=LLMProvider.OPENAI_COMPAT,
            model=data.get("model", self._default_model),
            usage=LLMUsage(
                input_tokens=usage_raw.get("prompt_tokens", 0),
                output_tokens=usage_raw.get("completion_tokens", 0),
                total_tokens=usage_raw.get("total_tokens", 0),
            ),
            latency_ms=elapsed_ms,
            finish_reason=choice.get("finish_reason", "stop"),
        )


# ── Grok (xAI) adapter ───────────────────────────────────────────────────────


class _GrokClient(_OpenAICompatClient):
    """
    xAI Grok adapter.

    Grok exposes a fully OpenAI-compatible /v1 endpoint, so this adapter
    subclasses ``_OpenAICompatClient`` and overrides the provider label and
    the default base URL.

    Environment:
        XAI_API_KEY   — required
        GROK_MODEL    — default grok-3-fast (fastest Grok 3 variant)
    """

    provider = LLMProvider.GROK
    _BASE_URL = "https://api.x.ai/v1"
    _DEFAULT_MODEL = "grok-3-fast"

    def __init__(
        self,
        api_key: str,
        *,
        model: str = _DEFAULT_MODEL,
        timeout_s: float = 60.0,
    ) -> None:
        super().__init__(
            base_url=self._BASE_URL,
            api_key=api_key,
            default_model=model,
            timeout_s=timeout_s,
        )
        self.provider = LLMProvider.GROK  # type: ignore[misc]

    async def complete(self, request: LLMRequest) -> LLMResponse:
        result = await super().complete(request)
        return result.model_copy(update={"provider": LLMProvider.GROK})


# ── Ollama adapter ────────────────────────────────────────────────────────────


class _OllamaClient:
    """Local Ollama server adapter (/api/chat endpoint)."""

    provider = LLMProvider.OLLAMA

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        *,
        default_model: str = "llama3",
        timeout_s: float = 120.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._default_model = default_model
        self._timeout = timeout_s
        self._http: httpx.AsyncClient | None = None

    def _lazy_http(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=self._timeout,
            )
        return self._http

    async def complete(self, request: LLMRequest) -> LLMResponse:
        start = time.perf_counter()
        messages: list[dict[str, str]] = []
        if request.system:
            messages.append({"role": "system", "content": request.system})
        messages.extend(
            {"role": m.role, "content": m.content} for m in request.messages
        )
        body: dict[str, Any] = {
            "model": self._default_model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": request.temperature,
                "num_predict": request.max_tokens,
            },
        }
        try:
            resp = await self._lazy_http().post("/api/chat", json=body)
        except (httpx.ConnectTimeout, httpx.ConnectError, httpx.ReadTimeout) as exc:
            raise LLMTimeoutError(f"Ollama connection error: {exc}") from exc

        resp.raise_for_status()
        data = resp.json()
        elapsed_ms = (time.perf_counter() - start) * 1_000
        content = data.get("message", {}).get("content", "")
        prompt_eval = data.get("prompt_eval_count", 0)
        eval_count = data.get("eval_count", 0)

        return LLMResponse(
            content=content,
            provider=LLMProvider.OLLAMA,
            model=self._default_model,
            usage=LLMUsage(
                input_tokens=prompt_eval,
                output_tokens=eval_count,
                total_tokens=prompt_eval + eval_count,
            ),
            latency_ms=elapsed_ms,
            fallback_used=True,
        )


# ── vLLM adapter ──────────────────────────────────────────────────────────────


class _VLLMClient(_OpenAICompatClient):
    """
    vLLM local server adapter.

    vLLM exposes an OpenAI-compatible /v1 endpoint, so this adapter
    reuses ``_OpenAICompatClient`` with a local base_url and overrides
    the provider label in the response.
    """

    provider = LLMProvider.VLLM

    def __init__(
        self,
        base_url: str = "http://localhost:8000/v1",
        *,
        default_model: str = "mistralai/Mistral-7B-Instruct-v0.2",
        timeout_s: float = 120.0,
    ) -> None:
        super().__init__(
            base_url=base_url,
            api_key="EMPTY",  # vLLM does not require a real API key
            default_model=default_model,
            timeout_s=timeout_s,
        )
        self.provider = LLMProvider.VLLM  # type: ignore[misc]

    async def complete(self, request: LLMRequest) -> LLMResponse:
        result = await super().complete(request)
        return result.model_copy(
            update={"provider": LLMProvider.VLLM, "fallback_used": True}
        )


# ── Provider union ────────────────────────────────────────────────────────────

_AnyProvider = _AnthropicClient | _GrokClient | _OpenAICompatClient | _OllamaClient | _VLLMClient


# ── HybridLLMClient ───────────────────────────────────────────────────────────


class HybridLLMClient:
    """
    High-availability LLM client with transparent cloud-to-local fallback.

    Execution strategy for each ``complete()`` call:
    1. Try *primary* with full tenacity retry on 429 / timeout.
    2. If primary CB is OPEN or all retries exhaust → try each fallback once.
    3. If every provider fails → raise ``LLMUnavailableError``.

    Circuit breakers are per-provider and shared across all requests.
    """

    def __init__(
        self,
        primary: _AnyProvider,
        fallbacks: list[_AnyProvider] | None = None,
        *,
        max_retries: int = 3,
        cb_failure_threshold: int = 5,
        cb_recovery_timeout: float = 60.0,
    ) -> None:
        self._primary = primary
        self._fallbacks: list[_AnyProvider] = fallbacks or []
        self._max_retries = max_retries
        all_clients: list[_AnyProvider] = [primary, *(fallbacks or [])]
        self._circuit_breakers: dict[LLMProvider, CircuitBreaker] = {
            c.provider: CircuitBreaker(
                name=c.provider.value,
                failure_threshold=cb_failure_threshold,
                recovery_timeout=cb_recovery_timeout,
            )
            for c in all_clients
        }

    @classmethod
    def from_env(cls) -> "HybridLLMClient":
        """
        Construct from environment variables.

        Primary (first match wins):
          GROQ_API_KEY                     → Groq (llama-3.3-70b-versatile, free tier)
          XAI_API_KEY                      → Grok (grok-3-fast, api.x.ai/v1)
          ANTHROPIC_API_KEY                → Anthropic Claude
          OPENAI_API_KEY + OPENAI_BASE_URL → OpenAI-compat endpoint

        Optional:
          GROQ_MODEL   override Groq model (default llama-3.3-70b-versatile)
          GROK_MODEL   override Grok model (default grok-3-fast)

        Fallback: OLLAMA_BASE_URL (default http://localhost:11434)
                  VLLM_BASE_URL   (optional; used only if set)
        """
        groq_key = os.getenv("GROQ_API_KEY", "")
        xai_key = os.getenv("XAI_API_KEY", "")
        openai_key = os.getenv("OPENAI_API_KEY", "")
        openai_url = os.getenv("OPENAI_BASE_URL", "")

        if groq_key:
            primary: _AnyProvider = _OpenAICompatClient(
                base_url="https://api.groq.com/openai/v1",
                api_key=groq_key,
                default_model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            )
        elif xai_key:
            primary = _GrokClient(
                api_key=xai_key,
                model=os.getenv("GROK_MODEL", _GrokClient._DEFAULT_MODEL),
            )
        elif openai_key and openai_url:
            primary = _OpenAICompatClient(
                base_url=openai_url, api_key=openai_key
            )
        else:
            primary = _AnthropicClient(
                api_key=os.getenv("ANTHROPIC_API_KEY", "MISSING")
            )

        fallbacks: list[_AnyProvider] = [
            _OllamaClient(
                base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
                default_model=os.getenv("OLLAMA_MODEL", "llama3"),
            )
        ]
        vllm_url = os.getenv("VLLM_BASE_URL", "")
        if vllm_url:
            fallbacks.append(
                _VLLMClient(
                    base_url=vllm_url,
                    default_model=os.getenv(
                        "VLLM_MODEL", "mistralai/Mistral-7B-Instruct-v0.2"
                    ),
                )
            )
        return cls(primary=primary, fallbacks=fallbacks)

    async def _try_provider(
        self,
        provider_client: _AnyProvider,
        request: LLMRequest,
        *,
        with_retry: bool,
    ) -> LLMResponse:
        """
        Attempt a single provider with an optional tenacity retry wrapper.

        The call is always wrapped in the provider's circuit breaker.
        When *with_retry* is True, 429 and timeout errors trigger
        exponential-backoff-jitter retries up to ``max_retries``.
        """
        cb = self._circuit_breakers[provider_client.provider]

        async def _call() -> LLMResponse | None:
            return await cb.call(lambda: provider_client.complete(request))

        if not with_retry:
            result = await _call()
            if result is None:
                raise CircuitBreakerOpen(
                    f"Circuit breaker OPEN for {provider_client.provider.value}"
                )
            return result

        try:
            async for attempt in AsyncRetrying(
                retry=retry_if_exception_type((LLMRateLimitError, LLMTimeoutError)),
                wait=wait_exponential_jitter(initial=0.5, max=30.0, jitter=1.0),
                stop=stop_after_attempt(self._max_retries),
                before_sleep=before_sleep_log(_log, logging.WARNING),
                reraise=True,
            ):
                with attempt:
                    result = await _call()
                    if result is None:
                        raise CircuitBreakerOpen(
                            f"Circuit breaker OPEN for {provider_client.provider.value}"
                        )
                    return result
        except RetryError as exc:
            raise LLMUnavailableError(
                f"{provider_client.provider.value} exhausted all {self._max_retries} retries"
            ) from exc

        raise LLMUnavailableError("Unreachable")  # pragma: no cover

    async def complete(self, request: LLMRequest) -> LLMResponse:
        """
        Complete *request* against the best available provider.

        Returns as soon as any provider succeeds.  Fallbacks are tried only
        when the primary circuit breaker is open or all primary retries fail.
        The caller's FSM state and memory are never modified — see
        ``complete_with_state()`` for explicit state threading.
        """
        primary_exc: Exception | None = None
        try:
            response = await self._try_provider(
                self._primary, request, with_retry=True
            )
            _log.debug(
                "llm_primary_success",
                extra={
                    "provider": self._primary.provider.value,
                    "latency_ms": round(response.latency_ms, 1),
                    "tokens": response.usage.total_tokens,
                },
            )
            return response
        except (LLMUnavailableError, CircuitBreakerOpen, Exception) as exc:
            primary_exc = exc
            _log.warning(
                "llm_primary_failed",
                extra={
                    "provider": self._primary.provider.value,
                    "error": str(exc),
                    "fallbacks_available": len(self._fallbacks),
                },
            )

        last_exc: Exception = primary_exc  # type: ignore[assignment]
        for fallback in self._fallbacks:
            try:
                response = await self._try_provider(fallback, request, with_retry=False)
                _log.info(
                    "llm_fallback_success",
                    extra={
                        "provider": fallback.provider.value,
                        "latency_ms": round(response.latency_ms, 1),
                    },
                )
                return response.model_copy(update={"fallback_used": True})
            except Exception as fallback_exc:
                _log.warning(
                    "llm_fallback_failed",
                    extra={
                        "provider": fallback.provider.value,
                        "error": str(fallback_exc),
                    },
                )
                last_exc = fallback_exc

        raise LLMUnavailableError(
            f"All LLM providers exhausted. Last error: {last_exc}"
        ) from last_exc

    async def complete_with_state(
        self,
        request: LLMRequest,
        *,
        agent_state: Any,
        memory: dict[str, Any],
    ) -> tuple[LLMResponse, Any, dict[str, Any]]:
        """
        Thread an agent's FSM state and memory through a completion unchanged.

        Returns ``(response, agent_state, memory)`` — *agent_state* and
        *memory* are passed through exactly as received regardless of which
        provider serves the request, so the agent FSM path is never disrupted
        by a cloud → local fallback transition.
        """
        response = await self.complete(request)
        return response, agent_state, memory

    def circuit_breaker_status(self) -> dict[str, str]:
        """Return ``{provider_name: CB_state}`` for observability endpoints."""
        return {
            provider.value: cb.state.value
            for provider, cb in self._circuit_breakers.items()
        }

    async def health_check(self) -> dict[str, bool]:
        """
        Probe each provider with a 1-token request.

        Does NOT update circuit breaker counters.
        Returns ``{provider_name: is_healthy}`` for health endpoints.
        """
        ping = LLMRequest.from_prompt("ping", max_tokens=1)
        results: dict[str, bool] = {}
        all_clients: list[_AnyProvider] = [self._primary, *self._fallbacks]
        for client in all_clients:
            try:
                await asyncio.wait_for(client.complete(ping), timeout=5.0)
                results[client.provider.value] = True
            except Exception:
                results[client.provider.value] = False
        return results
