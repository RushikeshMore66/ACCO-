"""RFC 6238 TOTP primitives (Task 0.5)."""

import base64

from app.core import totp

# RFC 6238 appendix B: SHA-1, secret "12345678901234567890", 8-digit codes.
RFC_SECRET = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
RFC_VECTORS = {
    59: "94287082",
    1111111109: "07081804",
    1111111111: "14050471",
    1234567890: "89005924",
    2000000000: "69279037",
}


def test_rfc6238_vectors():
    for at, expected in RFC_VECTORS.items():
        assert totp.hotp(RFC_SECRET, totp.time_step(at), digits=8) == expected


def test_verify_accepts_current_and_adjacent_step_only():
    secret = totp.generate_secret()
    now = 1_700_000_000
    code = totp.generate_totp(secret, now)
    assert totp.verify_totp(secret, code, at=now) == totp.time_step(now)
    assert totp.verify_totp(secret, code, at=now + 30) is not None  # +1 step drift
    assert totp.verify_totp(secret, code, at=now + 120) is None


def test_verify_rejects_replay_and_malformed():
    secret = totp.generate_secret()
    now = 1_700_000_000
    code = totp.generate_totp(secret, now)
    step = totp.verify_totp(secret, code, at=now)
    assert totp.verify_totp(secret, code, at=now, last_step=step) is None
    for bad in ("", "12345", "1234567", "abcdef", None):
        assert totp.verify_totp(secret, bad, at=now) is None


def test_provisioning_uri_contains_issuer_and_secret():
    uri = totp.provisioning_uri("ABCDEF", "a@b.example", "ACCO")
    assert uri.startswith("otpauth://totp/ACCO:a%40b.example?")
    assert "secret=ABCDEF" in uri and "issuer=ACCO" in uri
