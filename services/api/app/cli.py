"""Herramientas de administración (se ejecutan dentro del contenedor).

    python -m app.cli reset-password    # pide correo y nueva contraseña (sin eco)
    python -m app.cli reset-mfa         # quita la verificación en dos pasos de una cuenta (móvil perdido)
    python -m app.cli purge             # limpia sesiones, invitaciones, operaciones y lápidas antiguas
    python -m app.cli rotate-keys       # recifra los datos con la clave activa
    python -m app.cli generate-secrets  # imprime secretos nuevos (para el fichero de secretos)
"""

from __future__ import annotations

import argparse
import base64
import getpass
import secrets
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, or_, select, update

from .config import load_settings
from .db import make_engine, make_session_factory
from .models import DeviceSession, Household, Invitation, ProcessedOp, RecoveryCode, SyncRecord, User
from .security import DataCipher, email_index, hash_password


def _session():
    settings = load_settings()
    engine = make_engine(settings.database_url)
    return settings, make_session_factory(engine)()


def reset_password() -> int:
    settings, db = _session()
    email = input("Correo de la cuenta: ").strip()
    user = db.scalar(select(User).where(User.email_index == email_index(settings, email)))
    if user is None:
        print("No existe ninguna cuenta con ese correo.", file=sys.stderr)
        return 1
    pw = getpass.getpass("Nueva contraseña (12+ caracteres): ")
    if len(pw) < 12 or pw != getpass.getpass("Repite la contraseña: "):
        print("Contraseña no válida o no coincide.", file=sys.stderr)
        return 1
    user.password_hash = hash_password(pw)
    user.password_changed_at = datetime.now(UTC)
    # Se cierran todas las sesiones de la cuenta.
    db.execute(update(DeviceSession).where(DeviceSession.user_id == user.id).values(revoked_at=datetime.now(UTC)))
    db.commit()
    print("Contraseña cambiada y sesiones cerradas.")
    return 0


def reset_mfa() -> int:
    """Para quien perdió el móvil y los códigos de recuperación: comprobar antes su identidad en persona."""
    settings, db = _session()
    email = input("Correo de la cuenta: ").strip()
    user = db.scalar(select(User).where(User.email_index == email_index(settings, email)))
    if user is None:
        print("No existe ninguna cuenta con ese correo.", file=sys.stderr)
        return 1
    user.totp_secret_enc = None
    user.totp_pending_enc = None
    user.totp_enabled_at = None
    user.totp_last_step = None
    db.execute(delete(RecoveryCode).where(RecoveryCode.user_id == user.id))
    db.execute(update(DeviceSession).where(DeviceSession.user_id == user.id).values(revoked_at=datetime.now(UTC)))
    db.commit()
    print("Verificación en dos pasos desactivada y sesiones cerradas. La persona puede volver a activarla desde la app.")
    return 0


def purge(tombstone_days: int = 90) -> int:
    _, db = _session()
    counts = purge_db(db, datetime.now(UTC), tombstone_days)
    print("Purgado: {} sesiones, {} invitaciones, {} operaciones, {} lápidas.".format(*counts))
    return 0


def purge_db(db, now: datetime, tombstone_days: int = 90) -> tuple[int, int, int, int]:
    n_sessions = db.execute(
        delete(DeviceSession).where(
            or_(DeviceSession.revoked_at < now - timedelta(days=30), DeviceSession.refresh_expires_at < now - timedelta(days=1))
        )
    ).rowcount
    n_inv = db.execute(delete(Invitation).where(Invitation.expires_at < now - timedelta(days=7))).rowcount
    n_ops = db.execute(delete(ProcessedOp).where(ProcessedOp.created_at < now - timedelta(days=30))).rowcount
    # Lápidas antiguas: se borran y se anota hasta qué revisión ya no hay historial completo.
    cutoff = now - timedelta(days=tombstone_days)
    n_tomb = 0
    for h in db.scalars(select(Household)):
        max_rev = db.scalar(
            select(func.max(SyncRecord.rev)).where(
                SyncRecord.household_id == h.id, SyncRecord.deleted.is_(True), SyncRecord.updated_at < cutoff
            )
        )
        if max_rev:
            n_tomb += db.execute(
                delete(SyncRecord).where(
                    SyncRecord.household_id == h.id, SyncRecord.deleted.is_(True), SyncRecord.rev <= max_rev
                )
            ).rowcount
            h.purged_rev = max(h.purged_rev, max_rev)
    db.commit()
    return n_sessions, n_inv, n_ops, n_tomb


def rotate_keys() -> int:
    """Recifra con la clave activa todo lo cifrado con claves anteriores."""
    settings, db = _session()
    cipher = DataCipher(settings.data_keys, settings.active_key_id)
    count = 0
    for u in db.scalars(select(User)):
        if cipher.needs_reencrypt(u.email_enc):
            u.email_enc = cipher.encrypt(cipher.decrypt(u.email_enc, f"email:{u.id}"), f"email:{u.id}")
            count += 1
        if u.totp_secret_enc and cipher.needs_reencrypt(u.totp_secret_enc):
            u.totp_secret_enc = cipher.encrypt(cipher.decrypt(u.totp_secret_enc, f"totp:{u.id}"), f"totp:{u.id}")
            count += 1
    for s in db.scalars(select(DeviceSession)):
        if cipher.needs_reencrypt(s.name_enc):
            s.name_enc = cipher.encrypt(cipher.decrypt(s.name_enc, f"device:{s.id}"), f"device:{s.id}")
            count += 1
    for h in db.scalars(select(Household)):
        if cipher.needs_reencrypt(h.name_enc):
            h.name_enc = cipher.encrypt(cipher.decrypt(h.name_enc, f"household:{h.id}"), f"household:{h.id}")
            count += 1
    for r in db.scalars(select(SyncRecord).where(SyncRecord.data_enc.is_not(None))):
        aad = f"rec:{r.household_id}:{r.entity}:{r.entity_id}"
        if r.data_enc and cipher.needs_reencrypt(r.data_enc):
            r.data_enc = cipher.encrypt(cipher.decrypt(r.data_enc, aad), aad)
            count += 1
    db.commit()
    print(f"Recifrados {count} valores con la clave '{settings.active_key_id}'.")
    return 0


def generate_secrets() -> int:
    key_id = datetime.now(UTC).strftime("k%Y%m")
    print(f"STOCKY_JWT_SECRET={secrets.token_urlsafe(48)}")
    print(f"STOCKY_EMAIL_PEPPER={secrets.token_urlsafe(48)}")
    print(f"STOCKY_DATA_KEYS={key_id}:{base64.b64encode(secrets.token_bytes(32)).decode()}")
    print(f"STOCKY_REGISTRATION_CODE={secrets.token_urlsafe(12)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("reset-password")
    sub.add_parser("reset-mfa")
    p = sub.add_parser("purge")
    p.add_argument("--tombstone-days", type=int, default=90)
    sub.add_parser("rotate-keys")
    sub.add_parser("generate-secrets")
    args = parser.parse_args(argv)
    if args.cmd == "reset-password":
        return reset_password()
    if args.cmd == "reset-mfa":
        return reset_mfa()
    if args.cmd == "purge":
        return purge(args.tombstone_days)
    if args.cmd == "rotate-keys":
        return rotate_keys()
    return generate_secrets()


if __name__ == "__main__":
    sys.exit(main())
