"""Servidor de sincronización de Stocky (FastAPI).

Rutas bajo `/api/v1`. Ver `services/api/README.md` para el contrato.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import Engine, text
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings, load_settings
from .db import make_engine, make_session_factory
from .deps import AppState
from .ratelimit import RateLimiter
from .routers import auth, households, sync
from .schemas import SYNC_ENTITIES
from .security import DataCipher, DecryptionError

API_VERSION = "v1"
PREFIX = f"/api/{API_VERSION}"

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}

log = logging.getLogger("stocky")


def create_app(settings: Settings | None = None, engine: Engine | None = None) -> FastAPI:
    settings = settings or load_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    engine = engine or make_engine(settings.database_url)
    app = FastAPI(
        title="Stocky API",
        version="0.2.0",
        # La documentación interactiva no se expone en producción.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.state.stocky = AppState(
        settings=settings,
        session_factory=make_session_factory(engine),
        cipher=DataCipher(settings.data_keys, settings.active_key_id),
        limiter=RateLimiter(),
    )
    app.state.engine = engine
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.allowed_hosts))

    @app.middleware("http")
    async def limits_and_headers(request: Request, call_next):
        length = request.headers.get("content-length")
        if length is not None and (not length.isdigit() or int(length) > settings.max_body_bytes):
            return JSONResponse({"detail": "payload_too_large"}, status_code=413)
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        if settings.is_production:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError):
        # Solo dónde y qué falla: nunca el valor recibido (podría ser una contraseña).
        errors = [{"loc": list(e.get("loc", ())), "type": e.get("type", "invalid")} for e in exc.errors()]
        return JSONResponse({"detail": errors}, status_code=422)

    @app.exception_handler(DecryptionError)
    async def _decryption_error(_request: Request, _exc: DecryptionError):
        # Clave incorrecta o datos alterados: se registra sin detalles y no se filtra nada.
        log.error("decryption_failed")
        return JSONResponse({"detail": "internal_error"}, status_code=500)

    @app.get(f"{PREFIX}/health")
    async def health() -> dict[str, object]:
        # No revela versiones ni detalles internos; solo qué tipos de datos sabe sincronizar.
        return {"status": "ok", "api": API_VERSION, "entities": list(SYNC_ENTITIES)}

    @app.get(f"{PREFIX}/ready")
    def ready() -> JSONResponse:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        except Exception:
            return JSONResponse({"status": "unavailable"}, status_code=503)
        return JSONResponse({"status": "ready"})

    app.include_router(auth.router, prefix=PREFIX)
    app.include_router(households.router, prefix=PREFIX)
    app.include_router(sync.router, prefix=PREFIX)
    return app
