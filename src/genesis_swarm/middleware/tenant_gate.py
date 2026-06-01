"""
TenantGateMiddleware — FastAPI ASGI middleware for multi-tenant quota enforcement.

For every inbound request the middleware:
    1. Resolves the tenant_id from (in priority order):
           X-Tenant-ID header         machine-to-machine calls
           Authorization: Bearer JWT  browser / SDK clients
           "default"                  fallback for un-authenticated paths
    2. Loads the tenant's BillingState from Redis (single GET).
    3. Checks daily and per-minute quota without incrementing counters.
    4. Rejects over-quota requests with HTTP 429 and X-RateLimit headers.
    5. Injects tenant_id into both request.state and a ContextVar for use
       anywhere in the request's coroutine stack.
    6. After the downstream handler returns, atomically increments usage
       counters in a fire-and-forget pipeline.

Exempt paths (no tenant check, no usage increment)
---------------------------------------------------
/api/health  /api/auth/login  /api/auth/refresh  /api/auth/oidc
/api/billing/webhook  /metrics  /docs  /redoc  /openapi.json  /
"""

from __future__ import annotations

import logging
import time
from contextvars import ContextVar
from typing import Awaitable, Callable

from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from ..billing.tenant_billing import BillingState, TenantBillingRegistry

log = logging.getLogger(__name__)

# Public context variable — read via current_tenant_id.get() anywhere in a request
current_tenant_id: ContextVar[str] = ContextVar("current_tenant_id", default="default")

_JWT_ALG = "HS256"

_EXEMPT_PREFIXES: frozenset[str] = frozenset({
    "/api/health",
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/oidc",
    "/api/billing/webhook",
    "/metrics",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/",
})

_CallNext = Callable[[Request], Awaitable[Response]]


def _is_exempt(path: str) -> bool:
    return any(path.startswith(p) for p in _EXEMPT_PREFIXES)


def _tenant_from_jwt(token: str, jwt_secret: str) -> str | None:
    """Decode an HS256 JWT and return the tenant_id claim, or None on failure."""
    try:
        payload = jwt.decode(token, jwt_secret, algorithms=[_JWT_ALG])
        return payload.get("tenant_id") or None
    except JWTError:
        return None


def _resolve_tenant_id(request: Request, jwt_secret: str) -> str:
    """Extract tenant_id from headers, falling back through JWT to 'default'."""
    from_header: str | None = request.headers.get("X-Tenant-ID")
    if from_header:
        return from_header

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        from_jwt = _tenant_from_jwt(auth[7:], jwt_secret)
        if from_jwt:
            return from_jwt

    return "default"


def _build_rate_limit_response(
    tenant_id: str,
    state: BillingState,
    reason: str,
) -> JSONResponse:
    """Build the HTTP 429 response returned to over-quota callers."""
    lim = state.effective_limits()
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": reason,
            "tenant_id": tenant_id,
            "tier": state.effective_tier(),
            "daily_limit": lim.daily_api_calls,
            "rpm_limit": lim.rpm,
            "upgrade_url": "https://genesisswarm.io/pricing",
        },
        headers={
            "Retry-After": "60",
            "X-Tenant-ID": tenant_id,
            "X-RateLimit-Tier": str(state.effective_tier()),
            "X-RateLimit-Daily-Max": str(lim.daily_api_calls),
            "X-RateLimit-RPM-Max": str(lim.rpm),
        },
    )


def _add_observability_headers(
    response: Response,
    *,
    tenant_id: str,
    state: BillingState,
    daily: int,
    rpm: int,
    latency_ms: float,
) -> None:
    """Inject X-RateLimit and X-Tenant-ID headers into the outbound response."""
    response.headers["X-Tenant-ID"] = tenant_id
    response.headers["X-RateLimit-Tier"] = str(state.effective_tier())
    response.headers["X-RateLimit-Daily-Used"] = str(daily)
    response.headers["X-RateLimit-RPM-Used"] = str(rpm)
    response.headers["X-Response-Time-Ms"] = str(latency_ms)


class TenantGateMiddleware(BaseHTTPMiddleware):
    """
    ASGI middleware enforcing per-tenant billing quotas on every request.

    Parameters
    ----------
    app:
        The inner ASGI application (FastAPI).
    registry:
        A ``TenantBillingRegistry`` backed by a live Redis connection.
    jwt_secret:
        The HS256 secret used to sign access JWTs (GENESIS_JWT_SECRET).
    """

    def __init__(
        self,
        app: ASGIApp,
        registry: TenantBillingRegistry,
        jwt_secret: str,
    ) -> None:
        super().__init__(app)
        self._registry = registry
        self._jwt_secret = jwt_secret

    async def dispatch(self, request: Request, call_next: _CallNext) -> Response:
        """Gate, measure, and annotate every non-exempt inbound request."""
        if _is_exempt(request.url.path):
            return await call_next(request)

        tenant_id = _resolve_tenant_id(request, self._jwt_secret)
        ctx_token = current_tenant_id.set(tenant_id)
        request.state.tenant_id = tenant_id

        try:
            return await self._gate_and_dispatch(request, call_next, tenant_id)
        finally:
            current_tenant_id.reset(ctx_token)

    async def _gate_and_dispatch(
        self,
        request: Request,
        call_next: _CallNext,
        tenant_id: str,
    ) -> Response:
        """Load billing state, enforce quota, dispatch, and record usage."""
        state = await self._registry.get_state(tenant_id)

        allowed, reason = await self._registry.check_quota(tenant_id, state)
        if not allowed:
            return _build_rate_limit_response(tenant_id, state, reason)

        t0 = time.perf_counter()
        response = await call_next(request)
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)

        daily, rpm = await self._record_usage(tenant_id)

        _add_observability_headers(
            response,
            tenant_id=tenant_id,
            state=state,
            daily=daily,
            rpm=rpm,
            latency_ms=latency_ms,
        )
        return response

    async def _record_usage(self, tenant_id: str) -> tuple[int, int]:
        """Increment usage counters; swallow errors to never block the response."""
        try:
            return await self._registry.record_api_call(tenant_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("[TenantGate] Usage counter error for %s: %s", tenant_id, exc)
            return 0, 0
