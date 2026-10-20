"""esquema inicial

Revision ID: 0001
Revises: 
Create Date: 2026-10-20 14:50:58.139639
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Generado con Alembic (autogenerate) y revisado a mano.
    op.create_table('households',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name_enc', sa.LargeBinary(), nullable=False),
    sa.Column('rev', sa.BigInteger(), nullable=False),
    sa.Column('purged_rev', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('rev >= 0 AND purged_rev >= 0 AND purged_rev <= rev', name='ck_households_rev'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('users',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('email_index', sa.String(length=64), nullable=False),
    sa.Column('email_enc', sa.LargeBinary(), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email_index')
    )
    op.create_table('device_sessions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('name_enc', sa.LargeBinary(), nullable=False),
    sa.Column('refresh_hash', sa.String(length=64), nullable=False),
    sa.Column('previous_refresh_hash', sa.String(length=64), nullable=True),
    sa.Column('refresh_expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('refresh_hash')
    )
    op.create_index(op.f('ix_device_sessions_previous_refresh_hash'), 'device_sessions', ['previous_refresh_hash'], unique=False)
    op.create_index(op.f('ix_device_sessions_user_id'), 'device_sessions', ['user_id'], unique=False)
    op.create_table('invitations',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("role IN ('member', 'viewer')", name='ck_invitations_role'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code_hash')
    )
    op.create_index(op.f('ix_invitations_household_id'), 'invitations', ['household_id'], unique=False)
    op.create_table('memberships',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("role IN ('owner', 'member', 'viewer')", name='ck_memberships_role'),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id')
    )
    op.create_index(op.f('ix_memberships_household_id'), 'memberships', ['household_id'], unique=False)
    op.create_table('processed_ops',
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('op_id', sa.Uuid(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('rev', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('household_id', 'op_id')
    )
    op.create_index(op.f('ix_processed_ops_created_at'), 'processed_ops', ['created_at'], unique=False)
    op.create_table('sync_records',
    sa.Column('household_id', sa.Uuid(), nullable=False),
    sa.Column('entity', sa.String(length=32), nullable=False),
    sa.Column('entity_id', sa.Uuid(), nullable=False),
    sa.Column('rev', sa.BigInteger(), nullable=False),
    sa.Column('deleted', sa.Boolean(), nullable=False),
    sa.Column('data_enc', sa.LargeBinary(), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("entity IN ('product', 'stock_lot', 'shopping_list', 'shopping_item', 'setting')", name='ck_sync_records_entity'),
    sa.CheckConstraint('deleted OR data_enc IS NOT NULL', name='ck_sync_records_data'),
    sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('household_id', 'entity', 'entity_id')
    )
    op.create_index('ix_sync_records_household_rev', 'sync_records', ['household_id', 'rev'], unique=False)


def downgrade() -> None:
    # Generado con Alembic (autogenerate) y revisado a mano.
    op.drop_index('ix_sync_records_household_rev', table_name='sync_records')
    op.drop_table('sync_records')
    op.drop_index(op.f('ix_processed_ops_created_at'), table_name='processed_ops')
    op.drop_table('processed_ops')
    op.drop_index(op.f('ix_memberships_household_id'), table_name='memberships')
    op.drop_table('memberships')
    op.drop_index(op.f('ix_invitations_household_id'), table_name='invitations')
    op.drop_table('invitations')
    op.drop_index(op.f('ix_device_sessions_user_id'), table_name='device_sessions')
    op.drop_index(op.f('ix_device_sessions_previous_refresh_hash'), table_name='device_sessions')
    op.drop_table('device_sessions')
    op.drop_table('users')
    op.drop_table('households')
