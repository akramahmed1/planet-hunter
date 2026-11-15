"""Passwords, PINs, session tokens, join codes and the 13+ age check (Phase 8).

Passwords and PINs are hashed with Argon2id (argon2-cffi defaults, RFC 9106 low-memory
profile). Session tokens are random and stored only as a SHA-256 hash, so a database
leak does not give working sessions. Join codes avoid look-alike characters.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()
# A real hash of a random string, verified against when the account does not exist, so a
# wrong email takes as long as a wrong password.
_DUMMY = _hasher.hash(secrets.token_hex(16))

PASSWORD_MIN, PASSWORD_MAX = 10, 128
PIN_RE = re.compile(r"^\d{4,8}$")
NICKNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{0,22}[A-Za-z0-9]$|^[A-Za-z0-9]$")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,189}\.[^@\s]{2,63}$")
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I
SESSION_DAYS = 30


def hash_secret(secret: str) -> str:
    return _hasher.hash(secret)


def verify_secret(stored: str | None, secret: str) -> bool:
    try:
        return _hasher.verify(stored or _DUMMY, secret) and stored is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_problem(pw: str) -> str | None:
    if len(pw) < PASSWORD_MIN:
        return f"Use at least {PASSWORD_MIN} characters."
    if len(pw) > PASSWORD_MAX:
        return f"Use at most {PASSWORD_MAX} characters."
    if pw.strip() != pw or not pw.strip():
        return "The password cannot start or end with a space."
    return None


def normal_email(email: str) -> str | None:
    e = email.strip()
    return e.lower() if EMAIL_RE.match(e) else None


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_code(n: int = 8) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(n))


def normal_code(code: str) -> str:
    return re.sub(r"[\s-]", "", code).upper()


def is_13_or_older(birth_year: int, birth_month: int, today: dt.date | None = None) -> bool:
    """True when the person turned 13 before the current month (ADR 0005).

    Only month and year are asked, so someone whose 13th birthday falls in the current
    month is asked to come back next month rather than guessed at.
    """
    today = today or dt.datetime.now(dt.timezone.utc).date()
    if not (1 <= birth_month <= 12) or not (1900 <= birth_year <= today.year):
        return False
    months = (today.year - birth_year) * 12 + (today.month - birth_month)
    return months > 13 * 12


def requester_key(ip: str) -> str:
    """Per-IP keys for failure counting, hashed so raw IPs are not stored."""
    return hashlib.sha256(f"ph-ip:{ip}".encode()).hexdigest()[:32]
