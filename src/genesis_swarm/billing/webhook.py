"""
Stripe-compatible billing webhook endpoint.

Every inbound request is HMAC-SHA256 verified against GENESIS_STRIPE_WEBHOOK_SECRET
before any state mutation.  A 5-minute timestamp window blocks replay attacks.

Handled events
--------------
customer.subscription.updated   Upgrade / downgrade tenant tier
customer.subscription.deleted   Cancel → downgrade to FREE
invoice.payment_failed           Mark payment_failed flag; enforce FREE limits
invoice.payment_succeeded        Clear payment_failed; restore contracted tier

Tenant resolution
-----------------
The Stripe Customer / Subscription object must carry:
    metadata.genesis_tenant_id = "<your-tenant-id>"

Set this at checkout time in your Stripe Checkout Session or Subscription creation.

Configuration env vars
----------------------
GENESIS_STRIPE_WEBHOOK_SECRET    whsec_... (from Stripe dashboard)
GENESIS_STRIPE_PRICE_STARTER     price_... Stripe Price ID for Starter plan
GENESIS_STRIPE_PRICE_PROFESSIONAL price_... Stripe Price ID for Professional plan
GENESIS_STRIPE_PRICE_ENTERPRISE  price_... Stripe Price ID for Enterprise plan
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time

from fastapi import APIRouter, HTTPException, Request, Response

from .tenant_billing import BillingTier, TenantBillingRegistry

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

# ── Price ID → tier mapping (loaded once from env at import) ──────────────────

_PRICE_TO_TIER: dict[str, BillingTier] = {}


def _reload_price_map() -> None:
    global _PRICE_TO_TIER
    _PRICE_TO_TIER = {
        os.getenv("GENESIS_STRIPE_PRICE_STARTER", "price_starter"):
            BillingTier.STARTER,
        os.getenv("GENESIS_STRIPE_PRICE_PROFESSIONAL", "price_professional"):
            BillingTier.PROFESSIONAL,
        os.getenv("GENESIS_STRIPE_PRICE_ENTERPRISE", "price_enterprise"):
            BillingTier.ENTERPRISE,
    }


_reload_price_map()


def _webhook_secret() -> bytes:
    s = os.getenv("GENESIS_STRIPE_WEBHOOK_SECRET", "whsec_dev_insecure")
    return s.encode("utf-8")


# ── Signature verification ────────────────────────────────────────────────────


def _verify_stripe_signature(payload: bytes, sig_header: str) -> bool:
    """
    Verify a Stripe webhook signature (v1 scheme).

    Stripe signature header format:
        Stripe-Signature: t=<unix_ts>,v1=<hex_hmac>

    Signed payload: "{timestamp}.{raw_body}"
    HMAC algorithm: SHA-256 keyed with the webhook signing secret.
    Replay guard:   reject events older than 300 seconds.
    """
    parts: dict[str, str] = {}
    for item in sig_header.split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            parts[k.strip()] = v.strip()

    ts_str = parts.get("t")
    v1_sig = parts.get("v1")

    if not ts_str or not v1_sig:
        log.warning("[BillingWebhook] Stripe-Signature header malformed")
        return False

    try:
        ts = int(ts_str)
    except ValueError:
        return False

    if abs(time.time() - ts) > 300:
        log.warning(
            "[BillingWebhook] Stripe signature timestamp too old (%ds)", int(time.time() - ts)
        )
        return False

    signed_payload = ts_str.encode("utf-8") + b"." + payload
    expected = hmac.new(_webhook_secret(), signed_payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1_sig)


# ── Tenant ID extraction ──────────────────────────────────────────────────────


def _extract_tenant_id(event_data: dict) -> str | None:
    """
    Extract the Genesis tenant_id from the Stripe event's object metadata.

    Priority:
        1. metadata.genesis_tenant_id
        2. metadata.tenant_id  (legacy)
    """
    obj = event_data.get("object", {})
    meta = obj.get("metadata", {})
    return meta.get("genesis_tenant_id") or meta.get("tenant_id") or None


def _price_id_from_subscription(event_data: dict) -> str | None:
    """Extract the first price ID from a subscription event object."""
    obj = event_data.get("object", {})
    items = obj.get("items", {}).get("data", [])
    if items:
        return items[0].get("price", {}).get("id")
    return obj.get("plan", {}).get("id")


# ── Registry dependency ───────────────────────────────────────────────────────


def _get_registry(request: Request) -> TenantBillingRegistry:
    reg: TenantBillingRegistry | None = getattr(request.app.state, "billing_registry", None)
    if reg is None:
        raise HTTPException(503, "Billing registry unavailable — Redis not initialised")
    return reg


# ── Webhook endpoint ──────────────────────────────────────────────────────────


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request) -> Response:
    """
    Receive Stripe billing lifecycle events.

    This endpoint is intentionally excluded from the OpenAPI schema and should
    be registered on its own path prefix in Stripe's dashboard.  Only POST
    requests with a valid Stripe-Signature header are accepted.
    """
    payload = await request.body()
    sig_header = request.headers.get("Stripe-Signature", "")

    if not _verify_stripe_signature(payload, sig_header):
        raise HTTPException(400, "Invalid Stripe signature")

    try:
        event: dict = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(400, "Non-JSON request body")

    event_type: str = event.get("type", "")
    event_data: dict = event.get("data", {})
    event_id: str = event.get("id", "evt_unknown")

    log.info("[BillingWebhook] event_id=%s type=%s", event_id, event_type)

    registry = _get_registry(request)
    tenant_id = _extract_tenant_id(event_data)

    if not tenant_id:
        log.warning(
            "[BillingWebhook] %s has no genesis_tenant_id metadata — skipped", event_id
        )
        body = json.dumps({"status": "skipped", "reason": "no tenant_id", "event_id": event_id})
        return Response(content=body, media_type="application/json", status_code=200)

    match event_type:
        case "customer.subscription.updated":
            price_id = _price_id_from_subscription(event_data)
            new_tier = _PRICE_TO_TIER.get(price_id or "", BillingTier.FREE)
            await registry.upgrade_tier(tenant_id, new_tier)
            log.info(
                "[BillingWebhook] tenant=%s subscription updated → tier=%s",
                tenant_id,
                new_tier,
            )

        case "customer.subscription.deleted":
            await registry.upgrade_tier(tenant_id, BillingTier.FREE)
            log.info("[BillingWebhook] tenant=%s subscription cancelled → FREE", tenant_id)

        case "invoice.payment_failed":
            await registry.mark_payment_failed(tenant_id)
            log.warning(
                "[BillingWebhook] tenant=%s invoice payment FAILED — FREE caps enforced",
                tenant_id,
            )

        case "invoice.payment_succeeded":
            await registry.clear_payment_failed(tenant_id)
            log.info(
                "[BillingWebhook] tenant=%s payment succeeded — tier limits restored", tenant_id
            )

        case _:
            log.debug("[BillingWebhook] unhandled event type: %s", event_type)

    body = json.dumps({"status": "ok", "event_id": event_id, "tenant_id": tenant_id})
    return Response(content=body, media_type="application/json", status_code=200)


# ── Admin / observability endpoints ──────────────────────────────────────────


@router.get("/usage/{tenant_id}", summary="Per-tenant API usage counters")
async def get_usage(tenant_id: str, request: Request) -> dict:
    registry = _get_registry(request)
    usage = await registry.get_usage(tenant_id)
    state = await registry.get_state(tenant_id)
    lim = state.effective_limits()
    return {
        **usage,
        "tier": state.effective_tier(),
        "daily_limit": lim.daily_api_calls,
        "rpm_limit": lim.rpm,
        "payment_failed": state.payment_failed,
        "stripe_subscription_id": state.stripe_subscription_id,
    }


@router.post("/tenants/{tenant_id}/tier", summary="Admin: manually set tenant billing tier")
async def set_tier(tenant_id: str, body: dict, request: Request) -> dict:
    """
    Manually override a tenant's billing tier.
    Must be gated behind _require_admin in the route registration.
    """
    tier_str = body.get("tier", "free").lower()
    try:
        new_tier = BillingTier(tier_str)
    except ValueError:
        valid = [t.value for t in BillingTier]
        raise HTTPException(400, f"Invalid tier '{tier_str}'. Valid values: {valid}")

    registry = _get_registry(request)
    state = await registry.upgrade_tier(tenant_id, new_tier)
    return {"tenant_id": tenant_id, "tier": state.tier, "updated_at": state.updated_at}


@router.get("/tenants", summary="Admin: list all known tenants")
async def list_tenants(request: Request) -> dict:
    registry = _get_registry(request)
    tenants = await registry.list_tenants()
    return {"tenants": tenants, "count": len(tenants)}
