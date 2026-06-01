from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..state import _state
from .auth import _require_auth

router = APIRouter()


class OperatorKeyRequest(BaseModel):
    key: str = Field(..., min_length=1, max_length=256)


@router.post("/operator/shutdown")
async def operator_shutdown(body: OperatorKeyRequest, _user: str = Depends(_require_auth)):
    commander = _state["commander"]
    if not commander:
        raise HTTPException(status_code=503, detail="Swarm not running")
    result = commander.operator_shutdown(body.key)
    if result.startswith("SHUTDOWN"):
        stop_event = _state.get("stop_event")
        if stop_event:
            stop_event.set()
    return {"result": result, "accepted": result.startswith("SHUTDOWN")}


@router.post("/operator/quarantine/{bot_id}")
async def operator_quarantine(bot_id: str, body: OperatorKeyRequest, _user: str = Depends(_require_auth)):
    commander = _state["commander"]
    if not commander:
        raise HTTPException(status_code=503, detail="Swarm not running")
    result = commander.operator_quarantine(bot_id, body.key)
    return {"result": result, "accepted": result.startswith("QUARANTINED")}


@router.get("/operator/status")
async def operator_status(key: str = ""):
    commander = _state["commander"]
    if not commander:
        raise HTTPException(status_code=503, detail="Swarm not running")
    return commander.operator_status_report(key)


@router.post("/operator/safe-haven")
async def operator_safe_haven(body: OperatorKeyRequest, _user: str = Depends(_require_auth)):
    commander = _state["commander"]
    if not commander:
        raise HTTPException(status_code=503, detail="Swarm not running")
    if not commander._verify_operator(body.key):
        raise HTTPException(status_code=403, detail="REJECTED: invalid operator key")
    result = await commander.activate_safe_haven(reason="operator_command")
    return result
