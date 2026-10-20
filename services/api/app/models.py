"""Modelo de datos del servidor (SQLAlchemy 2).

Todo el contenido que puede revelar algo del hogar (nombres, inventario,
listas, correo, nombre del dispositivo) se guarda cifrado (`*_enc`). En claro
solo quedan identificadores aleatorios, fechas técnicas y contadores.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    LargeBinary,
    String,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    #: HMAC del correo normalizado: permite buscar sin guardar el correo en claro.
    email_index: Mapped[str] = mapped_column(String(64), unique=True)
    email_enc: Mapped[bytes] = mapped_column(LargeBinary)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    password_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DeviceSession(Base):
    """Sesión de un dispositivo. Revocarla invalida al momento sus tokens."""

    __tablename__ = "device_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name_enc: Mapped[bytes] = mapped_column(LargeBinary)
    refresh_hash: Mapped[str] = mapped_column(String(64), unique=True)
    #: Hash del token anterior: si alguien lo reutiliza, se revoca la sesión (robo de token).
    previous_refresh_hash: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    refresh_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Household(Base):
    __tablename__ = "households"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name_enc: Mapped[bytes] = mapped_column(LargeBinary)
    #: Revisión monótona del hogar: cada cambio sincronizado la incrementa.
    rev: Mapped[int] = mapped_column(BigInteger, default=0)
    #: Revisiones anteriores a esta ya no se pueden pedir (lápidas purgadas).
    purged_rev: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (CheckConstraint("rev >= 0 AND purged_rev >= 0 AND purged_rev <= rev", name="ck_households_rev"),)


ROLES = ("owner", "member", "viewer")


class Membership(Base):
    """Un usuario pertenece como mucho a un hogar (simplifica el aislamiento)."""

    __tablename__ = "memberships"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    household_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("households.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (CheckConstraint("role IN ('owner', 'member', 'viewer')", name="ck_memberships_role"),)


class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("households.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[str] = mapped_column(String(16))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (CheckConstraint("role IN ('member', 'viewer')", name="ck_invitations_role"),)


SYNC_ENTITIES = ("product", "stock_lot", "shopping_list", "shopping_item", "setting")


class SyncRecord(Base):
    """Última versión de cada entidad sincronizada de un hogar (contenido cifrado)."""

    __tablename__ = "sync_records"

    household_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("households.id", ondelete="CASCADE"), primary_key=True)
    entity: Mapped[str] = mapped_column(String(32), primary_key=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    rev: Mapped[int] = mapped_column(BigInteger)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    data_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_sync_records_household_rev", "household_id", "rev"),
        CheckConstraint(
            "entity IN ('product', 'stock_lot', 'shopping_list', 'shopping_item', 'setting')", name="ck_sync_records_entity"
        ),
        CheckConstraint("deleted OR data_enc IS NOT NULL", name="ck_sync_records_data"),
    )


class ProcessedOp(Base):
    """Operaciones ya aplicadas: reenviar la misma operación no la aplica dos veces."""

    __tablename__ = "processed_ops"

    household_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("households.id", ondelete="CASCADE"), primary_key=True)
    op_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    status: Mapped[str] = mapped_column(String(16))
    rev: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
