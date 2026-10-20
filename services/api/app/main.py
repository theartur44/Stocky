"""Servidor de sincronización de Stocky (esqueleto, fase futura).

Solo expone `/api/v1/health`. Las rutas de autenticación, hogares y
sincronización están especificadas en `services/api/README.md` y se
implementarán en una fase posterior.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings, load_settings

API_VERSION = "v1"

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(
        title="Stocky API",
        version="0.1.0",
        # La documentación interactiva no se expone en producción.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.allowed_hosts))

    @app.middleware("http")
    async def limits_and_headers(request: Request, call_next):
        length = request.headers.get("content-length")
        if length is not None and (not length.isdigit() or int(length) > settings.max_body_bytes):
            return JSONResponse({"error": "payload_too_large"}, status_code=413)
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        if settings.is_production:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.get(f"/api/{API_VERSION}/health")
    async def health() -> dict[str, str]:
        # No revela versiones de dependencias ni detalles internos.
        return {"status": "ok", "api": API_VERSION}

    return app
