"""Authenticated, key-versioned field encryption (AES-256-GCM).

Stored format::

    v1:{key_id}:{iv}:{ciphertext}:{auth_tag}

Segments after the version are unpadded URL-safe base64 (``key_id`` is plain text,
``[A-Za-z0-9_-]``). A caller-supplied ``context`` string (for example
``"users.totp_secret"``) is bound as AES-GCM associated data, so a ciphertext copied
into a different column or record type fails authentication.

Rotation: new values are encrypted with the primary key; every configured key can
decrypt. ``needs_rotation`` / ``rotate`` re-encrypt old values to the primary key.
Keys come only from settings (environment) and are never stored in the database.
"""

import base64
import binascii
import hashlib
import re
import secrets
from functools import lru_cache

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

from app.core.config import settings

VERSION = "v1"
KEY_BYTES = 32
IV_BYTES = 12
TAG_BYTES = 16
_KEY_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


class EncryptionError(RuntimeError):
    """Raised for configuration problems or when ciphertext cannot be trusted."""


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64d(text: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except (binascii.Error, ValueError) as exc:
        raise EncryptionError("Malformed encrypted value.") from exc


def generate_key() -> str:
    """Return a new random key encoded for ``ACCO_ENCRYPTION_KEYS`` (url-safe base64)."""
    return _b64e(secrets.token_bytes(KEY_BYTES))


def parse_keys(spec: str) -> dict[str, bytes]:
    """Parse ``"id1=base64key,id2=base64key"`` into ``{id: key_bytes}``; validates strictly."""
    keys: dict[str, bytes] = {}
    for item in filter(None, (part.strip() for part in spec.split(","))):
        key_id, sep, encoded = item.partition("=")
        if not sep or not _KEY_ID_RE.match(key_id):
            raise EncryptionError("Encryption key entries must look like 'key_id=base64key'.")
        raw = _b64d(encoded.strip())
        if len(raw) != KEY_BYTES:
            raise EncryptionError(f"Encryption key '{key_id}' must decode to {KEY_BYTES} bytes.")
        if key_id in keys:
            raise EncryptionError(f"Duplicate encryption key id '{key_id}'.")
        keys[key_id] = raw
    return keys


class FieldEncryptor:
    def __init__(self, keys: dict[str, bytes], primary_key_id: str) -> None:
        if primary_key_id not in keys:
            raise EncryptionError("Primary encryption key id is not among the configured keys.")
        self._keys = keys
        self._primary = primary_key_id

    @property
    def primary_key_id(self) -> str:
        return self._primary

    def encrypt(self, plaintext: str, context: str = "") -> str:
        iv = secrets.token_bytes(IV_BYTES)
        sealed = AESGCM(self._keys[self._primary]).encrypt(
            iv, plaintext.encode("utf-8"), context.encode("utf-8")
        )
        ciphertext, tag = sealed[:-TAG_BYTES], sealed[-TAG_BYTES:]
        return ":".join((VERSION, self._primary, _b64e(iv), _b64e(ciphertext), _b64e(tag)))

    def decrypt(self, token: str, context: str = "") -> str:
        parts = token.split(":")
        if len(parts) != 5 or parts[0] != VERSION:
            raise EncryptionError("Unsupported or malformed encrypted value.")
        _, key_id, iv, ciphertext, tag = parts
        key = self._keys.get(key_id)
        if key is None:
            raise EncryptionError(f"No key available for key id '{key_id}'.")
        try:
            plain = AESGCM(key).decrypt(
                _b64d(iv), _b64d(ciphertext) + _b64d(tag), context.encode("utf-8")
            )
        except InvalidTag as exc:
            raise EncryptionError("Encrypted value failed authentication.") from exc
        return plain.decode("utf-8")

    def needs_rotation(self, token: str) -> bool:
        parts = token.split(":")
        return len(parts) == 5 and parts[1] != self._primary

    def rotate(self, token: str, context: str = "") -> str:
        """Re-encrypt ``token`` with the primary key (decrypts with any configured key)."""
        return self.encrypt(self.decrypt(token, context), context)


def build_encryptor() -> FieldEncryptor:
    """Build from settings. Development falls back to a key derived from the JWT secret."""
    raw = settings.encryption_keys.get_secret_value() if settings.encryption_keys else ""
    if raw.strip():
        keys = parse_keys(raw)
        primary = settings.encryption_primary_key_id or next(iter(keys))
        return FieldEncryptor(keys, primary)
    if not settings.is_development:
        raise EncryptionError("ACCO_ENCRYPTION_KEYS is required outside development.")
    seed = (settings.jwt_secret_key or "acco-development-only").encode("utf-8")
    derived = hashlib.sha256(b"acco-dev-field-encryption:" + seed).digest()
    return FieldEncryptor({"dev": derived}, "dev")


@lru_cache(maxsize=1)
def get_encryptor() -> FieldEncryptor:
    return build_encryptor()


class EncryptedString(TypeDecorator[str]):
    """Transparent AES-GCM encryption for a text column. ``context`` binds the column."""

    impl = String
    cache_ok = True

    def __init__(self, context: str, length: int = 1024) -> None:
        super().__init__(length)
        self.context = context

    def process_bind_param(self, value: str | None, dialect) -> str | None:  # type: ignore[override]
        return None if value is None else get_encryptor().encrypt(value, self.context)

    def process_result_value(self, value: str | None, dialect) -> str | None:  # type: ignore[override]
        return None if value is None else get_encryptor().decrypt(value, self.context)
