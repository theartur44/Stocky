import pytest
from fastapi.testclient import TestClient

from app.config import ConfigError, load_settings
from app.main import create_app


def client(env: dict[str, str] | None = None) -> TestClient:
    return TestClient(create_app(load_settings(env or {"STOCKY_ENV": "test"})))


def test_ready_checks_database():
    assert client().get("/api/v1/ready").json() == {"status": "ready"}


def test_health_is_versioned_and_minimal():
    r = client().get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "api": "v1", "entities": ["place", "product", "stock_lot", "shopping_list", "shopping_item"]}


def test_security_headers():
    r = client().get("/api/v1/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["Cache-Control"] == "no-store"


def test_unknown_routes_return_404():
    assert client().get("/api/v1/no-existe").status_code == 404


def test_rejects_oversized_body():
    r = client().post("/api/v1/health", content=b"x" * 2_000_000)
    assert r.status_code == 413


def test_rejects_unexpected_host():
    c = client({"STOCKY_ENV": "test", "STOCKY_ALLOWED_HOSTS": "api.example.test"})
    assert c.get("/api/v1/health").status_code == 400


def test_production_hides_docs_and_sets_hsts():
    from sqlalchemy import create_engine

    from .test_security import prod_env

    settings = load_settings(prod_env(STOCKY_ALLOWED_HOSTS="testserver"))
    c = TestClient(create_app(settings, engine=create_engine("sqlite+pysqlite:///:memory:")))
    assert c.get("/docs").status_code == 404
    assert c.get("/openapi.json").status_code == 404
    assert "Strict-Transport-Security" in c.get("/api/v1/health").headers


@pytest.mark.parametrize(
    "env",
    [
        {"STOCKY_ENV": "production"},
        {"STOCKY_ENV": "production", "STOCKY_ALLOWED_HOSTS": "*"},
        {"STOCKY_ENV": "staging"},
        {"STOCKY_MAX_BODY_BYTES": "abc"},
    ],
)
def test_invalid_configuration_fails_fast(env):
    with pytest.raises(ConfigError):
        load_settings(env)
