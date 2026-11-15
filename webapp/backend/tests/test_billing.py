"""Billing (Phase 9): off by default, test keys only, signed webhooks, plan limits."""
import json
import time
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import app as backend
from billing import stripe as billing
from tests.test_classroom import H, org_of, teacher
from tests.test_scan_queue import engine  # noqa: F401
from tests.test_v2 import needs_db

SECRET = "whsec_test_secret"


@pytest.fixture
def billing_on(monkeypatch):
    monkeypatch.setenv("BILLING_ENABLED", "1")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_not_real")
    monkeypatch.setenv("STRIPE_PRICE_ID", "price_test_classroom")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", SECRET)


def test_off_by_default_and_only_test_keys(monkeypatch):
    monkeypatch.delenv("BILLING_ENABLED", raising=False)
    assert billing.status() == (False, "Billing is switched off on this server.")
    monkeypatch.setenv("BILLING_ENABLED", "1")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_live_real_money")
    assert billing.status()[0] is False and "test key" in billing.status()[1]
    with pytest.raises(billing.Off):
        billing.create_checkout(1, "a@b.example", "https://x")


def test_webhook_signatures():
    payload = b'{"id":"evt_1","type":"x","data":{"object":{}}}'
    now = 1_800_000_000
    header = billing.sign(payload, SECRET, now)
    assert billing.verify(payload, header, SECRET, now=now + 10)["id"] == "evt_1"
    for bad_header, at in [(header, now + 301), (billing.sign(payload, "whsec_other", now), now),
                           ("t=abc,v1=00", now), ("v1=00", now), ("", now)]:
        with pytest.raises(billing.BadSignature):
            billing.verify(payload, bad_header, SECRET, now=at)
    with pytest.raises(billing.BadSignature):
        billing.verify(payload + b" ", header, SECRET, now=now)


def test_checkout_sends_the_org_and_price_to_stripe(billing_on):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["form"] = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        seen["auth"] = request.headers["authorization"]
        return httpx.Response(200, json={"url": "https://checkout.stripe.com/c/pay/cs_test_1"})

    url = billing.create_checkout(42, "ada@school.example", "https://site.example", transport=httpx.MockTransport(handler))
    assert url == "https://checkout.stripe.com/c/pay/cs_test_1"
    assert seen["url"] == "https://api.stripe.com/v1/checkout/sessions"
    form = seen["form"]
    assert form["mode"] == "subscription" and form["client_reference_id"] == "42"
    assert form["line_items[0][price]"] == "price_test_classroom" and form["metadata[org_id]"] == "42"
    assert seen["auth"].startswith("Basic ")


def event(event_id: str, kind: str, org_id: int, **obj) -> bytes:
    return json.dumps({"id": event_id, "type": kind,
                       "data": {"object": {"metadata": {"org_id": str(org_id)}, **obj}}}).encode()


@needs_db
def test_signed_webhooks_change_the_plan_once_and_limits_follow(engine, billing_on):  # noqa: F811
    a = teacher("admin@billing.example", org="Billing School")
    try:
        org = org_of(a)
        assert a.get(f"/api/v2/orgs/{org}/billing").json() == {"org_id": org, "plan": "free", "status": "none",
                                                               "billing_enabled": True}
        # Free plan: one class.
        assert a.post(f"/api/v2/orgs/{org}/classes", json={"name": "First"}, headers=H).status_code == 201
        r = a.post(f"/api/v2/orgs/{org}/classes", json={"name": "Second"}, headers=H)
        assert r.status_code == 409 and "allows 1 class" in r.json()["detail"]

        with TestClient(backend.app) as stripe_side:
            body = event("evt_paid", "checkout.session.completed", org, customer="cus_1", subscription="sub_1")
            bad = stripe_side.post("/api/v2/billing/webhook", content=body,
                                   headers={"stripe-signature": billing.sign(body, "whsec_wrong", int(time.time()))})
            assert bad.status_code == 400
            ok = stripe_side.post("/api/v2/billing/webhook", content=body,
                                  headers={"stripe-signature": billing.sign(body, SECRET, int(time.time()))})
            assert ok.status_code == 200
            again = stripe_side.post("/api/v2/billing/webhook", content=body,
                                     headers={"stripe-signature": billing.sign(body, SECRET, int(time.time()))})
            assert again.status_code == 200
        assert a.get(f"/api/v2/orgs/{org}/billing").json()["plan"] == "classroom"
        assert a.post(f"/api/v2/orgs/{org}/classes", json={"name": "Second"}, headers=H).status_code == 201
        with engine.connect() as c:
            assert c.execute(text("select count(*) from audit_log where action = 'billing.plan_change'")).scalar_one() == 1

        with TestClient(backend.app) as stripe_side:
            body = event("evt_cancel", "customer.subscription.deleted", org, object="subscription", id="sub_1")
            stripe_side.post("/api/v2/billing/webhook", content=body,
                             headers={"stripe-signature": billing.sign(body, SECRET, int(time.time()))})
        assert a.get(f"/api/v2/orgs/{org}/billing").json()["plan"] == "free"
    finally:
        a.__exit__(None, None, None)


@needs_db
def test_checkout_needs_an_admin_of_that_org_and_billing_on(engine, monkeypatch):  # noqa: F811
    monkeypatch.delenv("BILLING_ENABLED", raising=False)
    a = teacher("admin@chk.example", org="Checkout School")
    b = teacher("other@chk.example", org="Other School")
    try:
        org = org_of(a)
        code = a.get(f"/api/v2/orgs/{org}").json()["join_code"]
        t = teacher("t@chk.example", code=code)
        try:
            assert b.post(f"/api/v2/orgs/{org}/billing/checkout", headers=H).status_code == 404
            assert t.post(f"/api/v2/orgs/{org}/billing/checkout", headers=H).status_code == 403
            r = a.post(f"/api/v2/orgs/{org}/billing/checkout", headers=H)
            assert r.status_code == 503 and "switched off" in r.json()["detail"]
            # With billing off, classrooms are not limited by plan.
            for n in range(3):
                assert a.post(f"/api/v2/orgs/{org}/classes", json={"name": f"C{n}"}, headers=H).status_code == 201
        finally:
            t.__exit__(None, None, None)
    finally:
        a.__exit__(None, None, None)
        b.__exit__(None, None, None)
    with TestClient(backend.app) as c:
        plans = c.get("/api/v2/billing/plans").json()
        assert plans["enabled"] is False and plans["limits_placeholder"] is True
        assert [p["id"] for p in plans["plans"]] == ["free", "classroom"]
        assert c.post("/api/v2/billing/webhook", content=b"{}").status_code == 503



def test_org_billing_routes_use_the_shared_dependency():
    from fastapi.routing import APIRoute

    from api_v2 import phase9_routes
    from classroom import auth
    routes = [r for r in phase9_routes.router.routes if isinstance(r, APIRoute) and r.path.startswith("/api/v2/orgs/")]
    assert len(routes) == 2
    for r in routes:
        assert any(isinstance(d.call, auth.Auth) for d in r.dependant.dependencies), r.path
