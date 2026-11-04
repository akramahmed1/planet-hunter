"""The one time code maths and the secret box (launch task T20)."""
from __future__ import annotations

import base64

import pytest

from classroom import totp

# RFC 6238 appendix B: the SHA-1 secret is the ASCII string 12345678901234567890; the table gives 8 digit codes, of
# which our 6 digits are the last six.
RFC_SECRET = base64.b32encode(b"12345678901234567890").decode()
RFC = {59: "287082", 1111111109: "081804", 1111111111: "050471", 1234567890: "005924", 2000000000: "279037",
       20000000000: "353130"}
KEY = base64.b64encode(bytes(range(32))).decode()


@pytest.mark.parametrize("when,expected", RFC.items())
def test_codes_match_the_rfc_6238_test_vectors(when, expected):
    assert totp.code_at(RFC_SECRET, when // 30) == expected


def test_a_code_is_good_in_its_own_step_and_one_either_side_but_not_further():
    now = 1_700_000_000
    step = totp.current_step(now)
    for s, ok in ((step - 2, False), (step - 1, True), (step, True), (step + 1, True), (step + 2, False)):
        assert (totp.check(RFC_SECRET, totp.code_at(RFC_SECRET, s), None, now) is not None) is ok, s


def test_a_code_cannot_be_used_twice_or_after_a_later_one():
    now = 1_700_000_000
    step = totp.current_step(now)
    code = totp.code_at(RFC_SECRET, step)
    assert totp.check(RFC_SECRET, code, None, now) == step
    assert totp.check(RFC_SECRET, code, step, now) is None  # same step again
    assert totp.check(RFC_SECRET, totp.code_at(RFC_SECRET, step - 1), step, now) is None  # an older step


@pytest.mark.parametrize("bad", ["", "12345", "1234567", "abcdef", "12 34 5x", "000000"])
def test_wrong_shapes_and_wrong_codes_fail(bad):
    assert totp.check(RFC_SECRET, bad, None, 59) is None


def test_spaces_and_dashes_in_a_typed_code_are_ignored():
    assert totp.check(RFC_SECRET, "287 082", None, 59) is not None
    assert totp.check(RFC_SECRET, "287-082", None, 59) is not None


def test_the_secret_is_20_random_bytes_in_base32():
    a, b = totp.new_secret(), totp.new_secret()
    assert a != b and len(base64.b32decode(a + "=" * (-len(a) % 8))) == 20


def test_the_box_round_trips_and_binds_the_secret_to_one_account(monkeypatch):
    monkeypatch.setenv("TOTP_ENCRYPTION_KEY", KEY)
    secret = totp.new_secret()
    blob = totp.seal(secret, 7)
    assert secret.encode() not in blob
    assert totp.seal(secret, 7) != blob  # a fresh nonce every time
    assert totp.unseal(blob, 7) == secret
    assert totp.unseal(blob, 8) is None  # copied to another account
    assert totp.unseal(blob[:-1] + bytes([blob[-1] ^ 1]), 7) is None  # tampered
    monkeypatch.setenv("TOTP_ENCRYPTION_KEY", base64.b64encode(bytes(32)).decode())
    assert totp.unseal(blob, 7) is None  # wrong key


@pytest.mark.parametrize("value", ["", "not base64!!", base64.b64encode(b"short").decode()])
def test_a_missing_or_bad_key_means_two_step_is_unavailable(monkeypatch, value):
    monkeypatch.setenv("TOTP_ENCRYPTION_KEY", value)
    assert not totp.available()
    with pytest.raises(RuntimeError):
        totp.seal("ABC", 1)


def test_recovery_codes_are_ten_distinct_80_bit_codes_hashed_without_case_or_dashes():
    codes = totp.new_recovery_codes()
    assert len(codes) == len(set(codes)) == 10
    assert all(len(c) == 19 and c.count("-") == 3 for c in codes)
    assert totp.recovery_hash(codes[0]) == totp.recovery_hash(codes[0].lower().replace("-", " "))
    assert totp.recovery_hash(codes[0]) != totp.recovery_hash(codes[1])


def test_the_phone_link_names_the_app_and_the_account():
    uri = totp.otpauth_uri("ABCDEFGH", "t@school.example")
    assert uri.startswith("otpauth://totp/Planet%20Hunter:t%40school.example?secret=ABCDEFGH&issuer=Planet%20Hunter")
