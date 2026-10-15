"""Add customer reply analysis persistence.

Revision ID: 6f7g8h9i0j1k
Revises: 5e6f7g8h9i0j
Create Date: 2026-10-10
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "6f7g8h9i0j1k"
down_revision = "5e6f7g8h9i0j"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # These are only consumed by later requests, not within this migration transaction.
        op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'REPLY_ANALYSIS_CREATED'")
        op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'REPLY_ANALYSIS_ACCEPTED'")
        op.execute("ALTER TYPE eventtype ADD VALUE IF NOT EXISTS 'REPLY_ANALYSIS_DISMISSED'")

    classification = sa.Enum(
        "PAYMENT_PROMISE",
        "PAYMENT_CLAIM",
        "DISPUTE",
        "INVOICE_COPY_REQUEST",
        "PAYMENT_PLAN_REQUEST",
        "NEED_MORE_INFORMATION",
        "PAYMENT_REFUSAL",
        "GENERAL_REPLY",
        "AUTOMATED_REPLY",
        "BOUNCE_OR_DELIVERY_NOTICE",
        "UNRELATED",
        "UNCERTAIN",
        name="replyclassification",
    )
    analysis_status = sa.Enum(
        "PENDING_REVIEW",
        "ACCEPTED",
        "DISMISSED",
        name="analysisstatus",
    )

    # create_table's Enum DDL hooks create these named PostgreSQL types exactly once.
    op.create_table(
        "customer_reply_analyses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("source_message_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_id", sa.Uuid(), nullable=True),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("classification", classification, nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column(
            "analysis_payload",
            sa.JSON().with_variant(postgresql.JSONB(), "postgresql"),
            nullable=False,
        ),
        sa.Column("model_provider", sa.String(50), nullable=False),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("prompt_version", sa.String(50), nullable=False),
        sa.Column(
            "status",
            analysis_status,
            nullable=False,
            server_default="PENDING_REVIEW",
        ),
        sa.Column("reviewed_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "confidence_score >= 0 AND confidence_score <= 1",
            name="chk_reply_analysis_confidence_range",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_message_id"], ["collection_messages.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    for name, columns in (
        ("ix_customer_reply_analyses_organization_id", ["organization_id"]),
        ("ix_customer_reply_analyses_source_message_id", ["source_message_id"]),
        ("ix_customer_reply_analyses_invoice_id", ["invoice_id"]),
        ("ix_customer_reply_analyses_customer_id", ["customer_id"]),
        ("ix_customer_reply_analyses_status", ["status"]),
        (
            "ix_reply_analysis_org_message_created",
            ["organization_id", "source_message_id", "created_at"],
        ),
    ):
        op.create_index(name, "customer_reply_analyses", columns, unique=False)


def downgrade() -> None:
    for name in (
        "ix_reply_analysis_org_message_created",
        "ix_customer_reply_analyses_status",
        "ix_customer_reply_analyses_customer_id",
        "ix_customer_reply_analyses_invoice_id",
        "ix_customer_reply_analyses_source_message_id",
        "ix_customer_reply_analyses_organization_id",
    ):
        op.drop_index(name, table_name="customer_reply_analyses")
    op.drop_table("customer_reply_analyses")
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        sa.Enum(name="analysisstatus").drop(bind, checkfirst=True)
        sa.Enum(name="replyclassification").drop(bind, checkfirst=True)
