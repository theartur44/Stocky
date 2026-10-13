import pytest
from fastapi.testclient import TestClient

from app.config import ConfigError, load_settings
from app.main import create_app


def client(env: dict[str, str] | None = None) -> TestClient:
    return TestClient(create_app(load_settings(env or {"STOKY_ENV": "test"})))


def test_health_is_versioned_and_minimal():
    r = client().get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "api": "v1"}


def test_security_headers():
    r = client().get("/api/v1/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["Cache-Control"] == "no-store"


def test_unknown_routes_return_404():
    assert client().get("/api/v1/households").status_code == 404


def test_rejects_oversized_body():
    r = client().post("/api/v1/health", content=b"x" * 2_000_000)
    assert r.status_code == 413


def test_rejects_unexpected_host():
    c = client({"STOKY_ENV": "test", "STOKY_ALLOWED_HOSTS": "api.example.test"})
    assert c.get("/api/v1/health").status_code == 400


def test_production_hides_docs_and_sets_hsts():
    env = {"STOKY_ENV": "production", "STOKY_ALLOWED_HOSTS": "testserver"}
    c = client(env)
    assert c.get("/docs").status_code == 404
    assert c.get("/openapi.json").status_code == 404
    assert "Strict-Transport-Security" in c.get("/api/v1/health").headers


@pytest.mark.parametrize(
    "env",
    [
        {"STOKY_ENV": "production"},
        {"STOKY_ENV": "production", "STOKY_ALLOWED_HOSTS": "*"},
        {"STOKY_ENV": "staging"},
        {"STOKY_MAX_BODY_BYTES": "abc"},
    ],
)
def test_invalid_configuration_fails_fast(env):
    with pytest.raises(ConfigError):
        load_settings(env)
