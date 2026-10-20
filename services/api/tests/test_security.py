import base64

import pytest

from app.config import ConfigError, load_settings
from app.security import DataCipher, DecryptionError, email_index, verify_password, hash_password

K1 = base64.b64encode(b"\x01" * 32).decode()
K2 = base64.b64encode(b"\x02" * 32).decode()
STRONG = "x" * 40


def prod_env(**extra):
    env = {
        "STOCKY_ENV": "production",
        "STOCKY_ALLOWED_HOSTS": "api.example.org",
        "STOCKY_JWT_SECRET": STRONG,
        "STOCKY_EMAIL_PEPPER": STRONG,
        "STOCKY_DATA_KEYS": f"k1:{K1}",
        "STOCKY_REGISTRATION_CODE": "codigo-largo-123",
        "POSTGRES_HOST": "db",
        "POSTGRES_PASSWORD": "pw",
        "POSTGRES_SSLROOTCERT": "/run/secrets/db_ca.crt",
    }
    env.update(extra)
    return env


def test_production_config_is_complete_and_uses_tls():
    s = load_settings(prod_env())
    assert s.database_url.startswith("postgresql+psycopg://")
    assert "sslmode=verify-full" in s.database_url
    assert "sslrootcert=/run/secrets/db_ca.crt" in s.database_url
    assert "pw" not in repr(s.data_keys) and "data_keys" not in repr(s)


@pytest.mark.parametrize(
    "override",
    [
        {"STOCKY_JWT_SECRET": ""},
        {"STOCKY_JWT_SECRET": "corto"},
        {"STOCKY_DATA_KEYS": ""},
        {"STOCKY_DATA_KEYS": "k1:" + base64.b64encode(b"x" * 16).decode()},
        {"STOCKY_DATA_KEYS": "k1:no-es-base64!"},
        {"STOCKY_EMAIL_PEPPER": ""},
        {"STOCKY_REGISTRATION_CODE": "corto"},
        {"POSTGRES_SSLMODE": "disable"},
        {"POSTGRES_HOST": ""},
        {"STOCKY_ALLOWED_HOSTS": "*"},
    ],
)
def test_production_refuses_insecure_configuration(override):
    with pytest.raises(ConfigError):
        load_settings(prod_env(**override))


def test_secrets_can_come_from_files(tmp_path):
    f = tmp_path / "jwt"
    f.write_text("y" * 40 + "\n")
    env = prod_env(STOCKY_JWT_SECRET="")
    env["STOCKY_JWT_SECRET_FILE"] = str(f)
    assert load_settings(env).jwt_secret == b"y" * 40


def test_encryption_roundtrip_and_aad_binding():
    c = DataCipher({"k1": b"\x01" * 32}, "k1")
    blob = c.encrypt(b"leche entera", "rec:h1:product:p1")
    assert b"leche" not in blob
    assert c.decrypt(blob, "rec:h1:product:p1") == b"leche entera"
    # Mismo dato en otro hogar u otra fila: no se descifra.
    with pytest.raises(DecryptionError):
        c.decrypt(blob, "rec:h2:product:p1")
    # Datos alterados: no se descifra.
    tampered = blob[:-1] + bytes([blob[-1] ^ 1])
    with pytest.raises(DecryptionError):
        c.decrypt(tampered, "rec:h1:product:p1")
    # Mismo texto, cifrados distintos (nonce aleatorio).
    assert c.encrypt(b"a", "x") != c.encrypt(b"a", "x")


def test_key_rotation():
    old = DataCipher({"k1": b"\x01" * 32}, "k1")
    blob = old.encrypt(b"dato", "aad")
    new = DataCipher({"k2": b"\x02" * 32, "k1": b"\x01" * 32}, "k2")
    assert new.decrypt(blob, "aad") == b"dato"
    assert new.needs_reencrypt(blob)
    assert not new.needs_reencrypt(new.encrypt(b"dato", "aad"))
    only_new = DataCipher({"k2": b"\x02" * 32}, "k2")
    with pytest.raises(DecryptionError):
        only_new.decrypt(blob, "aad")


def test_passwords_and_email_index():
    h = hash_password("contraseña larga 123")
    assert h.startswith("$argon2id$")
    assert verify_password(h, "contraseña larga 123")
    assert not verify_password(h, "otra")
    assert not verify_password(None, "contraseña larga 123")
    s = load_settings(prod_env())
    assert email_index(s, " Ana@Example.org ") == email_index(s, "ana@example.org")
    assert "ana" not in email_index(s, "ana@example.org")
