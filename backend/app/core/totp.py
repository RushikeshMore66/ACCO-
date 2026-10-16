"""RFC 6238 TOTP (HMAC-SHA1, 30 s step, 6 digits) using only the standard library.

Compatible with Google Authenticator, Microsoft Authenticator, 1Password, Authy, etc.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

DIGITS = 6
PERIOD = 30
SECRET_BYTES = 20  # 160-bit, the RFC 4226 recommended size


def generate_secret() -> str:
    """Random base32 secret (no padding), as accepted by authenticator apps."""
    return base64.b32encode(secrets.token_bytes(SECRET_BYTES)).decode("ascii").rstrip("=")


def _key(secret: str) -> bytes:
    cleaned = secret.replace(" ", "").upper()
    return base64.b32decode(cleaned + "=" * (-len(cleaned) % 8))


def hotp(secret: str, counter: int, digits: int = DIGITS) -> str:
    digest = hmac.new(_key(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % (10**digits)
    return str(code).zfill(digits)


def time_step(at: float | None = None, period: int = PERIOD) -> int:
    return int((time.time() if at is None else at) // period)


def generate_totp(secret: str, at: float | None = None) -> str:
    return hotp(secret, time_step(at))


def verify_totp(
    secret: str,
    code: str,
    *,
    at: float | None = None,
    window: int = 1,
    last_step: int | None = None,
) -> int | None:
    """Return the matched time step, or None if invalid.

    ``window`` accepts +/- that many steps of clock drift. Steps ``<= last_step`` are rejected
    so a captured code cannot be replayed within its validity window.
    """
    candidate = (code or "").strip().replace(" ", "")
    if len(candidate) != DIGITS or not candidate.isdigit():
        return None
    current = time_step(at)
    matched: int | None = None
    for step in range(current - window, current + window + 1):
        if last_step is not None and step <= last_step:
            continue
        # Constant-time comparison; evaluate every candidate step.
        if hmac.compare_digest(hotp(secret, step), candidate) and matched is None:
            matched = step
    return matched


def provisioning_uri(secret: str, account_name: str, issuer: str) -> str:
    label = f"{quote(issuer)}:{quote(account_name)}"
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}"
        f"&algorithm=SHA1&digits={DIGITS}&period={PERIOD}"
    )
