"""Account emails (launch task T16): one provider, key only in Railway variables.

`send(to, subject, text)` is the only thing the rest of the app calls. It never raises: a mail problem must not
break sign-in or a class page, so it returns a `Result` the caller can act on (for example, tell a teacher that
the email could not be sent).

Providers, chosen by `EMAIL_PROVIDER`:
  resend   the real sender (https://resend.com HTTP API, via httpx, no new package). Needs `EMAIL_API_KEY` and
           `EMAIL_FROM` (an address on a domain verified at the provider).
  memory   keeps messages in `mailer.outbox`. For tests and a staging check only; never set in production.
Anything else, or a missing key or sender, means "not configured": nothing is sent and the Result says so.

Safety: the recipient must be one plain address (no commas, no line breaks), the subject is one line, and the key
appears only in the Authorization header. Logs and the Result carry a short reason, never the key, the message
text or the full address (messages hold single-use links).
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass

import httpx

log = logging.getLogger("planethunter.mailer")

RESEND_URL = "https://api.resend.com/emails"
TIMEOUT_S = 10.0
MAX_SUBJECT = 200
MAX_TEXT = 20_000
_ADDRESS = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")

outbox: list[dict] = []  # filled only by the `memory` provider


@dataclass(frozen=True)
class Result:
    sent: bool
    reason: str = ""  # "" when sent, else: not_configured, bad_address, bad_message, rejected, unreachable


def provider() -> str:
    return os.environ.get("EMAIL_PROVIDER", "resend").strip().lower()


def from_address() -> str:
    return os.environ.get("EMAIL_FROM", "").strip()


def configured() -> bool:
    p = provider()
    if p == "memory":
        return True
    return p == "resend" and bool(os.environ.get("EMAIL_API_KEY", "").strip()) and _from_ok(from_address())


def _clean_address(value: str) -> str | None:
    """Return the address if it is exactly one plain address (an optional `Name <a@b.c>` sender is allowed only
    through `EMAIL_FROM`, handled separately), else None."""
    v = (value or "").strip()
    if len(v) > 254 or not _ADDRESS.match(v):
        return None
    return v


def _from_ok(value: str) -> bool:
    m = re.match(r"^[^<>\r\n,;]{1,80}<([^<>\r\n]+)>$", value)
    return bool(_clean_address(m.group(1) if m else value))


def send(to: str, subject: str, text: str) -> Result:
    addr = _clean_address(to)
    if not addr:
        return Result(False, "bad_address")
    if not subject or len(subject) > MAX_SUBJECT or "\r" in subject or "\n" in subject or not text or len(text) > MAX_TEXT:
        return Result(False, "bad_message")
    p = provider()
    if p == "memory":
        outbox.append({"to": addr, "subject": subject, "text": text, "from": from_address() or "test@example.com"})
        return Result(True)
    key = os.environ.get("EMAIL_API_KEY", "").strip()
    sender = from_address()
    if p != "resend" or not key or not sender or not _from_ok(sender):
        log.warning("email not sent: sender is not configured")
        return Result(False, "not_configured")
    try:
        with httpx.Client(timeout=TIMEOUT_S) as client:
            r = client.post(RESEND_URL, headers={"Authorization": f"Bearer {key}"},
                            json={"from": sender, "to": [addr], "subject": subject, "text": text})
    except httpx.HTTPError:
        log.warning("email not sent: provider unreachable")
        return Result(False, "unreachable")
    if r.status_code // 100 != 2:
        log.warning("email not sent: provider answered %s", r.status_code)
        return Result(False, "rejected")
    return Result(True)
