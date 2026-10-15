"""Add payments and allocations

Revision ID: 3c4d5e6f7g8h
Revises: 2b3c4d5e6f7g
Create Date: 2026-10-10 12:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "3c4d5e6f7g8h"
down_revision = "2b3c4d5e6f7g"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Modify Customer and Invoice unique constraints
    op.create_unique_constraint(
        "uq_invoice_org_id_customer", "invoices", ["organization_id", "id", "customer_id"]
    )

    # Payments
    op.create_table(
        "payments",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("organization_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column(
            "payment_method",
            sa.Enum(
                "BANK_TRANSFER", "CASH", "CHEQUE", "CARD", "ONLINE", "OTHER", name="paymentmethod"
            ),
            nullable=False,
        ),
        sa.Column("reference", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("recorded_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recorded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["organization_id", "customer_id"],
            ["customers.organization_id", "customers.id"],
            name="fk_payment_customer_org",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "id", name="uq_payment_organization_id"),
        sa.UniqueConstraint(
            "organization_id", "id", "customer_id", name="uq_payment_org_id_customer"
        ),
    )
    op.create_index(
        op.f("ix_payments_organization_id"), "payments", ["organization_id"], unique=False
    )
    op.create_index(op.f("ix_payments_customer_id"), "payments", ["customer_id"], unique=False)
    op.create_index(op.f("ix_payments_payment_date"), "payments", ["payment_date"], unique=False)

    # Payment Allocations
    op.create_table(
        "payment_allocations",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("organization_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("payment_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["organization_id", "payment_id", "customer_id"],
            ["payments.organization_id", "payments.id", "payments.customer_id"],
            name="fk_allocation_payment_org_customer",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "invoice_id", "customer_id"],
            ["invoices.organization_id", "invoices.id", "invoices.customer_id"],
            name="fk_allocation_invoice_org_customer",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_payment_allocations_organization_id"),
        "payment_allocations",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_payment_allocations_customer_id"),
        "payment_allocations",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_payment_allocations_payment_id"),
        "payment_allocations",
        ["payment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_payment_allocations_invoice_id"),
        "payment_allocations",
        ["invoice_id"],
        unique=False,
    )

    # Payment Reversals
    op.create_table(
        "payment_reversals",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("organization_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("payment_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reversed_by_user_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reversed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["organization_id", "payment_id"],
            ["payments.organization_id", "payments.id"],
            name="fk_reversal_payment_org",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payment_id", name="uq_reversal_payment_id"),
    )
    op.create_index(
        op.f("ix_payment_reversals_organization_id"),
        "payment_reversals",
        ["organization_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("payment_reversals")
    op.drop_table("payment_allocations")
    op.drop_table("payments")

    bind = op.get_bind()
    if bind.engine.name == "postgresql":
        op.execute(sa.text("DROP TYPE IF EXISTS paymentmethod"))

    op.drop_constraint("uq_invoice_org_id_customer", "invoices", type_="unique")
