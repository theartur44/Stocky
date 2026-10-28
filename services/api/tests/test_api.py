import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.cli import purge_db
from app.models import DeviceSession, SyncRecord, User
from .conftest import PASSWORD, REG_CODE


def lot(qty=1000, name="Leche"):
    return {"productName": name, "quantityMilli": qty, "unit": "l", "expiryDate": "2026-11-01"}


def upsert(entity_id, data, entity="stock_lot", base_rev=None):
    return {"op_id": str(uuid.uuid4()), "entity": entity, "entity_id": str(entity_id), "kind": "upsert", "data": data, "base_rev": base_rev}


# ------------------------------------------------------------------ cuentas


def test_registration_requires_code(client):
    body = {"email": "a@example.org", "password": PASSWORD}
    assert client.post("/api/v1/auth/register", json=body).status_code == 403
    assert client.post("/api/v1/auth/register", json={**body, "registration_code": "malo"}).status_code == 403
    assert client.post("/api/v1/auth/register", json={**body, "registration_code": REG_CODE}).status_code == 201


def test_weak_password_and_unknown_fields_are_rejected(client):
    base = {"email": "b@example.org", "registration_code": REG_CODE}
    weak = client.post("/api/v1/auth/register", json={**base, "password": "corta"})
    assert weak.status_code == 422
    # El error dice qué campo falla, pero no devuelve la contraseña recibida.
    assert "corta" not in weak.text and weak.json()["detail"][0]["loc"][-1] == "password"
    assert client.post("/api/v1/auth/register", json={**base, "password": PASSWORD, "is_admin": True}).status_code == 422


def test_email_is_stored_encrypted(api, app):
    a = api("Secreto@Example.org")
    with app.state.stocky.session_factory() as db:
        u = db.scalar(select(User))
        assert b"secreto" not in u.email_enc.lower()
        assert "secreto" not in u.email_index
    assert a.get("/me").json()["email"] == "secreto@example.org"


def test_login_errors_do_not_reveal_accounts(api, client):
    a = api()
    wrong = client.post("/api/v1/auth/login", json={"email": a.email, "password": "incorrecta"})
    unknown = client.post("/api/v1/auth/login", json={"email": "nadie@example.org", "password": "incorrecta"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    ok = client.post("/api/v1/auth/login", json={"email": a.email.upper(), "password": PASSWORD})
    assert ok.status_code == 200


def test_duplicate_registration_is_generic(api, client):
    a = api()
    r = client.post("/api/v1/auth/register", json={"email": a.email, "password": PASSWORD, "registration_code": REG_CODE})
    assert r.status_code == 400 and r.json()["detail"] == "registration_failed"


def test_login_is_rate_limited(api, client):
    a = api()
    codes = [client.post("/api/v1/auth/login", json={"email": a.email, "password": "mal"}).status_code for _ in range(10)]
    assert 429 in codes
    r = client.post("/api/v1/auth/login", json={"email": a.email, "password": "mal"})
    assert r.status_code == 429 and "Retry-After" in r.headers


def test_refresh_rotates_and_detects_reuse(api, client):
    a = api()
    first = a.tokens["refresh_token"]
    r1 = client.post("/api/v1/auth/refresh", json={"refresh_token": first})
    assert r1.status_code == 200
    second = r1.json()
    # Reutilizar el token ya rotado (como haría un atacante) revoca la sesión entera.
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": first}).status_code == 401
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": second["refresh_token"]}).status_code == 401
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {second['access_token']}"}).status_code == 401


def test_logout_and_device_revocation_take_effect_immediately(api, client):
    a = api()
    phone2 = client.post("/api/v1/auth/login", json={"email": a.email, "password": PASSWORD, "device_name": "Tablet"}).json()
    devices = a.get("/devices").json()
    assert {d["name"] for d in devices} == {"Móvil de prueba", "Tablet"}
    assert a.delete(f"/devices/{phone2['session_id']}").status_code == 204
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {phone2['access_token']}"}).status_code == 401
    assert a.post("/auth/logout").status_code == 204
    assert a.get("/me").status_code == 401


def test_cannot_revoke_other_users_devices(api):
    a, b = api(), api()
    assert b.delete(f"/devices/{a.tokens['session_id']}").status_code == 404
    assert a.get("/me").status_code == 200


def test_invalid_tokens_are_rejected(client):
    for h in ["Bearer basura", "Bearer ", "Basic abc"]:
        assert client.get("/api/v1/me", headers={"Authorization": h}).status_code == 401
    assert client.get("/api/v1/me").status_code == 401


def test_change_password_closes_other_sessions(api, client):
    a = api()
    other = client.post("/api/v1/auth/login", json={"email": a.email, "password": PASSWORD}).json()
    r = a.post("/auth/change-password", json={"current_password": PASSWORD, "new_password": "otra-contraseña-larga"})
    assert r.status_code == 204
    assert a.get("/me").status_code == 200
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {other['access_token']}"}).status_code == 401


# ------------------------------------------------------------------ hogares


def setup_household(api):
    owner = api()
    assert owner.post("/households", json={"name": "Casa"}).status_code == 201
    return owner


def invite_and_join(owner, other, role="member"):
    code = owner.post("/households/current/invitations", json={"role": role}).json()["code"]
    r = other.post("/households/join", json={"code": code.lower()})
    assert r.status_code == 200, r.text
    return code


def test_invitation_is_single_use_and_expires(api, app):
    owner, b, c = setup_household(api), api(), api()
    code = invite_and_join(owner, b)
    assert c.post("/households/join", json={"code": code}).status_code == 404
    code2 = owner.post("/households/current/invitations", json={}).json()["code"]
    from app.models import Invitation

    with app.state.stocky.session_factory() as db:
        db.execute(update(Invitation).values(expires_at=datetime.now(UTC) - timedelta(minutes=1)))
        db.commit()
    assert c.post("/households/join", json={"code": code2}).status_code == 404


def test_only_owner_manages_members(api):
    owner, member = setup_household(api), api()
    invite_and_join(owner, member)
    assert member.post("/households/current/invitations", json={}).status_code == 403
    assert member.delete(f"/households/current/members/{owner.get('/me').json()['user_id']}").status_code == 403
    members = owner.get("/households/current/members").json()
    assert len(members) == 2
    # Cada miembro se reconoce por su correo (solo dentro del hogar).
    assert sorted(m["email"] for m in members) == sorted([owner.email, member.email])
    assert [m["me"] for m in members if m["email"] == owner.email] == [True]


def test_viewer_cannot_write(api):
    owner, viewer = setup_household(api), api()
    invite_and_join(owner, viewer, role="viewer")
    assert viewer.post("/sync/push", json={"ops": [upsert(uuid.uuid4(), lot())]}).status_code == 403
    assert viewer.get("/sync/pull").status_code == 200


def test_removed_member_loses_access(api):
    owner, member = setup_household(api), api()
    invite_and_join(owner, member)
    uid = member.get("/me").json()["user_id"]
    assert owner.delete(f"/households/current/members/{uid}").status_code == 204
    assert member.get("/sync/pull").status_code == 404


def test_households_are_isolated(api):
    a, b = setup_household(api), setup_household(api)
    lot_id = uuid.uuid4()
    a.post("/sync/push", json={"ops": [upsert(lot_id, lot(name="Secreto de A"))]})
    # B no ve nada de A…
    assert b.get("/sync/pull").json()["changes"] == []
    # …y escribir el mismo id en su hogar no toca el registro de A.
    b.post("/sync/push", json={"ops": [upsert(lot_id, lot(name="De B"))]})
    assert [c["data"]["productName"] for c in a.get("/sync/pull").json()["changes"]] == ["Secreto de A"]
    assert [c["data"]["productName"] for c in b.get("/sync/pull").json()["changes"]] == ["De B"]


def test_moving_ciphertext_between_households_fails(api, app):
    a, b = setup_household(api), setup_household(api)
    lot_id = uuid.uuid4()
    a.post("/sync/push", json={"ops": [upsert(lot_id, lot())]})
    b.post("/sync/push", json={"ops": [upsert(lot_id, lot(name="B"))]})
    with app.state.stocky.session_factory() as db:
        recs = db.scalars(select(SyncRecord)).all()
        ra = next(r for r in recs if r.household_id != recs[0].household_id or r is recs[0])
        rb = next(r for r in recs if r.household_id != ra.household_id)
        rb.data_enc = ra.data_enc  # un atacante con acceso a la BD copia el dato cifrado
        db.commit()
    r = b.get("/sync/pull")
    assert r.status_code == 500 and r.json() == {"detail": "internal_error"}


# ------------------------------------------------------------------ sincronización


def test_push_pull_and_idempotency(api, app):
    owner = setup_household(api)
    lot_id = uuid.uuid4()
    op = upsert(lot_id, lot())
    r1 = owner.post("/sync/push", json={"ops": [op]}).json()
    r2 = owner.post("/sync/push", json={"ops": [op]}).json()
    assert r1["results"][0]["status"] == "applied"
    assert r2["results"][0]["status"] == "duplicate"
    assert r1["rev"] == r2["rev"] == 1
    pull = owner.get("/sync/pull", params={"since": 0}).json()
    assert pull["changes"][0]["data"]["productName"] == "Leche"
    assert owner.get("/sync/pull", params={"since": 1}).json()["changes"] == []
    with app.state.stocky.session_factory() as db:
        assert b"Leche" not in db.scalar(select(SyncRecord)).data_enc


def test_conflict_on_stale_base_rev(api):
    owner = setup_household(api)
    lot_id = uuid.uuid4()
    owner.post("/sync/push", json={"ops": [upsert(lot_id, lot())]})
    owner.post("/sync/push", json={"ops": [upsert(lot_id, lot(name="v2"), base_rev=1)]})
    stale = owner.post("/sync/push", json={"ops": [upsert(lot_id, lot(name="v-antigua"), base_rev=1)]}).json()
    assert stale["results"][0]["status"] == "conflict"


def test_concurrent_quantity_adjustments_are_not_lost(api):
    owner, member = setup_household(api), api()
    invite_and_join(owner, member)
    lot_id = uuid.uuid4()
    owner.post("/sync/push", json={"ops": [upsert(lot_id, lot(qty=3000))]})
    adj = lambda d: {"op_id": str(uuid.uuid4()), "entity": "stock_lot", "entity_id": str(lot_id), "kind": "adjust_quantity", "delta_milli": d}
    owner.post("/sync/push", json={"ops": [adj(-1000)]})
    member.post("/sync/push", json={"ops": [adj(-500)]})
    data = owner.get("/sync/pull").json()["changes"][-1]["data"]
    assert data["quantityMilli"] == 1500
    owner.post("/sync/push", json={"ops": [adj(-9000)]})
    last = owner.get("/sync/pull").json()["changes"][-1]
    assert last["deleted"] is True and last["data"] is None


def test_delete_creates_tombstone_and_purge(api, app):
    owner = setup_household(api)
    lot_id = uuid.uuid4()
    owner.post("/sync/push", json={"ops": [upsert(lot_id, lot())]})
    owner.post("/sync/push", json={"ops": [{"op_id": str(uuid.uuid4()), "entity": "stock_lot", "entity_id": str(lot_id), "kind": "delete"}]})
    assert owner.get("/sync/pull").json()["changes"][-1]["deleted"] is True
    with app.state.stocky.session_factory() as db:
        db.execute(update(SyncRecord).values(updated_at=datetime.now(UTC) - timedelta(days=100)))
        db.commit()
        assert purge_db(db, datetime.now(UTC))[3] == 1
    # Quien se quedó entre medias debe resincronizar todo…
    assert owner.get("/sync/pull", params={"since": 1}).status_code == 410
    # …y la descarga completa (p. ej. un móvil que acaba de unirse) siempre funciona.
    full = owner.get("/sync/pull", params={"since": 0})
    assert full.status_code == 200 and full.json()["changes"] == []
    assert owner.get("/sync/pull", params={"since": 2}).status_code == 200


def test_rejects_invalid_operations(api):
    owner = setup_household(api)
    big = upsert(uuid.uuid4(), {"x": "a" * 20_000})
    assert owner.post("/sync/push", json={"ops": [big]}).json()["results"][0]["status"] == "rejected"
    bad_entity = {**upsert(uuid.uuid4(), lot()), "entity": "users"}
    assert owner.post("/sync/push", json={"ops": [bad_entity]}).status_code == 422
    adj_missing = {"op_id": str(uuid.uuid4()), "entity": "stock_lot", "entity_id": str(uuid.uuid4()), "kind": "adjust_quantity", "delta_milli": -1}
    assert owner.post("/sync/push", json={"ops": [adj_missing]}).json()["results"][0]["reason"] == "not_found"
    assert owner.post("/sync/push", json={"ops": []}).status_code == 422


def test_pull_pagination(api):
    owner = setup_household(api)
    owner.post("/sync/push", json={"ops": [upsert(uuid.uuid4(), lot(name=f"P{i}")) for i in range(5)]})
    p1 = owner.get("/sync/pull", params={"since": 0, "limit": 2}).json()
    assert len(p1["changes"]) == 2 and p1["has_more"] and p1["next"] == 2
    p3 = owner.get("/sync/pull", params={"since": 4, "limit": 2}).json()
    assert len(p3["changes"]) == 1 and not p3["has_more"]


def test_export_and_delete_household(api, app):
    owner = setup_household(api)
    owner.post("/sync/push", json={"ops": [upsert(uuid.uuid4(), lot())]})
    exp = owner.get("/households/current/export")
    assert exp.status_code == 200 and exp.json()["entities"]["stock_lot"][0]["data"]["productName"] == "Leche"
    assert owner.delete("/households/current").status_code == 204
    with app.state.stocky.session_factory() as db:
        assert db.scalars(select(SyncRecord)).all() == []


def test_delete_account_removes_data(api, app):
    owner = setup_household(api)
    owner.post("/sync/push", json={"ops": [upsert(uuid.uuid4(), lot())]})
    assert owner.delete("/account", json={"password": "mal"}).status_code == 401
    assert owner.delete("/account", json={"password": PASSWORD}).status_code == 204
    with app.state.stocky.session_factory() as db:
        assert db.scalars(select(User)).all() == []
        assert db.scalars(select(DeviceSession)).all() == []
        assert db.scalars(select(SyncRecord)).all() == []


def test_household_record_quota(api, monkeypatch):
    from app.routers import sync

    monkeypatch.setattr(sync, "MAX_HOUSEHOLD_RECORDS", 2)
    owner = setup_household(api)
    first = uuid.uuid4()
    res = owner.post("/sync/push", json={"ops": [upsert(first, lot()), upsert(uuid.uuid4(), lot()), upsert(uuid.uuid4(), lot())]}).json()
    assert [r["status"] for r in res["results"]] == ["applied", "applied", "rejected"]
    assert res["results"][2]["reason"] == "quota_exceeded"
    # Lo que ya existe se puede seguir editando y borrando.
    assert owner.post("/sync/push", json={"ops": [upsert(first, lot(name="v2"))]}).json()["results"][0]["status"] == "applied"


def test_sync_is_rate_limited_per_user(api):
    owner = setup_household(api)
    codes = [owner.post("/sync/push", json={"ops": [upsert(uuid.uuid4(), lot())]}).status_code for _ in range(121)]
    assert codes[:120] == [200] * 120 and codes[120] == 429
