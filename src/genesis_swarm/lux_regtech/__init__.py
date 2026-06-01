"""
Genesis Swarm — Luxembourg RegTech Suite
=========================================

Five institutional-grade compliance engines tailored to the Grand Duchy's
highest-stakes frameworks. Each component is self-contained (Pydantic models +
business logic + FastAPI router) so it can be split into an independent
microservice. PostgreSQL DDL for all five lives in ``schema.sql``.

Components
----------
1. ``substance``          — CSSF Circular 24/856 substance / presence audit
2. ``discrepancy``        — cross-departmental reconciliation engine
3. ``aifmd_monitor``      — AIFMD II loan-origination limit + arbitrage monitor
4. ``e_identification``   — CSSF e-ID packaging / validation / submission
5. ``delegation_ledger``  — Circular CSSF 18/698 delegation oversight ledger

Wire-up: each module exposes ``router`` (a ``fastapi.APIRouter``). The
convenience ``ALL_ROUTERS`` tuple lets the host app include them in one loop.
"""

from __future__ import annotations

from .aifmd_monitor import router as aifmd_router
from .delegation_ledger import router as delegation_router
from .discrepancy import router as discrepancy_router
from .e_identification import router as eid_router
from .substance import router as substance_router

ALL_ROUTERS = (
    substance_router,
    discrepancy_router,
    aifmd_router,
    eid_router,
    delegation_router,
)

__all__ = [
    "ALL_ROUTERS",
    "aifmd_router",
    "delegation_router",
    "discrepancy_router",
    "eid_router",
    "substance_router",
]
