"""
Multi-tenancy — tenant-scoped JWT claims + per-tenant data isolation.

Each JWT now carries a `tenant_id` claim. All case DB access, alert logs,
and consensus state are partitioned by tenant. Tenants cannot see each other's data.

Design:
  - Tenant ID injected into JWT at login if GENESIS_TENANTS env var defines it
  - Per-tenant SQLite DB: {GENESIS_DB_ROOT}/{tenant_id}/cases.db
  - Per-tenant bot configuration (thresholds, enabled bots) via tenant registry
  - Single consensus domain per tenant (separate PBFTConsensus instance per tenant)
  - API routes extract tenant_id via _get_tenant() dependency

Usage:
    from genesis_swarm.shared.tenancy import get_tenant_id, TenantRegistry

    @app.get("/api/v1/cases")
    def get_cases(tenant: str = Depends(get_tenant_id)):
        db_path = TenantRegistry.db_path(tenant)
        ...
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Optional

# ── Tenant registry ───────────────────────────────────────────────────────────

DB_ROOT = os.getenv("GENESIS_DB_ROOT", "./tenant_data")

# GENESIS_TENANTS env var: JSON map of tenant_id → config
# {"acme-fund": {"name": "ACME Fund", "bots": ["NAV_DETECTOR", "SANCTIONS_BOT"]}}
_DEFAULT_TENANT = "default"


@dataclass
class TenantConfig:
    tenant_id: str
    name: str = "Default Tenant"
    enabled_bots: list[str] = field(default_factory=list)
    db_path: Optional[str] = None

    def effective_db_path(self) -> str:
        if self.db_path:
            return self.db_path
        base = os.path.join(DB_ROOT, self.tenant_id)
        os.makedirs(base, exist_ok=True)
        return os.path.join(base, "cases.db")


class TenantRegistry:
    """Loads tenant configs from GENESIS_TENANTS env var."""

    _tenants: dict[str, TenantConfig] = {}
    _loaded = False

    @classmethod
    def _ensure_loaded(cls) -> None:
        if cls._loaded:
            return
        raw = os.getenv("GENESIS_TENANTS", "")
        if raw:
            try:
                data = json.loads(raw)
                for tid, cfg in data.items():
                    cls._tenants[tid] = TenantConfig(
                        tenant_id=tid,
                        name=cfg.get("name", tid),
                        enabled_bots=cfg.get("bots", []),
                        db_path=cfg.get("db_path"),
                    )
            except Exception as exc:
                import logging as _lg
                _lg.getLogger(__name__).error(
                    "tenant_registry_parse_failed",
                    error=str(exc),
                    hint="GENESIS_TENANTS env var contains invalid JSON — using default tenant only",
                )
        if _DEFAULT_TENANT not in cls._tenants:
            cls._tenants[_DEFAULT_TENANT] = TenantConfig(tenant_id=_DEFAULT_TENANT)
        cls._loaded = True

    @classmethod
    def get(cls, tenant_id: str) -> TenantConfig:
        cls._ensure_loaded()
        return cls._tenants.get(tenant_id, TenantConfig(tenant_id=tenant_id))

    @classmethod
    def list_tenants(cls) -> list[str]:
        cls._ensure_loaded()
        return list(cls._tenants.keys())

    @classmethod
    def db_path(cls, tenant_id: str) -> str:
        return cls.get(tenant_id).effective_db_path()

    @classmethod
    def reload(cls) -> None:
        cls._loaded = False
        cls._tenants.clear()
        cls._ensure_loaded()


# ── JWT tenant claim helper ────────────────────────────────────────────────────


def inject_tenant_claim(payload: dict, username: str) -> dict:
    """
    Injects `tenant_id` into a JWT payload.
    Rules (in priority order):
      1. If GENESIS_USERS maps username → tenant_id, use that
      2. If only one tenant configured, use that
      3. Fall back to "default"
    """
    raw = os.getenv("GENESIS_USERS", "")
    if raw:
        try:
            users = json.loads(raw)
            user_cfg = users.get(username, {})
            if "tenant_id" in user_cfg:
                payload["tenant_id"] = user_cfg["tenant_id"]
                return payload
        except Exception as exc:
            import logging as _lg
            _lg.getLogger(__name__).warning(
                "inject_tenant_claim_parse_failed",
                username=username,
                error=str(exc),
            )

    tenants = TenantRegistry.list_tenants()
    if len(tenants) == 1:
        payload["tenant_id"] = tenants[0]
    else:
        payload["tenant_id"] = _DEFAULT_TENANT
    return payload


def extract_tenant_from_jwt(decoded: dict) -> str:
    """Extract tenant_id from a decoded JWT payload, defaulting to 'default'."""
    return decoded.get("tenant_id", _DEFAULT_TENANT)
