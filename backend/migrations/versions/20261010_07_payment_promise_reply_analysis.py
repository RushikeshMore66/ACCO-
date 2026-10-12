"""Add reply_analysis_id to PaymentPromise.

Revision ID: 7g8h9i0j1k2l
Revises: 6f7g8h9i0j1k
Create Date: 2026-10-10
"""
import sqlalchemy as sa
from alembic import op

revision = "7g8h9i0j1k2l"
down_revision = "6f7g8h9i0j1k"
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add the reply_analysis_id column
    op.add_column(
        "payment_promises",
        sa.Column("reply_analysis_id", sa.Uuid(), nullable=True)
    )
    
    # Add foreign key constraint
    op.create_foreign_key(
        "fk_payment_promises_reply_analysis_id_customer_reply_analyses",
        source_table="payment_promises",
        referent_table="customer_reply_analyses",
        local_cols=["reply_analysis_id"],
        remote_cols=["id"],
        ondelete="SET NULL"
    )
    
    # Add unique constraint to prevent multiple promises from the same analysis
    op.create_unique_constraint(
        "uq_payment_promises_reply_analysis_id",
        "payment_promises",
        ["reply_analysis_id"]
    )

def downgrade() -> None:
    # Remove unique constraint
    op.drop_constraint("uq_payment_promises_reply_analysis_id", "payment_promises", type_="unique")
    
    # Remove foreign key
    op.drop_constraint("fk_payment_promises_reply_analysis_id_customer_reply_analyses", "payment_promises", type_="foreignkey")
    
    # Remove the column
    op.drop_column("payment_promises", "reply_analysis_id")
