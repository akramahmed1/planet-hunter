"""Time based one time codes for teacher two-step sign-in (launch task T20).

RFC 6238 with the settings every authenticator app supports: HMAC-SHA1, 6 digits, 30 second steps. Written with the
standard library only (hmac, hashlib, struct). The shared secret has to be readable again to check a code, so it is
stored encrypted (AES-256-GCM, a fresh random nonce each time, the account id as authenticated data so a secret copied
to another account does not decrypt). The key is `TOTP_ENCRYPTION_KEY`, 32 random bytes in base64, set only in Railway;
without it two-step sign-in cannot be switched on and `available()` says so.

Recovery codes are 80 bit random strings, stored as SHA-256 hashes (a leaked hash cannot be guessed back at that size),
each good once.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import os
import secrets
import struct
import time
from urllib.parse import quote

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

STEP_S = 30
DIGITS = 6
WINDOW = 1  # accept the step before and after, for clocks a few seconds out
RECOVERY_COUNT = 10
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _key() -> bytes | None:
    raw = os.environ.get("TOTP_ENCRYPTION_KEY", "").strip()
    if not raw:
        return None
    try:
        key = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        return None
    return key if len(key) == 32 else None


def available() -> bool:
    return _key() is not None


def new_secret() -> str:
    """20 random bytes (the size RFC 4226 recommends) as base32, the form authenticator apps take."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _raw(secret_b32: str) -> bytes:
    return base64.b32decode(secret_b32 + "=" * (-len(secret_b32) % 8), casefold=True)


def code_at(secret_b32: str, step: int) -> str:
    mac = hmac.new(_raw(secret_b32), struct.pack(">Q", step), hashlib.sha1).digest()
    off = mac[-1] & 0x0F
    num = (struct.unpack(">I", mac[off:off + 4])[0] & 0x7FFFFFFF) % (10 ** DIGITS)
    return f"{num:0{DIGITS}d}"


def current_step(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // STEP_S)


def normal_code(code: str) -> str:
    return "".join(code.split()).replace("-", "")


def check(secret_b32: str, code: str, last_step: int | None, now: float | None = None) -> int | None:
    """The step the code belongs to if it is right and newer than the last accepted step (so a code cannot be used
    twice, even inside its 90 second window), else None. Every candidate is compared in constant time."""
    given = normal_code(code)
    if len(given) != DIGITS or not given.isdigit():
        return None
    base, hit = current_step(now), None
    for step in range(base - WINDOW, base + WINDOW + 1):
        if hmac.compare_digest(code_at(secret_b32, step), given) and (last_step is None or step > last_step):
            hit = step
    return hit


def otpauth_uri(secret_b32: str, email: str) -> str:
    return (f"otpauth://totp/{quote('Planet Hunter')}:{quote(email)}?secret={secret_b32}"
            f"&issuer={quote('Planet Hunter')}&algorithm=SHA1&digits={DIGITS}&period={STEP_S}")


def seal(secret_b32: str, user_id: int) -> bytes:
    key = _key()
    if key is None:
        raise RuntimeError("TOTP_ENCRYPTION_KEY is not set")
    nonce = secrets.token_bytes(12)
    return nonce + AESGCM(key).encrypt(nonce, secret_b32.encode(), f"user:{user_id}".encode())


def unseal(blob: bytes, user_id: int) -> str | None:
    """The secret, or None if the key is missing or wrong, or the blob was changed or belongs to another account."""
    key = _key()
    if key is None or len(blob) < 29:
        return None
    try:
        return AESGCM(key).decrypt(bytes(blob[:12]), bytes(blob[12:]), f"user:{user_id}".encode()).decode()
    except InvalidTag:
        return None


def new_recovery_codes() -> list[str]:
    out = []
    for _ in range(RECOVERY_COUNT):
        raw = "".join(secrets.choice(_ALPHABET) for _ in range(16))
        out.append("-".join(raw[i:i + 4] for i in range(0, 16, 4)))
    return out


def normal_recovery(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def recovery_hash(code: str) -> str:
    return hashlib.sha256(("ph-recovery:" + normal_recovery(code)).encode()).hexdigest()
