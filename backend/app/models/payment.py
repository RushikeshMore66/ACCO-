import enum
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.organization import Organization
    from app.models.payment_allocation import PaymentAllocation
    from app.models.payment_reversal import PaymentReversal
    from app.models.user import User


class PaymentMethod(str, enum.Enum):
    BANK_TRANSFER = "BANK_TRANSFER"
    CASH = "CASH"
    CHEQUE = "CHEQUE"
    CARD = "CARD"
    ONLINE = "ONLINE"
    OTHER = "OTHER"


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    payment_date: Mapped[datetime] = mapped_column(Date, nullable=False, index=True)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="paymentmethod"), nullable=False
    )
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    recorded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    organization: Mapped["Organization"] = relationship("Organization", back_populates="payments", foreign_keys=[organization_id], overlaps="payments")
    customer: Mapped["Customer"] = relationship("Customer", back_populates="payments", primaryjoin="and_(Payment.organization_id==Customer.organization_id, Payment.customer_id==Customer.id)", overlaps="organization,payments")
    recorded_by: Mapped["User"] = relationship("User", foreign_keys=[recorded_by_user_id])
    
    allocations: Mapped[list["PaymentAllocation"]] = relationship("PaymentAllocation", back_populates="payment", overlaps="allocations")
    reversal: Mapped["PaymentReversal | None"] = relationship("PaymentReversal", back_populates="payment", uselist=False, overlaps="reversal")

    __table_args__ = (
        ForeignKeyConstraint(
            ['organization_id', 'customer_id'],
            ['customers.organization_id', 'customers.id'],
            name='fk_payment_customer_org'
        ),
        UniqueConstraint('organization_id', 'id', name='uq_payment_organization_id'),
        UniqueConstraint('organization_id', 'id', 'customer_id', name='uq_payment_org_id_customer'),
    )
