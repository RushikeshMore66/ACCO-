"""Add collection policy

Revision ID: 4d5e6f7g8h9i
Revises: 3c4d5e6f7g8h
Create Date: 2026-10-10 12:30:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = '4d5e6f7g8h9i'
down_revision = '3c4d5e6f7g8h'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        'collection_policies',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('organization_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('initial_reminder_after_days', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('follow_up_after_days', sa.Integer(), nullable=False, server_default='8'),
        sa.Column('escalation_after_days', sa.Integer(), nullable=False, server_default='31'),
        sa.Column('require_approval_before_send', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('pause_collection_on_dispute', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('pause_collection_on_payment_promise', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('initial_reminder_after_days >= 1', name='chk_initial_reminder_days'),
        sa.CheckConstraint('follow_up_after_days > initial_reminder_after_days', name='chk_follow_up_days'),
        sa.CheckConstraint('escalation_after_days > follow_up_after_days', name='chk_escalation_days'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id', name='uq_collection_policy_org_id')
    )
    op.create_index(op.f('ix_collection_policies_organization_id'), 'collection_policies', ['organization_id'], unique=True)

def downgrade() -> None:
    op.drop_index(op.f('ix_collection_policies_organization_id'), table_name='collection_policies')
    op.drop_table('collection_policies')
