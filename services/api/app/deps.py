"""Dependencias comunes: estado de la app, sesión de BD, autenticación y hogar."""

from __future__ import annotations

import logging
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from .config import Settings
from .models import DeviceSession, Household, Membership, User
from .ratelimit import RateLimiter
from .security import DataCipher, decode_access_token

security_log = logging.getLogger("stocky.security")


@dataclass
class AppState:
    settings: Settings
    session_factory: sessionmaker[Session]
    cipher: DataCipher
    limiter: RateLimiter


def get_state(request: Request) -> AppState:
    return request.app.state.stocky


def get_db(state: AppState = Depends(get_state)) -> Iterator[Session]:
    with state.session_factory() as session:
        yield session


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit(state: AppState, key: str, limit: int, window_seconds: float) -> None:
    wait = state.limiter.hit(key, limit, window_seconds)
    if wait is not None:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="too_many_requests",
            headers={"Retry-After": str(int(wait))},
        )


_bearer = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    user: User
    session: DeviceSession


def get_auth(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
) -> AuthContext:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail="unauthorized", headers={"WWW-Authenticate": "Bearer"}
    )
    if creds is None or creds.scheme.lower() != "bearer":
        raise unauthorized
    decoded = decode_access_token(state.settings, creds.credentials)
    if decoded is None:
        raise unauthorized
    user_id, session_id = decoded
    # La sesión se comprueba en cada petición: revocar un dispositivo corta su acceso al momento.
    sess = db.get(DeviceSession, session_id)
    if sess is None or sess.user_id != user_id or sess.revoked_at is not None:
        raise unauthorized
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    sess.last_used_at = datetime.now(UTC)
    db.commit()
    return AuthContext(user=user, session=sess)


@dataclass
class HouseholdContext:
    auth: AuthContext
    membership: Membership
    household: Household


def get_household(auth: AuthContext = Depends(get_auth), db: Session = Depends(get_db)) -> HouseholdContext:
    """El hogar se deduce SIEMPRE del usuario autenticado, nunca de la petición."""
    m = db.scalar(select(Membership).where(Membership.user_id == auth.user.id))
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="no_household")
    h = db.get(Household, m.household_id)
    if h is None:  # pragma: no cover - integridad referencial
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="no_household")
    return HouseholdContext(auth=auth, membership=m, household=h)


def require_role(*roles: str):
    def check(ctx: HouseholdContext = Depends(get_household)) -> HouseholdContext:
        if ctx.membership.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")
        return ctx

    return check
