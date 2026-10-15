"""Workflow migration and RBAC

Revision ID: 5e6f7g8h9i0j
Revises: 4d5e6f7g8h9i
Create Date: 2026-10-10 12:45:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "5e6f7g8h9i0j"
down_revision = "4d5e6f7g8h9i"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create Enums
    user_role_enum = sa.Enum(
        "OWNER", "FINANCE_MANAGER", "COLLECTOR", "VIEWER", name="userrole", create_type=False
    )
    msg_dir_enum = sa.Enum(
        "INBOUND", "OUTBOUND", "INTERNAL_NOTE", name="messagedirection", create_type=False
    )
    msg_chan_enum = sa.Enum(
        "EMAIL", "WHATSAPP", "PHONE", "INTERNAL", name="messagechannel", create_type=False
    )
    msg_status_enum = sa.Enum(
        "DRAFT",
        "PENDING_APPROVAL",
        "APPROVED",
        "REJECTED",
        "CANCELLED",
        "RECEIVED",
        "RECORDED",
        name="messagestatus",
        create_type=False,
    )
    promise_status_enum = sa.Enum(
        "ACTIVE", "FULFILLED", "MISSED", "CANCELLED", name="promisestatus", create_type=False
    )
    dispute_category_enum = sa.Enum(
        "INCORRECT_AMOUNT",
        "DUPLICATE_INVOICE",
        "SERVICE_OR_PRODUCT_ISSUE",
        "TAX_OR_BILLING_ISSUE",
        "PAYMENT_ALREADY_MADE",
        "OTHER",
        name="disputecategory",
        create_type=False,
    )
    dispute_status_enum = sa.Enum(
        "OPEN", "UNDER_REVIEW", "RESOLVED", "REJECTED", name="disputestatus", create_type=False
    )
    event_type_enum = sa.Enum(
        "POLICY_UPDATED",
        "MESSAGE_CREATED",
        "MESSAGE_EDITED",
        "MESSAGE_SUBMITTED",
        "MESSAGE_APPROVED",
        "MESSAGE_REJECTED",
        "MESSAGE_CANCELLED",
        "INBOUND_RECORDED",
        "NOTE_RECORDED",
        "PROMISE_CREATED",
        "PROMISE_FULFILLED",
        "PROMISE_MISSED",
        "PROMISE_CANCELLED",
        "DISPUTE_OPENED",
        "DISPUTE_UNDER_REVIEW",
        "DISPUTE_RESOLVED",
        "DISPUTE_REJECTED",
        "COLLECTION_PAUSED",
        "COLLECTION_RESUMED",
        name="eventtype",
        create_type=False,
    )

    # Explicitly CREATE all PostgreSQL enum types before any DDL references them.
    # Alembic does NOT auto-issue CREATE TYPE for enums used in op.add_column.
    # We use idempotent DO $$ blocks because CREATE TYPE has no IF NOT EXISTS
    # before PostgreSQL 14, and checkfirst=True on sa.Enum is unreliable with psycopg3.
    bind = op.get_bind()
    if bind.engine.name == "postgresql":

        def _create_enum_safe(type_name: str, values: list[str]) -> None:
            values_sql = ", ".join(f"'{v}'" for v in values)
            bind.execute(
                sa.text(
                    f"DO $$ BEGIN "
                    f"  CREATE TYPE {type_name} AS ENUM ({values_sql}); "
                    f"EXCEPTION WHEN duplicate_object THEN NULL; "
                    f"END $$"
                )
            )

        _create_enum_safe("userrole", ["OWNER", "FINANCE_MANAGER", "COLLECTOR", "VIEWER"])
        _create_enum_safe("messagedirection", ["INBOUND", "OUTBOUND", "INTERNAL_NOTE"])
        _create_enum_safe("messagechannel", ["EMAIL", "WHATSAPP", "PHONE", "INTERNAL"])
        _create_enum_safe(
            "messagestatus",
            [
                "DRAFT",
                "PENDING_APPROVAL",
                "APPROVED",
                "REJECTED",
                "CANCELLED",
                "RECEIVED",
                "RECORDED",
            ],
        )
        _create_enum_safe("promisestatus", ["ACTIVE", "FULFILLED", "MISSED", "CANCELLED"])
        _create_enum_safe(
            "disputecategory",
            [
                "INCORRECT_AMOUNT",
                "DUPLICATE_INVOICE",
                "SERVICE_OR_PRODUCT_ISSUE",
                "TAX_OR_BILLING_ISSUE",
                "PAYMENT_ALREADY_MADE",
                "OTHER",
            ],
        )
        _create_enum_safe("disputestatus", ["OPEN", "UNDER_REVIEW", "RESOLVED", "REJECTED"])
        _create_enum_safe(
            "eventtype",
            [
                "POLICY_UPDATED",
                "MESSAGE_CREATED",
                "MESSAGE_EDITED",
                "MESSAGE_SUBMITTED",
                "MESSAGE_APPROVED",
                "MESSAGE_REJECTED",
                "MESSAGE_CANCELLED",
                "INBOUND_RECORDED",
                "NOTE_RECORDED",
                "PROMISE_CREATED",
                "PROMISE_FULFILLED",
                "PROMISE_MISSED",
                "PROMISE_CANCELLED",
                "DISPUTE_OPENED",
                "DISPUTE_UNDER_REVIEW",
                "DISPUTE_RESOLVED",
                "DISPUTE_REJECTED",
                "COLLECTION_PAUSED",
                "COLLECTION_RESUMED",
            ],
        )

    # 2. Add role column to users (nullable first)
    op.add_column("users", sa.Column("role", user_role_enum, nullable=True))

    # 3. Backfill roles
    bind = op.get_bind()
    # Find all users
    users = bind.execute(
        sa.text(
            "SELECT id, organization_id, created_at FROM users ORDER BY organization_id, created_at ASC, id ASC"
        )
    ).fetchall()

    org_first_user = {}
    for user in users:
        u_id, org_id, _created_at = user
        if org_id not in org_first_user:
            org_first_user[org_id] = u_id

    for user in users:
        u_id, org_id, _created_at = user
        role = "OWNER" if org_first_user[org_id] == u_id else "VIEWER"
        # update user
        if bind.engine.name == "sqlite":
            # SQLite safe update
            bind.execute(
                sa.text("UPDATE users SET role = :r WHERE id = :u"), {"r": role, "u": u_id}
            )
        else:
            bind.execute(
                sa.text("UPDATE users SET role = :r WHERE id = :u"), {"r": role, "u": u_id}
            )

    # 4. Make role non-nullable
    # In SQLite, altering a column to non-nullable without default can be tricky,
    # but Alembic batch op handles it or we can just use alter_column if supported.
    # We will try standard alter_column.
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column("role", existing_type=user_role_enum, nullable=False)

    # 5. Create workflow tables
    op.create_table(
        "collection_messages",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("organization_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("direction", msg_dir_enum, nullable=False),
        sa.Column("channel", msg_chan_enum, nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", msg_status_enum, nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["organization_id", "customer_id"],
            ["customers.organization_id", "customers.id"],
        ),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_collection_messages_customer_id"),
        "collection_messages",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_collection_messages_invoice_id"),
        "collection_messages",
        ["invoice_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_collection_messages_organization_id"),
        "collection_messages",
        ["organization_id"],
        unique=False,
    )

    op.create_table(
        "payment_promises",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("organization_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("promised_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("expected_payment_date", sa.Date(), nullable=False),
        sa.Column("follow_up_date", sa.Date(), nullable=False),
        sa.Column("status", promise_status_enum, nullable=False),
        sa.Column("recorded_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("source_message_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "follow_up_date >= expected_payment_date", name="chk_promise_follow_up_date"
        ),
        sa.CheckConstraint("promised_amount > 0", name="chk_promise_amount_positive"),
        sa.ForeignKeyConstraint(
            ["organization_id", "invoice_id", "customer_id"],
            ["invoices.organization_id", "invoices.id", "invoices.customer_id"],
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recorded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["source_message_id"], ["collection_messages.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_payment_promises_customer_id"), "payment_promises", ["customer_id"], unique=False
    )
    op.create_index(
        op.f("ix_payment_promises_invoice_id"), "payment_promises", ["invoice_id"], unique=False
    )
    op.create_index(
        op.f("ix_payment_promises_organization_id"),
        "payment_promises",
        ["organization_id"],
        unique=False,
    )

    op.create_table(
        "collection_disputes",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("organization_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("category", dispute_category_enum, nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", dispute_status_enum, nullable=False),
        sa.Column("opened_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("resolved_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["organization_id", "invoice_id", "customer_id"],
            ["invoices.organization_id", "invoices.id", "invoices.customer_id"],
        ),
        sa.ForeignKeyConstraint(["opened_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resolved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_collection_disputes_customer_id"),
        "collection_disputes",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_collection_disputes_invoice_id"),
        "collection_disputes",
        ["invoice_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_collection_disputes_organization_id"),
        "collection_disputes",
        ["organization_id"],
        unique=False,
    )

    op.create_table(
        "collection_activities",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("organization_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("actor_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("event_type", event_type_enum, nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.String(), "sqlite"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_collection_activities_customer_id"),
        "collection_activities",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_collection_activities_invoice_id"),
        "collection_activities",
        ["invoice_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_collection_activities_organization_id"),
        "collection_activities",
        ["organization_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("collection_activities")
    op.drop_table("collection_disputes")
    op.drop_table("payment_promises")
    op.drop_table("collection_messages")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("role")

    # Drop enums if postgres
    bind = op.get_bind()
    if bind.engine.name == "postgresql":
        sa.Enum(name="userrole").drop(bind)
        sa.Enum(name="messagedirection").drop(bind)
        sa.Enum(name="messagechannel").drop(bind)
        sa.Enum(name="messagestatus").drop(bind)
        sa.Enum(name="promisestatus").drop(bind)
        sa.Enum(name="disputecategory").drop(bind)
        sa.Enum(name="disputestatus").drop(bind)
        sa.Enum(name="eventtype").drop(bind)
