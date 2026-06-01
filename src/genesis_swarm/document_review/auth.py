"""
Genesis Swarm — WSS Authentication

Token sources (priority order):
  1. Authorization: Bearer <jwt>  header
  2. ?token=<jwt>                 query parameter
  3. ?api_key=<raw>               query parameter  (SHA-256 hash compared)

Environment:
  GENESIS_JWT_SECRET    HS256 signing key  (auto-generated + warned if absent)
  GENESIS_API_KEYS      comma-separated raw API keys for service accounts
  GENESIS_AUTH_DISABLED 1 / true — bypass auth (dev only, never production)
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import time

from jose import JWTError, jwt

log = logging.getLogger(__name__)

_ALGO     = "HS256"
_TTL_S    = 3_600
_ISSUER   = "genesis-swarm"


def _load_secret() -> str:
    secret = os.getenv("GENESIS_JWT_SECRET", "")
    if not secret:
        secret = secrets.token_hex(32)
        log.warning(
            "GENESIS_JWT_SECRET not set — ephemeral key in use (%s...). "
            "Tokens will not survive restarts.  Set GENESIS_JWT_SECRET in production.",
            secret[:8],
        )
    return secret


_SECRET: str = _load_secret()


def _load_api_key_hashes() -> frozenset[str]:
    raw = os.getenv("GENESIS_API_KEYS", "")
    if not raw:
        return frozenset()
    keys = {k.strip() for k in raw.split(",") if k.strip()}
    return frozenset(hashlib.sha256(k.encode()).hexdigest() for k in keys)


_API_KEY_HASHES: frozenset[str] = _load_api_key_hashes()

AUTH_DISABLED: bool = os.getenv("GENESIS_AUTH_DISABLED", "").lower() in (
    "1", "true", "yes"
)
if AUTH_DISABLED:
    log.warning(
        "GENESIS_AUTH_DISABLED=true — WSS authentication is OFF. "
        "Never deploy with this flag set."
    )


def issue_token(subject: str, ttl_s: int = _TTL_S) -> str:
    """Issue a signed HS256 JWT.  Use for service accounts and test clients."""
    now = int(time.time())
    payload = {
        "sub": subject,
        "iss": _ISSUER,
        "iat": now,
        "exp": now + ttl_s,
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGO)


def verify_token(token: str) -> tuple[bool, str]:
    """
    Verify a JWT or raw API key.

    Returns (ok, subject).  On failure subject is the short error reason.
    """
    if AUTH_DISABLED:
        return True, "auth-disabled"

    try:
        payload = jwt.decode(token, _SECRET, algorithms=[_ALGO])
        return True, payload.get("sub", "unknown")
    except JWTError:
        pass

    if _API_KEY_HASHES:
        h = hashlib.sha256(token.encode()).hexdigest()
        if h in _API_KEY_HASHES:
            return True, f"api-key:{h[:12]}"

    return False, "invalid_or_expired_token"


def extract_token(
    headers: dict[str, str],
    query_params: dict[str, str],
) -> str | None:
    """Extract bearer token from Authorization header or query params."""
    for key in ("authorization", "Authorization"):
        auth = headers.get(key, "")
        if auth.lower().startswith("bearer "):
            return auth[7:].strip()
    return query_params.get("token") or query_params.get("api_key") or None
