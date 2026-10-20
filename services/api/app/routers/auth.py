"""Cuentas, sesiones y dispositivos."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import as_utc
from ..deps import AppState, AuthContext, client_ip, get_auth, get_db, get_state, rate_limit, security_log
from ..models import DeviceSession, Household, Membership, User
from ..schemas import (
    ChangePasswordRequest,
    Credentials,
    DeleteAccountRequest,
    DeviceOut,
    Me,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
)
from ..security import (
    constant_time_equals,
    create_access_token,
    email_index,
    hash_password,
    new_opaque_token,
    password_needs_rehash,
    token_digest,
    verify_password,
)

router = APIRouter(tags=["auth"])

INVALID_CREDENTIALS = HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")


def _open_session(state: AppState, db: Session, user: User, device_name: str) -> TokenPair:
    refresh = new_opaque_token()
    sess = DeviceSession(
        id=uuid.uuid4(),
        user_id=user.id,
        name_enc=b"",
        refresh_hash=token_digest(refresh),
        refresh_expires_at=datetime.now(UTC) + timedelta(days=state.settings.refresh_token_days),
    )
    sess.name_enc = state.cipher.encrypt_text(device_name, f"device:{sess.id}")
    db.add(sess)
    db.commit()
    access, ttl = create_access_token(state.settings, user.id, sess.id)
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=ttl, session_id=sess.id)


@router.post("/auth/register", status_code=status.HTTP_201_CREATED, response_model=TokenPair)
def register(
    body: RegisterRequest,
    request: Request,
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
) -> TokenPair:
    rate_limit(state, f"register:{client_ip(request)}", limit=5, window_seconds=3600)
    s = state.settings
    if s.registration_mode == "closed":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="registration_closed")
    if s.registration_mode == "invite_code":
        if not s.registration_code or not body.registration_code or not constant_time_equals(
            body.registration_code, s.registration_code
        ):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="invalid_registration_code")

    user = User(id=uuid.uuid4(), email_index=email_index(s, body.email), email_enc=b"", password_hash=hash_password(body.password))
    user.email_enc = state.cipher.encrypt_text(body.email, f"email:{user.id}")
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Mensaje genérico: no confirma si el correo ya existe.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="registration_failed") from None
    security_log.info("account_created user=%s", user.id)
    return _open_session(state, db, user, body.device_name)


@router.post("/auth/login", response_model=TokenPair)
def login(
    body: Credentials,
    request: Request,
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
) -> TokenPair:
    idx = email_index(state.settings, body.email)
    rate_limit(state, f"login-ip:{client_ip(request)}", limit=20, window_seconds=600)
    rate_limit(state, f"login-account:{idx}", limit=8, window_seconds=600)
    user = db.scalar(select(User).where(User.email_index == idx))
    # Se verifica siempre (con un hash ficticio si no existe) para igualar tiempos.
    if not verify_password(user.password_hash if user else None, body.password) or user is None:
        security_log.warning("login_failed")
        raise INVALID_CREDENTIALS
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    security_log.info("login_ok user=%s", user.id)
    return _open_session(state, db, user, body.device_name)


@router.post("/auth/refresh", response_model=TokenPair)
def refresh(
    body: RefreshRequest,
    request: Request,
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
) -> TokenPair:
    rate_limit(state, f"refresh:{client_ip(request)}", limit=60, window_seconds=600)
    digest = token_digest(body.refresh_token)
    sess = db.scalar(select(DeviceSession).where(DeviceSession.refresh_hash == digest))
    if sess is None:
        # ¿Es un token ya rotado? Si alguien lo reutiliza, probablemente lo han robado:
        # se revoca la sesión entera para proteger al usuario.
        reused = db.scalar(select(DeviceSession).where(DeviceSession.previous_refresh_hash == digest))
        if reused is not None and reused.revoked_at is None:
            reused.revoked_at = datetime.now(UTC)
            db.commit()
            security_log.warning("refresh_token_reuse session=%s", reused.id)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_refresh_token")
    now = datetime.now(UTC)
    if sess.revoked_at is not None or as_utc(sess.refresh_expires_at) <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid_refresh_token")
    new_refresh = new_opaque_token()
    sess.previous_refresh_hash = digest
    sess.refresh_hash = token_digest(new_refresh)
    sess.refresh_expires_at = now + timedelta(days=state.settings.refresh_token_days)
    sess.last_used_at = now
    db.commit()
    access, ttl = create_access_token(state.settings, sess.user_id, sess.id)
    return TokenPair(access_token=access, refresh_token=new_refresh, expires_in=ttl, session_id=sess.id)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(auth: AuthContext = Depends(get_auth), db: Session = Depends(get_db)) -> Response:
    auth.session.revoked_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=Me)
def me(auth: AuthContext = Depends(get_auth), state: AppState = Depends(get_state), db: Session = Depends(get_db)) -> Me:
    m = db.scalar(select(Membership).where(Membership.user_id == auth.user.id))
    return Me(
        user_id=auth.user.id,
        email=state.cipher.decrypt_text(auth.user.email_enc, f"email:{auth.user.id}"),
        household_id=m.household_id if m else None,
        role=m.role if m else None,
    )


@router.post("/auth/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    state: AppState = Depends(get_state),
    auth: AuthContext = Depends(get_auth),
    db: Session = Depends(get_db),
) -> Response:
    rate_limit(state, f"change-password:{auth.user.id}", limit=5, window_seconds=600)
    if not verify_password(auth.user.password_hash, body.current_password):
        raise INVALID_CREDENTIALS
    now = datetime.now(UTC)
    auth.user.password_hash = hash_password(body.new_password)
    auth.user.password_changed_at = now
    # Se cierran las demás sesiones: si la contraseña estaba comprometida, se corta el acceso.
    for s in db.scalars(select(DeviceSession).where(DeviceSession.user_id == auth.user.id, DeviceSession.id != auth.session.id)):
        s.revoked_at = s.revoked_at or now
    db.commit()
    security_log.info("password_changed user=%s", auth.user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    body: DeleteAccountRequest,
    state: AppState = Depends(get_state),
    auth: AuthContext = Depends(get_auth),
    db: Session = Depends(get_db),
) -> Response:
    """Borra la cuenta. Si era el único propietario de su hogar, borra también el hogar."""
    rate_limit(state, f"delete-account:{auth.user.id}", limit=5, window_seconds=600)
    if not verify_password(auth.user.password_hash, body.password):
        raise INVALID_CREDENTIALS
    m = db.scalar(select(Membership).where(Membership.user_id == auth.user.id))
    if m is not None and m.role == "owner":
        owners = db.scalars(select(Membership).where(Membership.household_id == m.household_id, Membership.role == "owner")).all()
        if len(owners) == 1:
            db.execute(delete(Household).where(Household.id == m.household_id))
    db.execute(delete(User).where(User.id == auth.user.id))
    db.commit()
    security_log.info("account_deleted user=%s", auth.user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/devices", response_model=list[DeviceOut])
def devices(auth: AuthContext = Depends(get_auth), state: AppState = Depends(get_state), db: Session = Depends(get_db)) -> list[DeviceOut]:
    rows = db.scalars(
        select(DeviceSession)
        .where(DeviceSession.user_id == auth.user.id, DeviceSession.revoked_at.is_(None))
        .order_by(DeviceSession.created_at)
    )
    return [
        DeviceOut(
            id=s.id,
            name=state.cipher.decrypt_text(s.name_enc, f"device:{s.id}"),
            created_at=as_utc(s.created_at).isoformat(),
            last_used_at=as_utc(s.last_used_at).isoformat(),
            current=s.id == auth.session.id,
        )
        for s in rows
    ]


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_device(device_id: uuid.UUID, auth: AuthContext = Depends(get_auth), db: Session = Depends(get_db)) -> Response:
    s = db.get(DeviceSession, device_id)
    # Un dispositivo ajeno se trata como inexistente.
    if s is None or s.user_id != auth.user.id or s.revoked_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    s.revoked_at = datetime.now(UTC)
    db.commit()
    security_log.info("device_revoked user=%s", auth.user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
