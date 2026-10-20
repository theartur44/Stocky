"""Entorno de Alembic: usa la misma configuración (y TLS) que el servidor."""

from alembic import context
from sqlalchemy import pool

from app.config import load_settings
from app.db import make_engine
from app.models import Base

target_metadata = Base.metadata


def run_migrations_online() -> None:
    engine = make_engine(load_settings().database_url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


def run_migrations_offline() -> None:
    context.configure(url=load_settings().database_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
