"""verificacion en dos pasos

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-21 20:35:44.428629
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Generado con Alembic (autogenerate) y revisado a mano.
    op.create_table('recovery_codes',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'code_hash')
    )
    op.add_column('users', sa.Column('totp_secret_enc', sa.LargeBinary(), nullable=True))
    op.add_column('users', sa.Column('totp_pending_enc', sa.LargeBinary(), nullable=True))
    op.add_column('users', sa.Column('totp_enabled_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('totp_last_step', sa.BigInteger(), nullable=True))


def downgrade() -> None:
    # Generado con Alembic (autogenerate) y revisado a mano.
    op.drop_column('users', 'totp_last_step')
    op.drop_column('users', 'totp_enabled_at')
    op.drop_column('users', 'totp_pending_enc')
    op.drop_column('users', 'totp_secret_enc')
    op.drop_table('recovery_codes')
