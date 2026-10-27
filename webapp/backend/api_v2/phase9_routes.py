"""Phase 9: the "What am I looking at?" explainer and classroom billing.

Both are switched off by default (Akram, 2026-10-18): the explainer until a model key is
added, billing until launch, and then only in Stripe test mode until Phase 10.
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response
from sqlalchemy import text

import db
from api_v2 import schemas as s
from billing import plans
from billing import stripe as billing
from classroom import auth, security
from classroom.auth import TEACHER, Principal
from explain import grounding, model, service, spend

router = APIRouter(prefix="/api/v2", tags=["v2"])
log = logging.getLogger("planet-hunter.phase9")


def _one_line(value: object) -> str:
    """Make a value safe to put in a log line: no line breaks, so it cannot fake another entry."""
    return str(value).replace("\r", "").replace("\n", "")
NOTE = ("Written by an AI model from this page's data and the site's lessons only. Check the cited fields; "
        "if they do not say it, it is not known.")


def _id():
    return Path(..., ge=1, le=2**62)


@router.get("/explain/status", response_model=s.ExplainStatus)
def explain_status(response: Response) -> s.ExplainStatus:
    response.headers["Cache-Control"] = "no-store"
    ok, why = model.configured()
    if ok:
        eng = db.engine()
        if eng is not None:
            try:
                paused = spend.status(eng)
            except Exception:  # noqa: BLE001 - the ledger being unreachable must not break the status page
                log.exception("explainer spend status could not be read")
                paused = None
            if paused is not None and paused.paused:
                return s.ExplainStatus(enabled=False, reason=paused.reason, model=None, paused=True)
    return s.ExplainStatus(enabled=ok, reason=None if ok else why,
                           model=(model.current().name if ok else None))


@router.post("/explain", response_model=s.ExplainResponse,
             responses={503: {"description": "The explainer is switched off or unavailable"},
                        429: {"description": "Rate limited"}, 404: {"description": "No such item"}})
def explain(body: s.ExplainRequest, request: Request, response: Response) -> s.ExplainResponse:
    """Answer one question about one candidate, scan or planet system, from its data only."""
    response.headers["Cache-Control"] = "no-store"
    ok, why = model.configured()
    if not ok:
        raise HTTPException(503, why)
    eng = db.engine()
    if eng is None:
        raise HTTPException(503, "the explainer needs the database for its rate limits")
    try:
        question = service.clean_question(body.question)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    try:
        if body.kind == "candidate":
            item = grounding.candidate_item(body.ref)
        elif body.kind == "planet":
            item = grounding.planet_item(body.ref)
        else:
            if not body.ref.isdigit():
                raise grounding.NotFound("no such scan")
            item = grounding.scan_item(eng, int(body.ref))
    except grounding.NotFound as exc:
        raise HTTPException(404, str(exc))

    try:
        paused = spend.status(eng)
    except Exception:  # noqa: BLE001
        log.exception("explainer spend status could not be read")
        raise HTTPException(503, "the explainer cannot check its budget right now")
    if paused.paused:  # quiet: no rate-limit counts are used up while it is paused
        raise HTTPException(503, paused.reason or spend.PAUSED_MESSAGE)

    p = auth.optional_principal(request)
    person = (f"session:{p.session_id}" if p else f"ip:{security.requester_key(auth.client_ip(request))}")
    class_key = f"{p.org_id}:{p.class_id}" if p and p.kind == "student" else None
    try:
        service.take(eng, person, class_key)
        if class_key:
            with eng.connect() as c:
                limit = plans.explainer_class_limit(c, p.org_id)
                used = c.execute(text("select count(*) from usage_events where key = :k and at > now() - interval '1 day'"),
                                 {"k": f"explain:class:{class_key}"}).scalar_one()
            if limit is not None and used > limit:
                raise service.Limited("Your class has used today's explainer questions on its plan.")
    except service.Limited as exc:
        raise HTTPException(429, str(exc), headers={"Retry-After": "3600"})
    try:
        out = service.explain_metered(eng, model.current(), grounding.grounding_for(item), question)
    except spend.CapReached as exc:
        raise HTTPException(503, str(exc))
    except spend.UnknownPrice as exc:
        log.error("%s", exc)
        raise HTTPException(503, "the explainer is not set up for this model yet")
    except model.ModelError as exc:
        raise HTTPException(503, str(exc))
    return s.ExplainResponse(known=out.known, answer=out.answer,
                             citations=[s.ExplainCitation(**c) for c in out.citations], model=out.model, note=NOTE)


# ---------- billing ----------

@router.get("/billing/plans", response_model=s.PlansResponse)
def billing_plans() -> s.PlansResponse:
    ok, why = billing.status()
    return s.PlansResponse(enabled=ok, reason=None if ok else why, limits_placeholder=True,
                           plans=[s.Plan(id=k, **v) for k, v in plans.PLANS.items()])


@router.get("/orgs/{org_id}/billing", response_model=s.OrgBilling)
def org_billing(response: Response, org_id: int = _id(), p: Principal = Depends(TEACHER)) -> s.OrgBilling:
    response.headers["Cache-Control"] = "no-store"
    if org_id not in p.roles:
        raise HTTPException(404, "no such organization")
    eng = auth.engine()
    with eng.connect() as c:
        row = c.execute(text("select plan, status from org_plans where org_id = :o"), {"o": org_id}).first()
    return s.OrgBilling(org_id=org_id, plan=row[0] if row else "free", status=row[1] if row else "none",
                        billing_enabled=billing.status()[0])


@router.post("/orgs/{org_id}/billing/checkout", response_model=s.CheckoutResponse,
             responses={503: {"description": "Billing is switched off"}})
def checkout(request: Request, org_id: int = _id(), p: Principal = Depends(TEACHER)) -> s.CheckoutResponse:
    """Start Stripe Checkout for the classroom plan. Only an organization admin can."""
    role = p.roles.get(org_id)
    if role is None:
        raise HTTPException(404, "no such organization")
    if role != "org_admin":
        raise HTTPException(403, "only an organization admin can change the plan")
    site = os.environ.get("PUBLIC_SITE_URL", request.headers.get("origin", "")).rstrip("/")
    try:
        return s.CheckoutResponse(url=billing.create_checkout(org_id, p.email or "", site))
    except billing.Off as exc:
        raise HTTPException(503, str(exc))


@router.post("/billing/webhook", include_in_schema=False)
async def webhook(request: Request) -> dict:
    """Stripe calls this. The signature is checked before anything is read."""
    ok, why = billing.status()
    if not ok:
        raise HTTPException(503, why)
    payload = await request.body()
    try:
        event = billing.verify(payload, request.headers.get("stripe-signature", ""), os.environ["STRIPE_WEBHOOK_SECRET"])
    except billing.BadSignature as exc:
        raise HTTPException(400, f"bad signature: {exc}")
    eng = auth.engine()
    result = billing.apply_event(eng, event)
    log.info("stripe event %s %s: %s", _one_line(event.get("id")), _one_line(event.get("type")), _one_line(result))
    return {"received": True}
