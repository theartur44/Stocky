"""Esquemas de entrada y salida (validación estricta: campos desconocidos = error)."""

from __future__ import annotations

import re
import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .security import password_problem

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,63}$")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _clean_text(v: str) -> str:
    v = re.sub(r"[\x00-\x1f\x7f]", " ", v)
    return re.sub(r"\s+", " ", v).strip()


class Credentials(Strict):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    device_name: str = Field(default="Dispositivo", min_length=1, max_length=60)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        if not EMAIL_RE.match(v):
            raise ValueError("invalid email")
        return v.lower()

    @field_validator("device_name")
    @classmethod
    def _device(cls, v: str) -> str:
        return _clean_text(v) or "Dispositivo"


class RegisterRequest(Credentials):
    password: str = Field(min_length=12, max_length=128)
    registration_code: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _strong_password(self) -> RegisterRequest:
        problem = password_problem(self.password, self.email)
        if problem:
            raise ValueError(f"weak password: {problem}")
        return self


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    session_id: uuid.UUID


class RefreshRequest(Strict):
    refresh_token: str = Field(min_length=20, max_length=200)


class ChangePasswordRequest(Strict):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _strong_password(cls, v: str) -> str:
        problem = password_problem(v)
        if problem:
            raise ValueError(f"weak password: {problem}")
        return v


class MfaChallenge(BaseModel):
    """Respuesta del login cuando la cuenta tiene verificación en dos pasos."""

    mfa_required: Literal[True] = True
    mfa_token: str


class MfaLoginRequest(Strict):
    mfa_token: str = Field(min_length=20, max_length=1000)
    #: Código de 6 cifras de la app autenticadora o un código de recuperación.
    code: str = Field(min_length=6, max_length=20)
    device_name: str = Field(default="Dispositivo", min_length=1, max_length=60)

    @field_validator("device_name")
    @classmethod
    def _device(cls, v: str) -> str:
        return _clean_text(v) or "Dispositivo"


class MfaSetupOut(BaseModel):
    secret: str
    otpauth_uri: str


class MfaCodeRequest(Strict):
    code: str = Field(min_length=6, max_length=20)


class MfaDisableRequest(Strict):
    password: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=6, max_length=20)


class RecoveryCodesOut(BaseModel):
    recovery_codes: list[str]


class DeleteAccountRequest(Strict):
    password: str = Field(min_length=1, max_length=128)
    #: Obligatorio si la cuenta tiene verificación en dos pasos.
    code: str | None = Field(default=None, max_length=20)


class Me(BaseModel):
    user_id: uuid.UUID
    email: str
    household_id: uuid.UUID | None
    role: str | None
    mfa_enabled: bool = False


class DeviceOut(BaseModel):
    id: uuid.UUID
    name: str
    created_at: str
    last_used_at: str
    current: bool


class HouseholdCreate(Strict):
    name: str = Field(min_length=1, max_length=60)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = _clean_text(v)
        if not v:
            raise ValueError("empty")
        return v


class HouseholdOut(BaseModel):
    id: uuid.UUID
    name: str
    role: str
    rev: int
    members: int


class InvitationCreate(Strict):
    role: Literal["member", "viewer"] = "member"
    hours_valid: int = Field(default=24, ge=1, le=168)


class InvitationOut(BaseModel):
    code: str
    role: str
    expires_at: str


class JoinRequest(Strict):
    code: str = Field(min_length=6, max_length=32)


class MemberOut(BaseModel):
    user_id: uuid.UUID
    role: str
    joined_at: str
    me: bool


class MemberUpdate(Strict):
    role: Literal["owner", "member", "viewer"]


ENTITY = Literal["product", "stock_lot", "shopping_list", "shopping_item", "setting"]
MAX_RECORD_BYTES = 16 * 1024


class SyncOp(Strict):
    op_id: uuid.UUID
    entity: ENTITY
    entity_id: uuid.UUID
    kind: Literal["upsert", "delete", "adjust_quantity"]
    base_rev: int | None = Field(default=None, ge=0)
    data: dict[str, Any] | None = None
    delta_milli: int | None = Field(default=None, ge=-1_000_000_000, le=1_000_000_000)


class PushRequest(Strict):
    ops: list[SyncOp] = Field(min_length=1, max_length=500)


class OpResult(BaseModel):
    op_id: uuid.UUID
    status: Literal["applied", "duplicate", "conflict", "rejected"]
    rev: int
    reason: str | None = None


class PushResponse(BaseModel):
    results: list[OpResult]
    rev: int


class Change(BaseModel):
    entity: str
    entity_id: uuid.UUID
    rev: int
    deleted: bool
    data: dict[str, Any] | None


class PullResponse(BaseModel):
    changes: list[Change]
    next: int
    has_more: bool
    rev: int
