import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Numeric,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.customer import Customer
    from app.models.payment import Payment
    from app.models.invoice import Invoice
    from app.models.user import User


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    organization: Mapped["Organization"] = relationship("Organization", foreign_keys=[organization_id], overlaps="allocations")
    payment: Mapped["Payment"] = relationship("Payment", back_populates="allocations", primaryjoin="and_(PaymentAllocation.organization_id==Payment.organization_id, PaymentAllocation.payment_id==Payment.id, PaymentAllocation.customer_id==Payment.customer_id)", overlaps="allocations,organization,payment")
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="allocations", primaryjoin="and_(PaymentAllocation.organization_id==Invoice.organization_id, PaymentAllocation.invoice_id==Invoice.id, PaymentAllocation.customer_id==Invoice.customer_id)", overlaps="allocations,organization,invoice")
    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_user_id])

    __table_args__ = (
        ForeignKeyConstraint(
            ['organization_id', 'payment_id', 'customer_id'],
            ['payments.organization_id', 'payments.id', 'payments.customer_id'],
            name='fk_allocation_payment_org_customer'
        ),
        ForeignKeyConstraint(
            ['organization_id', 'invoice_id', 'customer_id'],
            ['invoices.organization_id', 'invoices.id', 'invoices.customer_id'],
            name='fk_allocation_invoice_org_customer'
        ),
    )
