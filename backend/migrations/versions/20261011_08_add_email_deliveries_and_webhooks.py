"""Add email_deliveries, email_delivery_attempts, and email_webhook_events tables.

Revision ID: 8h9i0j1k2l3m
Revises: 7g8h9i0j1k2l
Create Date: 2026-10-11
"""
import sqlalchemy as sa
from alembic import op

revision = "8h9i0j1k2l3m"
down_revision = "7g8h9i0j1k2l"
branch_labels = None
depends_on = None

def upgrade() -> None:
    delivery_status_enum = sa.Enum(
        'QUEUED', 'SENDING', 'ACCEPTED', 'DELIVERED', 'BOUNCED',
        'COMPLAINED', 'FAILED', 'BLOCKED', 'UNKNOWN', 'CANCELLED',
        name='deliverystatus',
        create_type=False
    )

    bind = op.get_bind()
    if bind.engine.name == 'postgresql':
        bind.execute(sa.text(
            "DO $$ BEGIN "
            "  CREATE TYPE deliverystatus AS ENUM ('QUEUED', 'SENDING', 'ACCEPTED', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'BLOCKED', 'UNKNOWN', 'CANCELLED'); "
            "EXCEPTION WHEN duplicate_object THEN NULL; "
            "END $$"
        ))

    op.create_table(
        'email_deliveries',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('organization_id', sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column('collection_message_id', sa.Uuid(as_uuid=True), sa.ForeignKey('collection_messages.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('invoice_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('customer_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False, server_default='resend'),
        sa.Column('provider_message_id', sa.String(length=255), nullable=True, unique=True, index=True),
        sa.Column('idempotency_key', sa.String(length=255), nullable=False, unique=True),
        sa.Column('recipient_email', sa.String(length=255), nullable=False),
        sa.Column('subject_snapshot', sa.String(length=255), nullable=False),
        sa.Column('body_snapshot', sa.Text(), nullable=False),
        sa.Column('status', delivery_status_enum, nullable=False, index=True),
        sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('next_attempt_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error_code', sa.String(length=255), nullable=True),
        sa.Column('last_error_summary', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('bounced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('complained_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('blocked_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'email_delivery_attempts',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('organization_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('email_delivery_id', sa.Uuid(as_uuid=True), sa.ForeignKey('email_deliveries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('attempt_number', sa.Integer(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('result_status', sa.String(length=50), nullable=False),
        sa.Column('provider_message_id', sa.String(length=255), nullable=True),
        sa.Column('error_code', sa.String(length=255), nullable=True),
        sa.Column('error_summary', sa.Text(), nullable=True),
        sa.UniqueConstraint('email_delivery_id', 'attempt_number', name='uq_email_delivery_attempt'),
    )

    op.create_table(
        'email_webhook_events',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('provider_event_id', sa.String(length=255), nullable=False),
        sa.Column('provider_message_id', sa.String(length=255), nullable=False),
        sa.Column('event_type', sa.String(length=255), nullable=False),
        sa.Column('email_delivery_id', sa.Uuid(as_uuid=True), sa.ForeignKey('email_deliveries.id', ondelete='SET NULL'), nullable=True),
        sa.Column('inbound_message_id', sa.Uuid(as_uuid=True), sa.ForeignKey('collection_messages.id', ondelete='SET NULL'), nullable=True),
        sa.Column('event_timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('processed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('processing_result', sa.String(length=255), nullable=False),
        sa.Column('error_detail', sa.Text(), nullable=True),
        sa.UniqueConstraint('provider', 'provider_event_id', name='uq_provider_event_id'),
    )

def downgrade() -> None:
    op.drop_table('email_webhook_events')
    op.drop_table('email_delivery_attempts')
    op.drop_table('email_deliveries')

    bind = op.get_bind()
    if bind.engine.name == 'postgresql':
        sa.Enum(name='deliverystatus').drop(bind)
