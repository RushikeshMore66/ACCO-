"""Create append-only audit_events table.

Revision ID: 10j1k2l3m4n5
Revises: 9i0j1k2l3m4n
Create Date: 2026-10-16

PostgreSQL enforcement of immutability (defence in depth beside the ORM guard):
  * trigger ``audit_events_immutable`` rejects UPDATE / DELETE / TRUNCATE for every
    role, including the table owner;
  * UPDATE / DELETE / TRUNCATE are revoked from PUBLIC so a least-privilege
    application role holds only INSERT + SELECT (see docs/supabase-setup.md).
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "10j1k2l3m4n5"
down_revision = "9i0j1k2l3m4n"
branch_labels = None
depends_on = None

ACTOR_TYPES = ("USER", "SYSTEM", "WORKER", "WEBHOOK", "ANONYMOUS")


def upgrade() -> None:
    actor_enum = sa.Enum(*ACTOR_TYPES, name="auditactortype", create_type=False)
    actor_enum.create(op.get_bind(), checkfirst=True)

    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("actor_type", actor_enum, nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=True),
        sa.Column("entity_id", sa.String(64), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("before", json_type, nullable=True),
        sa.Column("after", json_type, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_audit_events_org_created", "audit_events", ["organization_id", "created_at"]
    )
    op.create_index(
        "ix_audit_events_org_entity",
        "audit_events",
        ["organization_id", "entity_type", "entity_id"],
    )
    op.create_index("ix_audit_events_org_action", "audit_events", ["organization_id", "action"])

    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(
        """
        CREATE FUNCTION audit_events_block_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_events is append-only (% blocked)', TG_OP
                USING ERRCODE = 'insufficient_privilege';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        "CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events "
        "FOR EACH ROW EXECUTE FUNCTION audit_events_block_mutation()"
    )
    op.execute(
        "CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events "
        "FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_mutation()"
    )
    op.execute("REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events")
        op.execute("DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events")
        op.execute("DROP FUNCTION IF EXISTS audit_events_block_mutation()")
    op.drop_index("ix_audit_events_org_action", table_name="audit_events")
    op.drop_index("ix_audit_events_org_entity", table_name="audit_events")
    op.drop_index("ix_audit_events_org_created", table_name="audit_events")
    op.drop_table("audit_events")
    sa.Enum(name="auditactortype").drop(op.get_bind(), checkfirst=True)
