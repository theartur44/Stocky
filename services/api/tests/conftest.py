import base64
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.config import load_settings
from app.db import make_engine
from app.main import create_app
from app.models import Base

REG_CODE = "codigo-de-registro-de-prueba"
PASSWORD = "contraseña-muy-segura-123"  # secret-scan: ignore (dato ficticio de pruebas)


def make_env(**extra: str) -> dict[str, str]:
    env = {
        "STOCKY_ENV": "test",
        "STOCKY_REGISTRATION": "invite_code",
        "STOCKY_REGISTRATION_CODE": REG_CODE,
        "STOCKY_DATA_KEYS": "k1:" + base64.b64encode(b"\x01" * 32).decode(),
    }
    env.update(extra)
    return env


@pytest.fixture
def engine():
    # Con STOCKY_TEST_DATABASE_URL las pruebas usan PostgreSQL real (p. ej. con TLS).
    url = os.environ.get("STOCKY_TEST_DATABASE_URL")
    eng = make_engine(url) if url else create_engine(
        "sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    if not url:
        from sqlalchemy import event

        @event.listens_for(eng, "connect")
        def _fk(conn, _):
            conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def app(engine):
    return create_app(load_settings(make_env()), engine=engine)


@pytest.fixture
def client(app):
    return TestClient(app)


class Api:
    """Ayudante: un usuario con su sesión."""

    def __init__(self, client: TestClient, email: str | None = None):
        self.client = client
        self.email = email or f"user-{uuid.uuid4().hex[:8]}@example.org"
        r = client.post(
            "/api/v1/auth/register",
            json={"email": self.email, "password": PASSWORD, "device_name": "Móvil de prueba", "registration_code": REG_CODE},
        )
        assert r.status_code == 201, r.text
        self.tokens = r.json()

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.tokens['access_token']}"}

    def get(self, path: str, **kw):
        return self.client.get(f"/api/v1{path}", headers=self.headers, **kw)

    def post(self, path: str, json=None, **kw):
        return self.client.post(f"/api/v1{path}", json=json, headers=self.headers, **kw)

    def patch(self, path: str, json=None):
        return self.client.patch(f"/api/v1{path}", json=json, headers=self.headers)

    def delete(self, path: str, json=None):
        return self.client.request("DELETE", f"/api/v1{path}", json=json, headers=self.headers)


@pytest.fixture
def api(client):
    return lambda email=None: Api(client, email)
