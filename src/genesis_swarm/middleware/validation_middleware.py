"""
IngressValidationMiddleware — zero-trust ASGI body validation layer.

This middleware sits *in front of* ``TenantGateMiddleware`` and FastAPI's route
handlers.  Its sole responsibility is to intercept every mutating HTTP request
(``POST``, ``PUT``, ``PATCH``), validate the body against a Pydantic v2 contract
from ``ingress_contracts.ROUTE_SCHEMA_MAP``, and hard-reject malformed payloads
with ``HTTP 422 Unprocessable Entity`` *before* they can reach any internal
queue, consensus engine, or database.

Threat model
------------
1. **Over-sized bodies** — bodies larger than ``_MAX_BODY_BYTES`` (256 KiB) are
   drained and rejected without buffering the full payload.
2. **Wrong Content-Type** — non-``application/json`` requests to validated routes
   are rejected immediately.
3. **Malformed JSON** — ``json.JSONDecodeError`` triggers 422 before Pydantic.
4. **Schema violations** — extra fields, out-of-range numbers, invalid patterns,
   float financial amounts — all raise Pydantic ``ValidationError`` → 422.
5. **Body re-injection** — after validation succeeds the buffered body is
   re-wrapped in a synthetic ``receive`` callable so downstream handlers see
   an unmodified request stream.

Architecture: pure ASGI callable
---------------------------------
This is implemented as a raw ASGI callable (``__call__(scope, receive, send)``)
rather than ``starlette.middleware.base.BaseHTTPMiddleware``.  The base class
reads the body into a ``Response`` wrapper which adds latency and prevents
streaming; the raw ASGI approach reads only once, rewinds, and passes through
without materialising a full ``Response`` object.

Usage
-----
::

    from genesis_swarm.middleware.validation_middleware import IngressValidationMiddleware
    from genesis_swarm.middleware.ingress_contracts import ROUTE_SCHEMA_MAP

    app.add_middleware(IngressValidationMiddleware, schema_map=ROUTE_SCHEMA_MAP)

    # Or with a custom body limit:
    app.add_middleware(
        IngressValidationMiddleware,
        schema_map=ROUTE_SCHEMA_MAP,
        max_body_bytes=128 * 1024,
    )
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Final

from pydantic import ValidationError
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .ingress_contracts import ROUTE_SCHEMA_MAP, ValidationSchemaType

__all__ = ["IngressValidationMiddleware"]

_log = logging.getLogger(__name__)

# ── Module-level constants ────────────────────────────────────────────────────

_MAX_BODY_BYTES: Final[int] = 256 * 1024  # 256 KiB
_MUTABLE_METHODS: Final[frozenset[str]] = frozenset({"POST", "PUT", "PATCH"})
_JSON_CONTENT_TYPES: Final[frozenset[str]] = frozenset({
    "application/json",
    "application/json; charset=utf-8",
    "application/json;charset=utf-8",
})

# Pre-serialised static response bodies (avoid re-encoding on every rejection)
_BODY_TOO_LARGE: Final[bytes] = json.dumps({
    "error": "payload_too_large",
    "message": (
        f"Request body exceeds the {_MAX_BODY_BYTES // 1024} KiB ingress limit. "
        "Reduce payload size or use the batch endpoint with pagination."
    ),
    "status_code": 413,
}).encode()

_CONTENT_TYPE_INVALID: Final[bytes] = json.dumps({
    "error": "unsupported_media_type",
    "message": (
        "Content-Type must be 'application/json'. "
        "Binary, form-encoded, or multipart payloads are not accepted on this endpoint."
    ),
    "status_code": 415,
}).encode()

_JSON_PARSE_ERROR_PREFIX: Final[str] = "Request body is not valid JSON: "


# ── Helpers ───────────────────────────────────────────────────────────────────


def _header_value(headers: list[tuple[bytes, bytes]], name: bytes) -> str:
    """
    Extract the first matching header value from a raw ASGI header list.

    Args:
        headers: List of (header_name_bytes, header_value_bytes) pairs from
            the ASGI ``scope["headers"]``.
        name: Lowercase header name as bytes (e.g., ``b"content-type"``).

    Returns:
        The decoded header value, or an empty string if not found.
    """
    for k, v in headers:
        if k == name:
            return v.decode("latin-1", errors="replace")
    return ""


def _longest_prefix_match(
    method: str,
    path: str,
    schema_map: dict[tuple[str, str], ValidationSchemaType],
) -> ValidationSchemaType | None:
    """
    Find the schema for the longest matching ``(method, path_prefix)`` entry.

    Exact matches take priority over prefix matches.  Among prefix matches,
    the longest prefix wins so that ``/api/v1/transactions/batch`` can be
    mapped to a different schema than ``/api/v1/transactions``.

    Args:
        method: HTTP method string (e.g., ``"POST"``).
        path: Request path (e.g., ``"/api/v1/transactions"``).
        schema_map: Mapping of ``(METHOD, path_prefix)`` → Pydantic model class.

    Returns:
        The matching schema class, or ``None`` if no entry covers this route.
    """
    best_prefix_len = -1
    best_schema: ValidationSchemaType | None = None
    for (map_method, prefix), schema in schema_map.items():
        if map_method != method:
            continue
        if path == prefix:
            return schema  # exact match wins immediately
        if path.startswith(prefix) and len(prefix) > best_prefix_len:
            best_prefix_len = len(prefix)
            best_schema = schema
    return best_schema


def _build_http_response(
    status_code: int,
    body: bytes,
    *,
    extra_headers: list[tuple[bytes, bytes]] | None = None,
) -> list[Message]:
    """
    Build the minimal ASGI message sequence for an HTTP response.

    Args:
        status_code: HTTP numeric status code.
        body: Pre-serialised response body bytes.
        extra_headers: Optional list of additional ``(name, value)`` header pairs.

    Returns:
        A two-element list: ``http.response.start`` followed by
        ``http.response.body``.
    """
    headers: list[tuple[bytes, bytes]] = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body)).encode()),
        (b"x-genesis-validation", b"rejected"),
    ]
    if extra_headers:
        headers.extend(extra_headers)

    return [
        {
            "type": "http.response.start",
            "status": status_code,
            "headers": headers,
        },
        {
            "type": "http.response.body",
            "body": body,
            "more_body": False,
        },
    ]


async def _drain_and_reject(
    receive: Receive,
    send: Send,
    status_code: int,
    body: bytes,
    *,
    extra_headers: list[tuple[bytes, bytes]] | None = None,
) -> None:
    """
    Drain any remaining request body data, then send an error response.

    Draining is necessary to satisfy HTTP/1.1 keep-alive semantics: the client
    expects to finish writing its request body before reading the error response.
    We cap the drain at 1 MiB to prevent a keep-alive exploit where a client
    sends an unbounded body after the server has decided to reject it.

    Args:
        receive: The ASGI ``receive`` callable for the current request.
        send: The ASGI ``send`` callable for the current request.
        status_code: HTTP status code to send.
        body: Pre-serialised error response body.
        extra_headers: Optional additional response headers.
    """
    drained = 0
    max_drain = 1024 * 1024  # 1 MiB drain cap
    while drained < max_drain:
        msg: Message = await receive()
        drained += len(msg.get("body", b""))
        if not msg.get("more_body", False):
            break

    messages = _build_http_response(status_code, body, extra_headers=extra_headers)
    for message in messages:
        await send(message)


def _make_422_body(errors: list[dict[str, Any]], parse_error: str | None = None) -> bytes:
    """
    Serialise a structured HTTP 422 response body.

    Args:
        errors: List of Pydantic v2 error dictionaries from
            ``ValidationError.errors(include_url=False)``.
        parse_error: Optional raw JSON parse error message; if set, the
            ``errors`` list is ignored and the parse error is the sole detail.

    Returns:
        UTF-8 encoded JSON bytes suitable for use as an HTTP response body.
    """
    if parse_error is not None:
        payload = {
            "error": "invalid_json",
            "message": _JSON_PARSE_ERROR_PREFIX + parse_error,
            "status_code": 422,
            "detail": [],
        }
    else:
        sanitised = [
            {
                "type": e.get("type"),
                "loc": list(e.get("loc", [])),
                "msg": e.get("msg"),
                "input": _safe_truncate(e.get("input")),
            }
            for e in errors
        ]
        payload = {
            "error": "validation_failed",
            "message": (
                f"Request body failed schema validation "
                f"({len(sanitised)} constraint violation(s))."
            ),
            "status_code": 422,
            "detail": sanitised,
        }
    return json.dumps(payload, ensure_ascii=False, default=str).encode()


def _safe_truncate(value: Any, max_len: int = 120) -> Any:
    """
    Truncate long string values in error details to prevent response bloat.

    Args:
        value: Any Python value from a Pydantic error ``input`` field.
        max_len: Maximum number of characters before truncation.

    Returns:
        The original value, or a truncated string with an ellipsis suffix.
    """
    if isinstance(value, str) and len(value) > max_len:
        return value[:max_len] + "…"
    return value


# ── Synthetic receive factory ─────────────────────────────────────────────────


def _make_replay_receive(body: bytes) -> Receive:
    """
    Create a one-shot ASGI ``receive`` callable that replays a buffered body.

    This allows the validated-and-buffered body to be re-read by downstream
    ASGI handlers (FastAPI route handler, other middlewares) without requiring
    the request to be re-fetched from the network.

    After the single ``http.request`` message is yielded, subsequent calls
    return ``http.disconnect``, matching ASGI semantics for a fully-read body.

    Args:
        body: The complete buffered request body bytes.

    Returns:
        An ``async def`` callable compatible with the ASGI ``Receive`` type.
    """
    _sent = False

    async def _replay() -> Message:
        nonlocal _sent
        if not _sent:
            _sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    return _replay


# ── Main middleware class ─────────────────────────────────────────────────────


class IngressValidationMiddleware:
    """
    Zero-trust ASGI middleware that validates all mutating request bodies against
    Pydantic v2 schemas before they reach application logic.

    This class is a raw ASGI callable (not ``BaseHTTPMiddleware``) to avoid the
    double-buffering overhead and the ``GzipMiddleware`` incompatibility of the
    Starlette base class.

    Attributes:
        _app:        Downstream ASGI application.
        _schema_map: Mapping of ``(METHOD, path_prefix)`` → Pydantic model class.
        _max_body:   Hard body size limit in bytes.

    Args:
        app: The inner ASGI application to wrap.
        schema_map: Dict mapping ``(method, path_prefix)`` tuples to Pydantic
            ``BaseModel`` subclasses.  Defaults to ``ROUTE_SCHEMA_MAP``.
        max_body_bytes: Maximum acceptable request body size in bytes.
            Defaults to 262144 (256 KiB).

    Example::

        app.add_middleware(
            IngressValidationMiddleware,
            schema_map=ROUTE_SCHEMA_MAP,
            max_body_bytes=128 * 1024,
        )
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        schema_map: dict[tuple[str, str], ValidationSchemaType] | None = None,
        max_body_bytes: int = _MAX_BODY_BYTES,
    ) -> None:
        self._app = app
        self._schema_map: dict[tuple[str, str], ValidationSchemaType] = (
            schema_map if schema_map is not None else ROUTE_SCHEMA_MAP
        )
        self._max_body = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """
        ASGI entry point.

        Passes through non-HTTP scopes (``lifespan``, ``websocket``) and
        non-mutating methods (``GET``, ``HEAD``, ``OPTIONS``, ``DELETE``)
        without buffering.  For ``POST``/``PUT``/``PATCH`` on registered routes,
        buffers, validates, and either rejects or replays the body.

        Args:
            scope: ASGI connection scope dict.
            receive: ASGI receive callable for the current request.
            send: ASGI send callable for the current request.
        """
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        method: str = scope.get("method", "").upper()
        if method not in _MUTABLE_METHODS:
            await self._app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        schema = _longest_prefix_match(method, path, self._schema_map)
        if schema is None:
            await self._app(scope, receive, send)
            return

        await self._validate_and_forward(scope, receive, send, schema, path, method)

    async def _validate_and_forward(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
        schema: ValidationSchemaType,
        path: str,
        method: str,
    ) -> None:
        """
        Core validation pipeline: content-type → buffer → parse → validate → forward.

        Args:
            scope:   ASGI connection scope.
            receive: ASGI receive callable.
            send:    ASGI send callable.
            schema:  Pydantic model class to validate against.
            path:    Request path (for logging).
            method:  HTTP method (for logging).
        """
        headers = scope.get("headers", [])
        content_type = _header_value(headers, b"content-type").split(";")[0].strip().lower()

        if content_type not in _JSON_CONTENT_TYPES and content_type != "application/json":
            _log.warning(
                "ingress_rejected_content_type method=%s path=%s ct=%r",
                method, path, content_type,
            )
            await _drain_and_reject(receive, send, 415, _CONTENT_TYPE_INVALID)
            return

        body, oversized = await self._buffer_body(receive)
        if oversized:
            _log.warning(
                "ingress_rejected_body_size method=%s path=%s limit=%d",
                method, path, self._max_body,
            )
            await send(_build_http_response(413, _BODY_TOO_LARGE)[0])
            await send(_build_http_response(413, _BODY_TOO_LARGE)[1])
            return

        t0 = time.perf_counter()
        parsed, parse_err = self._parse_json(body)
        if parse_err is not None:
            _log.warning(
                "ingress_rejected_json_error method=%s path=%s err=%.80s",
                method, path, parse_err,
            )
            err_body = _make_422_body([], parse_error=parse_err)
            messages = _build_http_response(422, err_body)
            for msg in messages:
                await send(msg)
            return

        validation_errors = self._validate_schema(schema, parsed)
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        if validation_errors is not None:
            _log.warning(
                "ingress_rejected_schema method=%s path=%s errors=%d elapsed_ms=%.2f",
                method, path, len(validation_errors), elapsed_ms,
            )
            err_body = _make_422_body(validation_errors)
            messages = _build_http_response(422, err_body)
            for msg in messages:
                await send(msg)
            return

        _log.debug(
            "ingress_validated method=%s path=%s bytes=%d elapsed_ms=%.2f",
            method, path, len(body), elapsed_ms,
        )
        replay_receive = _make_replay_receive(body)
        await self._app(scope, replay_receive, send)

    async def _buffer_body(self, receive: Receive) -> tuple[bytes, bool]:
        """
        Read the entire request body into memory up to ``self._max_body`` bytes.

        Drains any remaining chunks after the limit is reached so the
        connection stays valid.

        Args:
            receive: ASGI receive callable.

        Returns:
            A tuple ``(body_bytes, oversized)`` where ``oversized`` is ``True``
            if the body exceeded the configured limit.  When ``oversized`` is
            ``True``, ``body_bytes`` contains only the bytes consumed up to the
            limit (partial — do not use for validation).
        """
        chunks: list[bytes] = []
        total = 0
        while True:
            message: Message = await receive()
            chunk: bytes = message.get("body", b"")
            total += len(chunk)
            if total > self._max_body:
                # Drain remaining body silently — do not buffer it
                while message.get("more_body", False):
                    message = await receive()
                return b"".join(chunks), True
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        return b"".join(chunks), False

    @staticmethod
    def _parse_json(body: bytes) -> tuple[Any, str | None]:
        """
        Attempt to parse ``body`` as UTF-8 JSON.

        Returns the parsed object on success, or ``(None, error_message)``
        on failure.  Deliberately does **not** use ``parse_float=Decimal``
        here; instead, ``ingress_contracts._parse_decimal_amount`` rejects
        ``float`` inputs as a defence-in-depth measure at the Pydantic layer.

        Args:
            body: Raw request body bytes.

        Returns:
            ``(parsed_object, None)`` on success; ``(None, error_str)`` on failure.
        """
        try:
            return json.loads(body.decode("utf-8", errors="strict")), None
        except UnicodeDecodeError as exc:
            return None, f"Body is not valid UTF-8: {exc}"
        except json.JSONDecodeError as exc:
            return None, f"line {exc.lineno} col {exc.colno}: {exc.msg}"

    @staticmethod
    def _validate_schema(
        schema: ValidationSchemaType,
        data: Any,
    ) -> list[dict[str, Any]] | None:
        """
        Validate ``data`` against ``schema``.

        Args:
            schema: A Pydantic ``BaseModel`` subclass (from ``ingress_contracts``).
            data:   The parsed JSON object (dict, list, or scalar).

        Returns:
            ``None`` if validation passes; a list of Pydantic error dicts if it
            fails.  Uses ``include_url=False`` to strip Pydantic's documentation
            URLs from error output (prevents information leakage about the
            validator version).
        """
        try:
            schema.model_validate(data)
            return None
        except ValidationError as exc:
            return exc.errors(include_url=False)


# ── FastAPI integration helper ────────────────────────────────────────────────


def attach_to_fastapi(
    app: Any,
    *,
    schema_map: dict[tuple[str, str], ValidationSchemaType] | None = None,
    max_body_bytes: int = _MAX_BODY_BYTES,
) -> None:
    """
    Convenience function: attach ``IngressValidationMiddleware`` to a FastAPI app.

    Must be called *after* all other middleware is added, since
    ``app.add_middleware`` inserts at the top of the stack (outermost layer).
    ``IngressValidationMiddleware`` should be the outermost layer so it
    intercepts requests before ``TenantGateMiddleware`` or any rate limiter.

    Args:
        app: A FastAPI application instance.
        schema_map: Optional custom schema map; defaults to ``ROUTE_SCHEMA_MAP``.
        max_body_bytes: Body size cap in bytes; defaults to 256 KiB.

    Example::

        from genesis_swarm.middleware.validation_middleware import attach_to_fastapi

        app = FastAPI()
        # ... add other middleware and routes ...
        attach_to_fastapi(app)   # always last so it's outermost
    """
    app.add_middleware(
        IngressValidationMiddleware,
        schema_map=schema_map,
        max_body_bytes=max_body_bytes,
    )
    _log.info(
        "ingress_validation_middleware_attached routes=%d max_body_kb=%d",
        len(schema_map or ROUTE_SCHEMA_MAP),
        max_body_bytes // 1024,
    )
