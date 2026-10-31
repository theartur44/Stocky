"""sitios de la casa: la entidad «place» se puede sincronizar

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-31 10:00:00
"""

from collections.abc import Sequence

from alembic import op


revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD = "entity IN ('product', 'stock_lot', 'shopping_list', 'shopping_item', 'setting')"
NEW = "entity IN ('place', 'product', 'stock_lot', 'shopping_list', 'shopping_item', 'setting')"


def upgrade() -> None:
    # La restricción no se puede modificar: se rehace con la entidad nueva.
    with op.batch_alter_table('sync_records') as batch:
        batch.drop_constraint('ck_sync_records_entity', type_='check')
        batch.create_check_constraint('ck_sync_records_entity', NEW)


def downgrade() -> None:
    op.execute("DELETE FROM sync_records WHERE entity = 'place'")
    with op.batch_alter_table('sync_records') as batch:
        batch.drop_constraint('ck_sync_records_entity', type_='check')
        batch.create_check_constraint('ck_sync_records_entity', OLD)
