"""Field encryption tests (Task 0.8)."""

import pytest

from app.core.encryption import (
    EncryptedString,
    EncryptionError,
    FieldEncryptor,
    generate_key,
    parse_keys,
)


def _enc(*ids: str, primary: str | None = None) -> FieldEncryptor:
    spec = ",".join(f"{i}={generate_key()}" for i in ids)
    return FieldEncryptor(parse_keys(spec), primary or ids[0])


def test_round_trip_and_format():
    enc = _enc("k1")
    token = enc.encrypt("JBSWY3DPEHPK3PXP", "users.totp")
    version, key_id, iv, ct, tag = token.split(":")
    assert (version, key_id) == ("v1", "k1")
    assert all([iv, ct, tag])
    assert "JBSWY3DPEHPK3PXP" not in token
    assert enc.decrypt(token, "users.totp") == "JBSWY3DPEHPK3PXP"


def test_nonce_is_random_per_encryption():
    enc = _enc("k1")
    assert enc.encrypt("same") != enc.encrypt("same")


def test_tampering_is_detected():
    enc = _enc("k1")
    version, key_id, iv, ct, tag = enc.encrypt("secret").split(":")
    flipped = ("A" if ct[0] != "A" else "B") + ct[1:]
    with pytest.raises(EncryptionError):
        enc.decrypt(f"{version}:{key_id}:{iv}:{flipped}:{tag}")
    with pytest.raises(EncryptionError):
        enc.decrypt(":".join((version, key_id, iv, ct, ("A" if tag[0] != "A" else "B") + tag[1:])))


def test_context_binding_prevents_column_swap():
    enc = _enc("k1")
    token = enc.encrypt("secret", "users.totp")
    with pytest.raises(EncryptionError):
        enc.decrypt(token, "webhooks.secret")


@pytest.mark.parametrize("bad", ["", "plain", "v2:k1:a:b:c", "v1:k1:a:b", "v1:zz:!!:!!:!!"])
def test_malformed_values_rejected(bad):
    with pytest.raises(EncryptionError):
        _enc("k1").decrypt(bad)


def test_unknown_key_id_rejected():
    token = _enc("k1").encrypt("x")
    with pytest.raises(EncryptionError):
        _enc("other").decrypt(token)


def test_key_rotation_decrypts_old_and_reencrypts_with_new_primary():
    old_spec = {"k1": parse_keys(f"k1={generate_key()}")["k1"]}
    old = FieldEncryptor(old_spec, "k1")
    legacy = old.encrypt("api-credential", "ctx")

    new_key = parse_keys(f"k2={generate_key()}")["k2"]
    rotated_enc = FieldEncryptor({**old_spec, "k2": new_key}, "k2")
    assert rotated_enc.decrypt(legacy, "ctx") == "api-credential"
    assert rotated_enc.needs_rotation(legacy)

    fresh = rotated_enc.rotate(legacy, "ctx")
    assert fresh.split(":")[1] == "k2"
    assert not rotated_enc.needs_rotation(fresh)
    # The retired-key-only encryptor can no longer read the rotated value.
    with pytest.raises(EncryptionError):
        old.decrypt(fresh, "ctx")


def test_parse_keys_validation():
    with pytest.raises(EncryptionError):
        parse_keys("k1=tooshort")
    with pytest.raises(EncryptionError):
        parse_keys(f"bad id={generate_key()}")
    with pytest.raises(EncryptionError):
        FieldEncryptor(parse_keys(f"k1={generate_key()}"), "missing")


def test_encrypted_string_type_round_trip(db_session):
    from sqlalchemy import Column, Integer, MetaData, Table, select

    table = Table(
        "enc_probe",
        MetaData(),
        Column("id", Integer, primary_key=True),
        Column("secret", EncryptedString("probe.secret")),
    )
    table.create(db_session.get_bind())
    db_session.execute(table.insert().values(id=1, secret="hunter2"))
    raw = db_session.connection().exec_driver_sql("SELECT secret FROM enc_probe").scalar()
    assert raw.startswith("v1:") and "hunter2" not in raw
    assert db_session.execute(select(table.c.secret)).scalar() == "hunter2"
