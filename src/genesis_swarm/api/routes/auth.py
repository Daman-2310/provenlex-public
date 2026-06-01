from __future__ import annotations

import os
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
import bcrypt as _bcrypt

from ..state import _metrics_state

router = APIRouter()

_bearer = HTTPBearer(auto_error=False)

_JWT_REFRESH_EXP = 7 * 86400  # 7 days
_JWT_ALG = "HS256"
_JWT_EXP = 86400  # 24h
_ROLE_RANK = {"admin": 3, "operator": 2, "viewer": 1}
_log = __import__("logging").getLogger(__name__)


def _log_extra(level: str, event: str, **kv) -> None:
    """Emit structured log compatible with stdlib Logger on Python 3.14."""
    parts = " ".join(f"{k}={v!r}" for k, v in kv.items())
    msg = f"{event} {parts}" if parts else event
    getattr(_log, level)(msg)


_DEV_JWT_SECRET = "genesis-dev-secret"  # sentinel — must never appear in prod

# ── Redis (optional — lazy-init on first use) ─────────────────────────────────
# When GENESIS_REDIS_URL is set, token revocation and login-attempt state are
# stored in Redis so all API replicas share the same view.
# When absent (dev / single-instance), the in-memory dicts below are used.
_redis_client = None
_redis_init_done = False

_KEY_JTI = "genesis:jti:{}"            # JTI blacklist; TTL = remaining token lifetime
_KEY_LOCK_COUNT = "genesis:lock:{}:n"  # failed-login counter; TTL = _LOCKOUT_WINDOW
_KEY_LOCK_UNTIL = "genesis:lock:{}:t"  # locked-until timestamp string; TTL = _LOCKOUT_SECONDS
_LOCKOUT_WINDOW = 3600  # seconds — attempt counter auto-expires after 1 hour


def _get_redis():
    """Return a Redis client if GENESIS_REDIS_URL is configured; None otherwise."""
    global _redis_client, _redis_init_done
    if _redis_init_done:
        return _redis_client
    _redis_init_done = True
    url = os.getenv("GENESIS_REDIS_URL", "")
    if not url:
        _log_extra(
            "info", "redis_not_configured",
            hint="Set GENESIS_REDIS_URL for distributed token revocation and lockout state",
        )
        return None
    try:
        import redis as _r
        client = _r.from_url(url, decode_responses=True, socket_connect_timeout=2)
        client.ping()
        _redis_client = client
        _log_extra("info", "redis_connected", endpoint=url.split("@")[-1])
    except Exception as exc:
        _log_extra(
            "warning", "redis_connect_failed", error=str(exc),
            hint="Falling back to in-memory state — not suitable for multi-replica deployments",
        )
    return _redis_client


# ── In-memory fallback (single-instance / dev only) ──────────────────────────
_login_attempts: dict[str, dict] = {}
_token_blacklist: dict[str, float] = {}  # jti -> expiry_timestamp
_MAX_LOGIN_ATTEMPTS = 5
_LOCKOUT_SECONDS = 900  # 15 minutes



# ── Request models ────────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


def _user_db() -> dict:
    import json as _j

    raw = os.getenv("GENESIS_USERS", "")
    if raw:
        try:
            return _j.loads(raw)
        except Exception as exc:
            _log_extra("error", "user_db_env_parse_failed",
                error=str(exc),
                hint="GENESIS_USERS env var contains invalid JSON — falling back to dev defaults",
            )
    # Dev defaults — ONLY used when GENESIS_USERS is not set or is invalid.
    # Bcrypt hash of "genesis2024". MUST be overridden in any real deployment.
    # Set GENESIS_USERS env var with production bcrypt hashes before going live.
    _dev_hash = "$2b$12$zfOHNeuFtJ5OEX0WdYdRz.rn11j07VC7vSzkhYf2NA50DzGV8WAge"
    return {
        "admin": {"hash": _dev_hash, "roles": ["admin", "operator", "viewer"]},
        "operator": {"hash": _dev_hash, "roles": ["operator", "viewer"]},
        "viewer": {"hash": _dev_hash, "roles": ["viewer"]},
        # Legacy name kept for backward compat
        "genesis": {"hash": _dev_hash, "roles": ["admin", "operator", "viewer"]},
    }


def _jwt_secret() -> str:
    secret = os.getenv("GENESIS_JWT_SECRET", _DEV_JWT_SECRET)
    if secret == _DEV_JWT_SECRET:
        import os as _os
        env = _os.getenv("GENESIS_ENVIRONMENT", "development")
        if env == "production":
            raise RuntimeError(
                "GENESIS_JWT_SECRET must be set to a strong random value in production. "
                "Refusing to start with the insecure default."
            )
        _log_extra("warning", "jwt_secret_is_default",
            severity="SECURITY",
            action="Set GENESIS_JWT_SECRET env var before deploying to production",
        )
    return secret


def _make_token(username: str, roles: list[str] | None = None) -> str:
    if roles is None:
        db = _user_db()
        roles = db.get(username, {}).get("roles", ["viewer"])
    now = int(time.time())
    payload = {
        "sub": username,
        "roles": roles,
        "jti": str(uuid.uuid4()),  # unique token ID for revocation
        "exp": now + _JWT_EXP,
        "iat": now,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=_JWT_ALG)


def _revoke_token(jti: str, exp: float) -> None:
    """Blacklist a JTI until its natural expiry (Redis) or lazily-pruned dict (fallback)."""
    ttl = max(0, int(exp - time.time()) + 60)  # 60-second buffer
    r = _get_redis()
    if r is not None:
        if ttl > 0:
            r.setex(_KEY_JTI.format(jti), ttl, "1")
        return
    # In-memory fallback: prune expired entries lazily, then store
    now = time.time()
    for k in [k for k, v in _token_blacklist.items() if v < now]:
        del _token_blacklist[k]
    _token_blacklist[jti] = exp


def _is_jti_revoked(jti: str) -> bool:
    r = _get_redis()
    if r is not None:
        return bool(r.exists(_KEY_JTI.format(jti)))
    return jti in _token_blacklist


def _decode_token(creds: HTTPAuthorizationCredentials | None) -> dict:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        data = jwt.decode(creds.credentials, _jwt_secret(), algorithms=[_JWT_ALG])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")
    jti = data.get("jti")
    if jti and _is_jti_revoked(jti):
        raise HTTPException(401, "Token has been revoked")
    return data


def _verify_token(creds: HTTPAuthorizationCredentials | None) -> str:
    return _decode_token(creds)["sub"]


def _require_auth(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> str:
    if os.environ.get("GENESIS_AUTH_DISABLED", "").lower() in ("1", "true", "yes"):
        return "demo"
    return _verify_token(creds)


def _require_role(min_role: str):
    """Dependency factory: requires caller to hold min_role or higher."""
    min_rank = _ROLE_RANK.get(min_role, 1)

    def _dep(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> str:
        data = _decode_token(creds)
        user = data["sub"]
        roles = data.get("roles", ["viewer"])
        user_rank = max((_ROLE_RANK.get(r, 0) for r in roles), default=0)
        if user_rank < min_rank:
            raise HTTPException(403, f"Role \'{min_role}\' required")
        return user

    return _dep


_require_operator = _require_role("operator")
_require_admin = _require_role("admin")


def _check_lockout(username: str) -> None:
    """Raise HTTP 423 if account is currently locked out."""
    r = _get_redis()
    if r is not None:
        val = r.get(_KEY_LOCK_UNTIL.format(username))
        if val and float(val) > time.time():
            remaining = int(float(val) - time.time())
            raise HTTPException(
                status_code=423,
                detail=f"Account locked. Try again in {remaining}s.",
                headers={"X-Lock-Remaining-Seconds": str(remaining)},
            )
        return
    # In-memory fallback
    rec = _login_attempts.get(username)
    if rec and rec.get("locked_until", 0) > time.time():
        remaining = int(rec["locked_until"] - time.time())
        raise HTTPException(
            status_code=423,
            detail=f"Account locked. Try again in {remaining}s.",
            headers={"X-Lock-Remaining-Seconds": str(remaining)},
        )


def _record_failed_login(username: str) -> None:
    _metrics_state["auth_failures_total"] += 1
    r = _get_redis()
    if r is not None:
        count = r.incr(_KEY_LOCK_COUNT.format(username))
        if count == 1:
            r.expire(_KEY_LOCK_COUNT.format(username), _LOCKOUT_WINDOW)
        if count >= _MAX_LOGIN_ATTEMPTS:
            locked_until = time.time() + _LOCKOUT_SECONDS
            r.setex(_KEY_LOCK_UNTIL.format(username), _LOCKOUT_SECONDS, str(locked_until))
            _log_extra("warning", "account_locked", username=username, lockout_seconds=_LOCKOUT_SECONDS)
        return
    # In-memory fallback
    rec = _login_attempts.setdefault(username, {"count": 0, "locked_until": 0.0})
    rec["count"] += 1
    if rec["count"] >= _MAX_LOGIN_ATTEMPTS:
        rec["locked_until"] = time.time() + _LOCKOUT_SECONDS
        _log_extra("warning", "account_locked", username=username, lockout_seconds=_LOCKOUT_SECONDS)


def _clear_failed_logins(username: str) -> None:
    r = _get_redis()
    if r is not None:
        r.delete(_KEY_LOCK_COUNT.format(username), _KEY_LOCK_UNTIL.format(username))
        return
    _login_attempts.pop(username, None)


def _make_refresh_token(username: str, roles: list[str]) -> str:
    payload = {
        "sub": username,
        "roles": roles,
        "type": "refresh",
        "exp": int(time.time()) + _JWT_REFRESH_EXP,
        "iat": int(time.time()),
    }
    # Refresh tokens use the same secret but a different type claim
    return jwt.encode(payload, _jwt_secret() + ":refresh", algorithm=_JWT_ALG)


@router.post(
    "/api/auth/login",
    summary="Authenticate and receive access + refresh tokens",
    tags=["auth"],
)
def auth_login(body: LoginRequest):
    username = body.username.strip().lower()
    password = body.password

    _check_lockout(username)

    db = _user_db()
    user = db.get(username)
    if not user:
        _record_failed_login(username)
        raise HTTPException(401, "Invalid credentials")

    stored_hash = user.get("hash", "")
    password_ok = False
    if not stored_hash or not stored_hash.startswith("$2"):
        # Reject entirely — no plain-text fallback, no env-var bypass.
        # A misconfigured user DB should fail closed, not open.
        _log_extra("error", "auth_missing_bcrypt_hash",
            username=username,
            hint="GENESIS_USERS must contain bcrypt hashes starting with $2b$",
        )
        raise HTTPException(500, "Server authentication configuration error")
    try:
        password_ok = _bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
    except Exception as exc:
        _log_extra("error", "bcrypt_verify_failed", username=username, error=str(exc))
        raise HTTPException(500, "Server authentication error")

    if not password_ok:
        _record_failed_login(username)
        raise HTTPException(401, "Invalid credentials")

    _clear_failed_logins(username)
    roles = user.get("roles", ["viewer"])
    from ...shared.tenancy import inject_tenant_claim

    _tok_payload = inject_tenant_claim({}, username)
    tenant_id = _tok_payload.get("tenant_id", "default")
    access_token = _make_token(username, roles)
    refresh_token = _make_refresh_token(username, roles)
    _log_extra("info", "login_success", username=username, roles=roles)
    return {
        "token": access_token,
        "refresh_token": refresh_token,
        "username": username,
        "roles": roles,
        "tenant_id": tenant_id,
        "expires_in": _JWT_EXP,
    }


@router.post(
    "/api/auth/refresh",
    summary="Exchange a refresh token for a new access token",
    tags=["auth"],
)
def auth_refresh(body: RefreshTokenRequest):
    """Exchange a valid refresh token for a new 24-hour access token."""
    refresh_token = body.refresh_token
    try:
        data = jwt.decode(refresh_token, _jwt_secret() + ":refresh", algorithms=[_JWT_ALG])
    except JWTError:
        raise HTTPException(401, "Invalid or expired refresh token")
    if data.get("type") != "refresh":
        raise HTTPException(401, "Not a refresh token")
    username = data["sub"]
    roles = data.get("roles", ["viewer"])
    access_token = _make_token(username, roles)
    return {"token": access_token, "username": username, "roles": roles, "expires_in": _JWT_EXP}


@router.get("/api/auth/me")
def auth_me(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    data = _decode_token(creds)
    return {
        "username": data["sub"],
        "roles": data.get("roles", ["viewer"]),
        "authenticated": True,
        "issued_at": data.get("iat"),
        "expires_at": data.get("exp"),
    }


@router.post("/api/auth/logout", summary="Revoke the current access token", tags=["auth"])
def auth_logout(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    """Blacklist the token\'s JTI so it cannot be reused even before expiry."""
    data = _decode_token(creds)
    jti = data.get("jti")
    if jti:
        _revoke_token(jti, float(data.get("exp", time.time())))
    _log_extra("info", "logout", username=data.get("sub", "?"), jti=jti)
    return {"ok": True}
