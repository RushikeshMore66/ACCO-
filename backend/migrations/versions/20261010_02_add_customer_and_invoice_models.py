"""Add customer and invoice models

Revision ID: 2b3c4d5e6f7g
Revises: 1a2b3c4d5e6f
Create Date: 2026-10-10 11:30:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = '2b3c4d5e6f7g'
down_revision = '1a2b3c4d5e6f'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Customers
    op.create_table(
        'customers',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('organization_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('contact_name', sa.String(length=255), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=255), nullable=True),
        sa.Column('billing_address', sa.String(length=1024), nullable=True),
        sa.Column('tax_identifier', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id', 'id', name='uq_customer_organization_id')
    )
    op.create_index(op.f('ix_customers_organization_id'), 'customers', ['organization_id'], unique=False)

    # Invoices
    op.create_table(
        'invoices',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('organization_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('customer_id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('invoice_number', sa.String(length=255), nullable=False),
        sa.Column('issue_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.Enum('DRAFT', 'ISSUED', 'VOID', name='invoicestatus'), nullable=False),
        sa.Column('void_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('voided_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(
            ['organization_id', 'customer_id'],
            ['customers.organization_id', 'customers.id'],
            name='fk_invoice_customer_org'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id', 'invoice_number', name='uq_invoice_organization_number')
    )
    op.create_index(op.f('ix_invoices_organization_id'), 'invoices', ['organization_id'], unique=False)
    op.create_index(op.f('ix_invoices_customer_id'), 'invoices', ['customer_id'], unique=False)

def downgrade() -> None:
    op.drop_index(op.f('ix_invoices_customer_id'), table_name='invoices')
    op.drop_index(op.f('ix_invoices_organization_id'), table_name='invoices')
    op.drop_table('invoices')
    
    bind = op.get_bind()
    if bind.engine.name == 'postgresql':
        op.execute(sa.text('DROP TYPE IF EXISTS invoicestatus'))
    
    op.drop_index(op.f('ix_customers_organization_id'), table_name='customers')
    op.drop_table('customers')
