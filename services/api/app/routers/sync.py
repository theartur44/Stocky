"""Sincronización incremental (push de operaciones / pull de cambios).

- Cada operación lleva un `op_id`: reenviarla es seguro (idempotencia).
- El servidor asigna una revisión monótona por hogar; el cliente pide los
  cambios posteriores a la última que conoce.
- Las cantidades de los lotes se sincronizan como deltas (`adjust_quantity`)
  para no perder consumos hechos a la vez en dos móviles.
- El contenido se guarda cifrado con AES-GCM y ligado a (hogar, entidad, id).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import AppState, HouseholdContext, get_db, get_household, get_state, require_role
from ..models import Household, ProcessedOp, SyncRecord
from ..schemas import MAX_RECORD_BYTES, Change, OpResult, PullResponse, PushRequest, PushResponse, SyncOp

router = APIRouter(prefix="/sync", tags=["sync"])

MAX_QUANTITY_MILLI = 1_000_000_000


def _aad(household_id: object, entity: str, entity_id: object) -> str:
    return f"rec:{household_id}:{entity}:{entity_id}"


def _encode(data: dict) -> bytes:
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    if len(raw) > MAX_RECORD_BYTES:
        raise ValueError("record_too_large")
    return raw


def _apply(state: AppState, db: Session, h: Household, op: SyncOp) -> tuple[str, str | None]:
    """Aplica una operación. Devuelve (estado, motivo)."""
    rec = db.get(SyncRecord, (h.id, op.entity, op.entity_id))
    aad = _aad(h.id, op.entity, op.entity_id)
    now = datetime.now(UTC)

    if op.kind == "upsert":
        if op.data is None:
            return "rejected", "data_required"
        if rec is not None and op.base_rev is not None and rec.rev > op.base_rev:
            return "conflict", "stale_base_rev"
        try:
            blob = state.cipher.encrypt(_encode(op.data), aad)
        except ValueError:
            return "rejected", "record_too_large"
        h.rev += 1
        if rec is None:
            rec = SyncRecord(household_id=h.id, entity=op.entity, entity_id=op.entity_id, rev=h.rev)
            db.add(rec)
        rec.rev, rec.deleted, rec.data_enc, rec.updated_at = h.rev, False, blob, now
        return "applied", None

    if op.kind == "delete":
        h.rev += 1
        if rec is None:
            rec = SyncRecord(household_id=h.id, entity=op.entity, entity_id=op.entity_id, rev=h.rev)
            db.add(rec)
        # Lápida: se conserva el identificador para que los demás dispositivos borren su copia.
        rec.rev, rec.deleted, rec.data_enc, rec.updated_at = h.rev, True, None, now
        return "applied", None

    # adjust_quantity
    if op.entity != "stock_lot" or op.delta_milli is None:
        return "rejected", "invalid_adjust"
    if rec is None or rec.deleted or rec.data_enc is None:
        return "rejected", "not_found"
    data = json.loads(state.cipher.decrypt(rec.data_enc, aad))
    current = data.get("quantityMilli")
    if not isinstance(current, int):
        return "rejected", "invalid_record"
    new_value = max(0, min(MAX_QUANTITY_MILLI, current + op.delta_milli))
    h.rev += 1
    rec.rev, rec.updated_at = h.rev, now
    if new_value == 0:
        # Un lote agotado se elimina, igual que en la app.
        rec.deleted, rec.data_enc = True, None
    else:
        data["quantityMilli"] = new_value
        rec.data_enc = state.cipher.encrypt(_encode(data), aad)
    return "applied", None


@router.post("/push", response_model=PushResponse)
def push(
    body: PushRequest,
    ctx: HouseholdContext = Depends(require_role("owner", "member")),
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
) -> PushResponse:
    # Bloquea la fila del hogar: las revisiones se asignan en orden y sin huecos.
    h = db.scalar(select(Household).where(Household.id == ctx.household.id).with_for_update())
    assert h is not None
    results: list[OpResult] = []
    for op in body.ops:
        done = db.get(ProcessedOp, (h.id, op.op_id))
        if done is not None:
            results.append(OpResult(op_id=op.op_id, status="duplicate", rev=done.rev))
            continue
        status_, reason = _apply(state, db, h, op)
        db.add(ProcessedOp(household_id=h.id, op_id=op.op_id, status=status_, rev=h.rev))
        results.append(OpResult(op_id=op.op_id, status=status_, rev=h.rev, reason=reason))
    db.commit()
    return PushResponse(results=results, rev=h.rev)


@router.get("/pull", response_model=PullResponse)
def pull(
    since: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=1000),
    ctx: HouseholdContext = Depends(get_household),
    state: AppState = Depends(get_state),
    db: Session = Depends(get_db),
) -> PullResponse:
    h = ctx.household
    if since < h.purged_rev:
        # Hay lápidas purgadas posteriores a `since`: el cliente debe resincronizar todo.
        raise HTTPException(status.HTTP_410_GONE, detail="full_resync_required")
    rows = db.scalars(
        select(SyncRecord)
        .where(SyncRecord.household_id == h.id, SyncRecord.rev > since)
        .order_by(SyncRecord.rev)
        .limit(limit + 1)
    ).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    changes = [
        Change(
            entity=r.entity,
            entity_id=r.entity_id,
            rev=r.rev,
            deleted=r.deleted,
            data=json.loads(state.cipher.decrypt(r.data_enc, _aad(h.id, r.entity, r.entity_id))) if r.data_enc else None,
        )
        for r in rows
    ]
    return PullResponse(changes=changes, next=rows[-1].rev if rows else since, has_more=has_more, rev=h.rev)
