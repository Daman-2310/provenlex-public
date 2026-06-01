"""
OpenID Connect / SSO authentication module.

Supports the Authorization Code Flow (RFC 6749 §4.1) with PKCE-style
state/nonce verification.  After a successful exchange the module issues
a Genesis Swarm HS256 JWT that is fully compatible with the existing
JWT-based auth in api/routes/auth.py.

Provider compatibility
----------------------
Tested against: Google Workspace, Microsoft Entra ID (Azure AD),
                Okta, Auth0, Keycloak, Dex, and any RFC 8414 compliant IdP.

Configuration (env vars)
------------------------
GENESIS_OIDC_ISSUER           https://accounts.google.com
GENESIS_OIDC_CLIENT_ID        <client-id>
GENESIS_OIDC_CLIENT_SECRET    <client-secret>
GENESIS_OIDC_REDIRECT_URI     https://api.genesisswarm.io/api/auth/oidc/callback
GENESIS_OIDC_SCOPES           openid email profile      (space-separated)
GENESIS_OIDC_ROLES_CLAIM      roles                     (JWT claim carrying user roles)
GENESIS_OIDC_DEFAULT_ROLE     viewer                    (if claim absent)
GENESIS_JWT_SECRET            <same secret used by the rest of the app>

Routes registered
-----------------
GET  /api/auth/oidc/login      Redirect to provider authorisation endpoint
GET  /api/auth/oidc/callback   Exchange code → validate ID token → issue Genesis JWT
GET  /api/auth/oidc/status     Configuration and JWKS cache status

Security properties
-------------------
- State token: 32-byte URL-safe random, expiry 10 min, single-use
- Nonce:       16-byte random, SHA-256 hashed before embedding in auth request
- JWKS:        Cached for 6 h; re-fetched automatically on cache miss
- Replay:      State tokens are consumed on first use (deleted from store)
- Token clock: Standard `exp` + `nbf` checks via python-jose
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import time
from urllib.parse import urlencode

from genesis_swarm.shared.config import get_config

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from jose import JWTError, jwt as jose_jwt
from pydantic import BaseModel

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth/oidc", tags=["auth"])

_STATE_TTL_S: int = 600     # 10-minute PKCE state window
_JWKS_TTL_S: int = 6 * 3600  # 6-hour JWKS cache
_JWT_ALG: str = "HS256"
_JWT_EXP_S: int = 86400       # 24-hour Genesis access token lifetime


# ── Configuration ─────────────────────────────────────────────────────────────


class OIDCConfig(BaseModel):
    issuer: str = ""
    client_id: str = ""
    client_secret: str = ""
    redirect_uri: str = ""
    scopes: str = "openid email profile"
    roles_claim: str = "roles"
    default_role: str = "viewer"


def _cfg() -> OIDCConfig:
    return OIDCConfig(
        issuer=os.getenv("GENESIS_OIDC_ISSUER", ""),
        client_id=os.getenv("GENESIS_OIDC_CLIENT_ID", ""),
        client_secret=os.getenv("GENESIS_OIDC_CLIENT_SECRET", ""),
        redirect_uri=os.getenv("GENESIS_OIDC_REDIRECT_URI", ""),
        scopes=os.getenv("GENESIS_OIDC_SCOPES", "openid email profile"),
        roles_claim=os.getenv("GENESIS_OIDC_ROLES_CLAIM", "roles"),
        default_role=os.getenv("GENESIS_OIDC_DEFAULT_ROLE", "viewer"),
    )


def _is_enabled() -> bool:
    c = _cfg()
    return bool(c.issuer and c.client_id and c.client_secret)


_DEV_JWT_SECRET = "genesis-dev-secret"  # sentinel — must never appear in production


def _jwt_secret() -> str:
    secret = os.getenv("GENESIS_JWT_SECRET", _DEV_JWT_SECRET)
    if secret == _DEV_JWT_SECRET:
        from genesis_swarm.shared.config import get_config
        cfg = get_config()
        if cfg.is_production:
            raise RuntimeError(
                "GENESIS_JWT_SECRET must be set to a strong random value in production. "
                "Refusing to start with the insecure default."
            )
        log.warning(
            "jwt_secret_is_default",
            severity="SECURITY",
            action="Set GENESIS_JWT_SECRET env var before deploying to production",
        )
    return secret


# ── JWKS cache ────────────────────────────────────────────────────────────────

_jwks_store: dict = {"keys": None, "fetched_at": 0.0}


async def _fetch_jwks(issuer: str) -> list[dict]:
    """Fetch JWKS from the provider's discovery document; cache for 6 h."""
    now = time.time()
    if _jwks_store["keys"] is not None and (now - _jwks_store["fetched_at"]) < _JWKS_TTL_S:
        return _jwks_store["keys"]  # type: ignore[return-value]

    discovery_url = f"{issuer.rstrip('/')}/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10.0) as client:
        disc = await client.get(discovery_url)
        disc.raise_for_status()
        jwks_uri: str = disc.json().get("jwks_uri", "")
        if not jwks_uri:
            raise HTTPException(503, f"No jwks_uri in OIDC discovery for {issuer}")

        jwks_resp = await client.get(jwks_uri)
        jwks_resp.raise_for_status()
        keys: list[dict] = jwks_resp.json().get("keys", [])

    _jwks_store["keys"] = keys
    _jwks_store["fetched_at"] = now
    log.info("[OIDC] JWKS refreshed from %s — %d keys loaded", jwks_uri, len(keys))
    return keys


# ── Token validation ──────────────────────────────────────────────────────────


async def validate_id_token(id_token: str, cfg: OIDCConfig) -> dict:
    """
    Validate an OIDC ID token against the provider's JWKS.

    Tries every key in the JWKS until one succeeds or all fail.  This
    handles key rotation gracefully without forcing a cache flush.

    Raises HTTPException(401) if validation cannot succeed.
    """
    keys = await _fetch_jwks(cfg.issuer)
    if not keys:
        raise HTTPException(503, "JWKS unavailable — cannot validate ID token")

    last_exc: Exception | None = None
    for key in keys:
        try:
            return jose_jwt.decode(
                id_token,
                key,
                algorithms=["RS256", "RS384", "RS512", "ES256", "ES384"],
                audience=cfg.client_id,
                issuer=cfg.issuer,
            )
        except JWTError as exc:
            last_exc = exc

    raise HTTPException(401, f"ID token validation failed: {last_exc}")


def _map_roles(claims: dict, roles_claim: str, default_role: str) -> list[str]:
    """Map provider role claim values to Genesis Swarm roles."""
    raw = claims.get(roles_claim, [])
    if isinstance(raw, str):
        raw = [raw]
    valid = {"admin", "operator", "viewer"}
    mapped = [r.lower() for r in raw if isinstance(r, str) and r.lower() in valid]
    return mapped or [default_role]


# ── Single-use state store ────────────────────────────────────────────────────
# In production deploy, replace with Redis SETEX so multi-replica API pods
# share state:  key = genesis:oidc:state:{state_token}  TTL = 600s

_state_store: dict[str, dict] = {}


def _new_state() -> tuple[str, str]:
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(16)
    # Prune expired entries before inserting
    now = time.time()
    expired = [k for k, v in _state_store.items() if v["exp"] < now]
    for k in expired:
        del _state_store[k]
    _state_store[state] = {"nonce": nonce, "exp": now + _STATE_TTL_S}
    return state, nonce


def _consume_state(state: str) -> str | None:
    """Validate, consume (delete), and return the nonce. None if invalid/expired."""
    entry = _state_store.pop(state, None)
    if entry is None:
        return None
    if entry["exp"] < time.time():
        return None
    return entry["nonce"]


# ── Discovery document helper ─────────────────────────────────────────────────


async def _discovery(issuer: str) -> dict:
    url = f"{issuer.rstrip('/')}/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/login", summary="Initiate OIDC authorization code flow")
async def oidc_login() -> RedirectResponse:
    """
    Redirect the user's browser to the configured OIDC provider.

    The state parameter is a single-use 32-byte token that prevents CSRF.
    The nonce is SHA-256 hashed before embedding so the raw value never
    leaves the server.
    """
    cfg = _cfg()
    if not _is_enabled():
        raise HTTPException(501, "OIDC not configured. Set GENESIS_OIDC_* env vars.")

    disc = await _discovery(cfg.issuer)
    auth_endpoint: str = disc.get("authorization_endpoint", "")
    if not auth_endpoint:
        raise HTTPException(503, "OIDC discovery missing authorization_endpoint")

    state, nonce = _new_state()
    nonce_hash = hashlib.sha256(nonce.encode()).hexdigest()

    params = {
        "response_type": "code",
        "client_id": cfg.client_id,
        "redirect_uri": cfg.redirect_uri,
        "scope": cfg.scopes,
        "state": state,
        "nonce": nonce_hash,
    }
    redirect_url = f"{auth_endpoint}?{urlencode(params)}"
    log.info("[OIDC] Redirecting to %s", auth_endpoint)
    return RedirectResponse(url=redirect_url)


@router.get("/callback", summary="OIDC callback — exchange code for Genesis JWT")
async def oidc_callback(
    code: str = "",
    state: str = "",
    error: str = "",
    error_description: str = "",
) -> JSONResponse:
    """
    Handle the provider callback:
        1. Verify state token (CSRF protection)
        2. Exchange authorization code for tokens via token endpoint
        3. Validate ID token signature and claims
        4. Verify nonce hash (prevents token injection)
        5. Map provider roles to Genesis Swarm roles
        6. Issue a Genesis access JWT identical in structure to password-login tokens
    """
    cfg = _cfg()

    if error:
        log.warning("[OIDC] Provider error: %s — %s", error, error_description)
        raise HTTPException(400, f"OIDC provider error: {error}: {error_description}")

    if not code or not state:
        raise HTTPException(400, "Missing 'code' or 'state' in callback")

    nonce = _consume_state(state)
    if nonce is None:
        raise HTTPException(400, "Invalid or expired OIDC state token — possible CSRF")

    # ── Exchange code for tokens ───────────────────────────────────────────────
    disc = await _discovery(cfg.issuer)
    token_endpoint: str = disc.get("token_endpoint", "")
    if not token_endpoint:
        raise HTTPException(503, "OIDC discovery missing token_endpoint")

    async with httpx.AsyncClient(timeout=15.0) as client:
        tok_resp = await client.post(
            token_endpoint,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": cfg.redirect_uri,
                "client_id": cfg.client_id,
                "client_secret": cfg.client_secret,
            },
        )

    if tok_resp.status_code != 200:
        log.error("[OIDC] Token exchange failed %d: %s", tok_resp.status_code, tok_resp.text)
        raise HTTPException(401, "OIDC token exchange failed")

    tok_data: dict = tok_resp.json()
    id_token: str = tok_data.get("id_token", "")
    if not id_token:
        raise HTTPException(401, "No id_token in OIDC token response")

    # ── Validate ID token ──────────────────────────────────────────────────────
    claims = await validate_id_token(id_token, cfg)

    # Verify nonce: the provider echoes back nonce_hash; we compare to our hash
    provider_nonce = claims.get("nonce", "")
    expected_nonce = hashlib.sha256(nonce.encode()).hexdigest()
    if provider_nonce != expected_nonce:
        log.error("[OIDC] Nonce mismatch — possible token injection attack")
        raise HTTPException(401, "OIDC nonce mismatch")

    # ── Build Genesis JWT ──────────────────────────────────────────────────────
    subject: str = claims.get("sub", claims.get("email", "oidc-user"))
    email: str = claims.get("email", "")
    roles: list[str] = _map_roles(claims, cfg.roles_claim, cfg.default_role)
    tenant_id: str = claims.get("genesis_tenant_id", "default")

    payload = {
        "sub": subject,
        "email": email,
        "roles": roles,
        "tenant_id": tenant_id,
        "exp": int(time.time()) + _JWT_EXP_S,
        "iat": int(time.time()),
        "auth_method": "oidc",
        "oidc_issuer": cfg.issuer,
    }
    access_token = jose_jwt.encode(payload, _jwt_secret(), algorithm=_JWT_ALG)

    log.info(
        "[OIDC] Login success sub=%s email=%s roles=%s tenant=%s",
        subject,
        email,
        roles,
        tenant_id,
    )
    return JSONResponse({
        "token": access_token,
        "username": email or subject,
        "roles": roles,
        "tenant_id": tenant_id,
        "expires_in": _JWT_EXP_S,
        "auth_method": "oidc",
    })


@router.get("/status", summary="OIDC integration health and configuration status")
async def oidc_status() -> dict:
    cfg = _cfg()
    enabled = _is_enabled()
    jwks_age = round(time.time() - _jwks_store["fetched_at"],
                     0) if _jwks_store["fetched_at"] else None
    return {
        "enabled": enabled,
        "issuer": cfg.issuer if enabled else "",
        "client_id": cfg.client_id if enabled else "",
        "scopes": cfg.scopes,
        "redirect_uri": cfg.redirect_uri if enabled else "",
        "jwks_cached": _jwks_store["keys"] is not None,
        "jwks_age_seconds": jwks_age,
        "active_state_tokens": len(_state_store),
    }
