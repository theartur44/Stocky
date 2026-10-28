"""Hogares, miembros e invitaciones."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..db import as_utc
from ..deps import (
    AppState,
    AuthContext,
    HouseholdContext,
    client_ip,
    get_auth,
    get_db,
    get_household,
    get_state,
    rate_limit,
    require_role,
    security_log,
)
from ..models import Household, Invitation, Membership, SyncRecord, User
from ..schemas import (
    HouseholdCreate,
    HouseholdOut,
    InvitationCreate,
    InvitationOut,
    JoinRequest,
    MemberOut,
    MemberUpdate,
)
from ..security import new_invitation_code, normalize_code, token_digest

router = APIRouter(prefix="/households", tags=["households"])


def _out(state: AppState, db: Session, h: Household, role: str) -> HouseholdOut:
    members = db.scalar(select(func.count()).select_from(Membership).where(Membership.household_id == h.id)) or 0
    return HouseholdOut(
        id=h.id,
        name=state.cipher.decrypt_text(h.name_enc, f"household:{h.id}"),
        role=role,
        rev=h.rev,
        members=members,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=HouseholdOut)
def create_household(
    body: HouseholdCreate,
    auth: AuthContext = Depends(get_auth),
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
) -> HouseholdOut:
    if db.scalar(select(Membership).where(Membership.user_id == auth.user.id)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="already_in_household")
    h = Household(id=uuid.uuid4(), name_enc=b"", rev=0, purged_rev=0)
    h.name_enc = state.cipher.encrypt_text(body.name, f"household:{h.id}")
    db.add(h)
    db.flush()
    db.add(Membership(user_id=auth.user.id, household_id=h.id, role="owner"))
    db.commit()
    return _out(state, db, h, "owner")


@router.get("/current", response_model=HouseholdOut)
def current(ctx: HouseholdContext = Depends(get_household), state: AppState = Depends(get_state), db: Session = Depends(get_db)) -> HouseholdOut:
    return _out(state, db, ctx.household, ctx.membership.role)


@router.patch("/current", response_model=HouseholdOut)
def rename(
    body: HouseholdCreate,
    ctx: HouseholdContext = Depends(require_role("owner")),
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
) -> HouseholdOut:
    ctx.household.name_enc = state.cipher.encrypt_text(body.name, f"household:{ctx.household.id}")
    db.commit()
    return _out(state, db, ctx.household, ctx.membership.role)


@router.delete("/current", status_code=status.HTTP_204_NO_CONTENT)
def delete_household(ctx: HouseholdContext = Depends(require_role("owner")), db: Session = Depends(get_db)) -> Response:
    """Borra el hogar y TODOS sus datos sincronizados."""
    db.execute(delete(Household).where(Household.id == ctx.household.id))
    db.commit()
    security_log.info("household_deleted household=%s", ctx.household.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/current/invitations", status_code=status.HTTP_201_CREATED, response_model=InvitationOut)
def invite(
    body: InvitationCreate,
    ctx: HouseholdContext = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> InvitationOut:
    code = new_invitation_code()
    expires = datetime.now(UTC) + timedelta(hours=body.hours_valid)
    db.add(
        Invitation(
            household_id=ctx.household.id,
            code_hash=token_digest(code),
            role=body.role,
            created_by=ctx.auth.user.id,
            expires_at=expires,
        )
    )
    db.commit()
    # El código solo se muestra ahora: en la base de datos se guarda su hash.
    return InvitationOut(code=f"{code[:4]}-{code[4:8]}-{code[8:]}", role=body.role, expires_at=expires.isoformat())


@router.post("/join", response_model=HouseholdOut)
def join(
    body: JoinRequest,
    request: Request,
    auth: AuthContext = Depends(get_auth),
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
) -> HouseholdOut:
    rate_limit(state, f"join-ip:{client_ip(request)}", limit=10, window_seconds=3600)
    rate_limit(state, f"join-user:{auth.user.id}", limit=10, window_seconds=3600)
    if db.scalar(select(Membership).where(Membership.user_id == auth.user.id)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="already_in_household")
    inv = db.scalar(select(Invitation).where(Invitation.code_hash == token_digest(normalize_code(body.code))))
    now = datetime.now(UTC)
    if inv is None or inv.used_at is not None or as_utc(inv.expires_at) <= now:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="invalid_invitation")
    inv.used_at = now
    db.add(Membership(user_id=auth.user.id, household_id=inv.household_id, role=inv.role))
    db.commit()
    security_log.info("household_joined user=%s household=%s", auth.user.id, inv.household_id)
    h = db.get(Household, inv.household_id)
    assert h is not None
    return _out(state, db, h, inv.role)


@router.post("/current/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave(ctx: HouseholdContext = Depends(get_household), db: Session = Depends(get_db)) -> Response:
    if ctx.membership.role == "owner":
        owners = db.scalar(
            select(func.count()).select_from(Membership).where(Membership.household_id == ctx.household.id, Membership.role == "owner")
        )
        if owners == 1:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="last_owner")
    db.delete(ctx.membership)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _member_out(state: AppState, db: Session, m: Membership, me: bool) -> MemberOut:
    user = db.get(User, m.user_id)
    email = state.cipher.decrypt_text(user.email_enc, f"email:{user.id}") if user is not None else None
    return MemberOut(user_id=m.user_id, role=m.role, joined_at=as_utc(m.joined_at).isoformat(), me=me, email=email)


@router.get("/current/members", response_model=list[MemberOut])
def members(
    ctx: HouseholdContext = Depends(get_household), state: AppState = Depends(get_state), db: Session = Depends(get_db)
) -> list[MemberOut]:
    rows = db.scalars(select(Membership).where(Membership.household_id == ctx.household.id).order_by(Membership.joined_at))
    return [_member_out(state, db, m, m.user_id == ctx.auth.user.id) for m in rows]


def _member_of(db: Session, ctx: HouseholdContext, user_id: uuid.UUID) -> Membership:
    m = db.get(Membership, user_id)
    if m is None or m.household_id != ctx.household.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not_found")
    return m


@router.patch("/current/members/{user_id}", response_model=MemberOut)
def update_member(
    user_id: uuid.UUID,
    body: MemberUpdate,
    ctx: HouseholdContext = Depends(require_role("owner")),
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
) -> MemberOut:
    m = _member_of(db, ctx, user_id)
    if m.user_id == ctx.auth.user.id and body.role != "owner":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="cannot_demote_self")
    m.role = body.role
    db.commit()
    return _member_out(state, db, m, m.user_id == ctx.auth.user.id)


@router.delete("/current/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    user_id: uuid.UUID,
    ctx: HouseholdContext = Depends(require_role("owner")),
    db: Session = Depends(get_db),
) -> Response:
    m = _member_of(db, ctx, user_id)
    if m.user_id == ctx.auth.user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="use_leave")
    db.delete(m)
    db.commit()
    security_log.info("member_removed household=%s", ctx.household.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/current/export")
def export(
    ctx: HouseholdContext = Depends(require_role("owner", "member")),
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
) -> Response:
    """Exportación completa en JSON (portabilidad de los datos)."""
    h = ctx.household
    records = db.scalars(
        select(SyncRecord).where(SyncRecord.household_id == h.id, SyncRecord.deleted.is_(False)).order_by(SyncRecord.entity, SyncRecord.rev)
    )
    out: dict[str, list[dict]] = {}
    for r in records:
        aad = f"rec:{h.id}:{r.entity}:{r.entity_id}"
        data = json.loads(state.cipher.decrypt(r.data_enc, aad)) if r.data_enc else None
        out.setdefault(r.entity, []).append({"id": str(r.entity_id), "rev": r.rev, "data": data})
    body = {
        "format": "stocky-export/1",
        "exported_at": datetime.now(UTC).isoformat(),
        "household": {"id": str(h.id), "name": state.cipher.decrypt_text(h.name_enc, f"household:{h.id}"), "rev": h.rev},
        "entities": out,
    }
    return Response(
        content=json.dumps(body, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="stocky-export.json"'},
    )
