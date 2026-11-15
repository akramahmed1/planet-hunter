"""Stripe billing for the classroom plan (Phase 9), in test mode and switched off.

Akram's decision (2026-10-18): build it in Stripe test mode with fakes, switched off.
Billing is on only when BILLING_ENABLED=1, and only test keys (sk_test_...) are
accepted before Phase 10. Stripe is called over its HTTP API with httpx, so tests swap
the transport for a fake. Webhooks are verified with Stripe's signature scheme
(HMAC-SHA256 over "timestamp.payload", 5 minute tolerance) and recorded by event id so a
replayed event is applied once.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time

import httpx
from sqlalchemy import text
from sqlalchemy.engine import Engine

API = "https://api.stripe.com/v1"
TOLERANCE_S = 300


class Off(Exception):
    """Billing is switched off or not configured; the message says which."""


class BadSignature(Exception):
    pass


def status() -> tuple[bool, str]:
    if os.environ.get("BILLING_ENABLED") != "1":
        return False, "Billing is switched off on this server."
    key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not key.startswith("sk_test_"):
        return False, "Billing is switched off: only a Stripe test key is accepted until launch."
    if not os.environ.get("STRIPE_PRICE_ID") or not os.environ.get("STRIPE_WEBHOOK_SECRET"):
        return False, "Billing is switched off: the classroom price and webhook secret are not set."
    return True, ""


def _client(transport: httpx.BaseTransport | None = None) -> httpx.Client:
    return httpx.Client(base_url=API, timeout=20.0, transport=transport,
                        auth=(os.environ["STRIPE_SECRET_KEY"], ""))


def create_checkout(org_id: int, email: str, site_url: str, transport: httpx.BaseTransport | None = None) -> str:
    """A Stripe Checkout URL for the classroom plan, for one organization."""
    ok, why = status()
    if not ok:
        raise Off(why)
    form = {
        "mode": "subscription",
        "line_items[0][price]": os.environ["STRIPE_PRICE_ID"],
        "line_items[0][quantity]": "1",
        "customer_email": email,
        "client_reference_id": str(org_id),
        "metadata[org_id]": str(org_id),
        "subscription_data[metadata][org_id]": str(org_id),
        "success_url": f"{site_url}/classroom?billing=done",
        "cancel_url": f"{site_url}/classroom?billing=cancelled",
    }
    with _client(transport) as c:
        r = c.post("/checkout/sessions", data=form, headers={"Idempotency-Key": f"checkout-{org_id}-{int(time.time() // 600)}"})
    if r.status_code >= 400:
        raise Off(f"Stripe returned {r.status_code}")
    return r.json()["url"]


def verify(payload: bytes, header: str, secret: str, now: float | None = None) -> dict:
    """The event, if the Stripe-Signature header is valid for this payload; else raise BadSignature."""
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    signatures = [v for k, v in (p.split("=", 1) for p in header.split(",") if "=" in p) if k == "v1"]
    try:
        ts = int(parts["t"])
    except (KeyError, ValueError):
        raise BadSignature("no timestamp") from None
    if abs((now or time.time()) - ts) > TOLERANCE_S:
        raise BadSignature("timestamp outside the tolerance")
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, sig) for sig in signatures):
        raise BadSignature("signature does not match")
    return json.loads(payload)


def sign(payload: bytes, secret: str, ts: int) -> str:
    """Build a Stripe-Signature header (for tests and the local fake)."""
    return f"t={ts},v1={hmac.new(secret.encode(), f'{ts}.'.encode() + payload, hashlib.sha256).hexdigest()}"


def apply_event(eng: Engine, event: dict) -> str:
    """Apply one verified event to org_plans. Returns what happened, for the log."""
    with eng.begin() as c:
        new = c.execute(text("insert into stripe_events (id, type) values (:i, :t) on conflict do nothing returning id"),
                        {"i": event["id"], "t": event["type"]}).first()
        if new is None:
            return "duplicate"
        obj = event["data"]["object"]
        org = (obj.get("metadata") or {}).get("org_id") or obj.get("client_reference_id")
        if not org or not str(org).isdigit():
            return "ignored: no org"
        org_id = int(org)
        if c.execute(text("select 1 from organizations where id = :o"), {"o": org_id}).first() is None:
            return "ignored: unknown org"
        if event["type"] == "checkout.session.completed":
            plan, st = "classroom", "active"
        elif event["type"] in ("customer.subscription.updated", "customer.subscription.created"):
            st = obj.get("status", "active")
            plan = "classroom" if st in ("active", "trialing") else "free"
        elif event["type"] == "customer.subscription.deleted":
            plan, st = "free", "canceled"
        else:
            return "ignored: type"
        c.execute(text("""
            insert into org_plans (org_id, plan, status, stripe_customer, stripe_subscription, updated_at)
            values (:o, :p, :s, :cu, :su, now())
            on conflict (org_id) do update set plan = excluded.plan, status = excluded.status,
              stripe_customer = coalesce(excluded.stripe_customer, org_plans.stripe_customer),
              stripe_subscription = coalesce(excluded.stripe_subscription, org_plans.stripe_subscription),
              updated_at = now()"""),
            {"o": org_id, "p": plan, "s": st, "cu": obj.get("customer"),
             "su": obj.get("subscription") or (obj.get("id") if obj.get("object") == "subscription" else None)})
        c.execute(text("""insert into audit_log (org_id, actor_user_id, action, target, detail)
                          values (:o, null, 'billing.plan_change', :t, cast(:d as jsonb))"""),
                  {"o": org_id, "t": f"org:{org_id}", "d": json.dumps({"plan": plan, "status": st, "event": event["id"]})})
    return f"{plan}/{st}"
