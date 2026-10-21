"""Verificación en dos pasos (TOTP + códigos de recuperación) y política de contraseñas."""

from datetime import UTC, datetime

from sqlalchemy import select

from app.models import RecoveryCode, User
from app.security import password_problem, totp_code, verify_totp

from .conftest import PASSWORD, REG_CODE


def now_code(secret: str) -> str:
    return totp_code(secret, int(datetime.now(UTC).timestamp()) // 30)


def enable_mfa(a) -> tuple[str, list[str]]:
    setup = a.post("/auth/mfa/setup").json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/Stocky%3A")
    r = a.post("/auth/mfa/enable", json={"code": now_code(setup["secret"])})
    assert r.status_code == 200, r.text
    return setup["secret"], r.json()["recovery_codes"]


def test_totp_matches_rfc6238_vectors():
    # RFC 6238, apéndice B (SHA-1, secreto «12345678901234567890»), últimas 6 cifras.
    import base64

    secret = base64.b32encode(b"12345678901234567890").decode()
    assert totp_code(secret, 59 // 30) == "287082"
    assert totp_code(secret, 1111111109 // 30) == "081804"
    assert totp_code(secret, 2000000000 // 30) == "279037"
    t = datetime.fromtimestamp(59, UTC)
    assert verify_totp(secret, "287 082", t, None) == 1
    # Un código ya usado no vale otra vez.
    assert verify_totp(secret, "287082", t, 1) is None


def test_login_requires_second_step_once_enabled(api, client):
    a = api()
    secret, _ = enable_mfa(a)
    assert a.get("/me").json()["mfa_enabled"] is True

    r = client.post("/api/v1/auth/login", json={"email": a.email, "password": PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["mfa_required"] is True and "access_token" not in body
    # El token intermedio no sirve para usar la API.
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {body['mfa_token']}"}).status_code == 401

    bad = client.post("/api/v1/auth/login/mfa", json={"mfa_token": body["mfa_token"], "code": "000000"})
    assert bad.status_code == 401 and bad.json()["detail"] == "invalid_mfa_code"


def test_recovery_codes_work_once_and_are_stored_hashed(api, client, app):
    a = api()
    _, codes = enable_mfa(a)
    assert len(codes) == 10 and len(set(codes)) == 10
    with app.state.stocky.session_factory() as db:
        stored = {r.code_hash for r in db.scalars(select(RecoveryCode))}
        assert not any(c in stored or c.replace("-", "") in stored for c in codes)
        assert db.scalar(select(User)).totp_secret_enc is not None

    def login_with(code: str):
        token = client.post("/api/v1/auth/login", json={"email": a.email, "password": PASSWORD}).json()["mfa_token"]
        return client.post("/api/v1/auth/login/mfa", json={"mfa_token": token, "code": code})

    first = login_with(codes[0].lower())
    assert first.status_code == 200 and "access_token" in first.json()
    assert login_with(codes[0]).status_code == 401


def test_second_step_is_rate_limited(api, client):
    a = api()
    enable_mfa(a)
    token = client.post("/api/v1/auth/login", json={"email": a.email, "password": PASSWORD}).json()["mfa_token"]
    statuses = [client.post("/api/v1/auth/login/mfa", json={"mfa_token": token, "code": "123456"}).status_code for _ in range(7)]
    assert 429 in statuses


def test_enabling_mfa_closes_other_sessions(api, client):
    a = api()
    other = client.post("/api/v1/auth/login", json={"email": a.email, "password": PASSWORD}).json()
    enable_mfa(a)
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {other['access_token']}"}).status_code == 401
    assert a.get("/me").status_code == 200


def test_disable_requires_password_and_code(api, client):
    a = api()
    secret, codes = enable_mfa(a)
    assert a.post("/auth/mfa/disable", json={"password": "mal", "code": codes[1]}).status_code == 401
    assert a.post("/auth/mfa/disable", json={"password": PASSWORD, "code": "000000"}).status_code == 401
    assert a.post("/auth/mfa/disable", json={"password": PASSWORD, "code": codes[1]}).status_code == 204
    assert a.get("/me").json()["mfa_enabled"] is False
    r = client.post("/api/v1/auth/login", json={"email": a.email, "password": PASSWORD})
    assert "access_token" in r.json()


def test_enable_rejects_wrong_code_and_double_enable(api):
    a = api()
    assert a.post("/auth/mfa/enable", json={"code": "123456"}).json()["detail"] == "mfa_not_started"
    a.post("/auth/mfa/setup")
    assert a.post("/auth/mfa/enable", json={"code": "000000"}).status_code == 400
    enable_mfa(a)
    assert a.post("/auth/mfa/setup").status_code == 409


def test_delete_account_requires_code_when_enabled(api):
    a = api()
    _, codes = enable_mfa(a)
    assert a.delete("/account", json={"password": PASSWORD}).status_code == 401
    assert a.delete("/account", json={"password": PASSWORD, "code": codes[2]}).status_code == 204


def test_password_policy(client):
    assert password_problem("corta") == "too_short"
    assert password_problem("Password1234") == "too_common"
    assert password_problem("aaaaaaaabbbb") == "too_common"
    assert password_problem("maria.garcia-2026!", "maria.garcia@example.org") == "contains_email"
    assert password_problem(PASSWORD) is None
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "pepe.perez@example.org", "password": "pepe.perez-12345", "registration_code": REG_CODE},
    )
    assert r.status_code == 422
