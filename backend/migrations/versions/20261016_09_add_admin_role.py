"""Add ADMIN value to the userrole enum.

Revision ID: 9i0j1k2l3m4n
Revises: 8h9i0j1k2l3m
Create Date: 2026-10-16

Upgrade: adds ``ADMIN`` to ``userrole`` (PostgreSQL only; SQLite stores the enum as
VARCHAR plus an optional CHECK constraint that is not created by this project's
migrations, so nothing changes there).

Downgrade: PostgreSQL cannot drop an enum value, so the type is rebuilt. Any ADMIN
users are demoted to FINANCE_MANAGER first (a privilege *reduction*, never an
escalation) so no row is left holding a value the old type cannot represent.
"""

from alembic import op

revision = "9i0j1k2l3m4n"
down_revision = "8h9i0j1k2l3m"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    # ALTER TYPE ... ADD VALUE cannot be used in the same transaction as the new value.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'ADMIN'")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("UPDATE users SET role = 'FINANCE_MANAGER' WHERE role = 'ADMIN'")
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute("CREATE TYPE userrole AS ENUM ('OWNER', 'FINANCE_MANAGER', 'COLLECTOR', 'VIEWER')")
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::text::userrole")
    op.execute("DROP TYPE userrole_old")
