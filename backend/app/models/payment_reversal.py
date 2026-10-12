import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.payment import Payment
    from app.models.user import User


class PaymentReversal(Base):
    __tablename__ = "payment_reversals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True, unique=True
    )
    
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    
    reversed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    reversed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    organization: Mapped["Organization"] = relationship("Organization", foreign_keys=[organization_id], overlaps="reversal")
    payment: Mapped["Payment"] = relationship("Payment", back_populates="reversal", primaryjoin="and_(PaymentReversal.organization_id==Payment.organization_id, PaymentReversal.payment_id==Payment.id)", overlaps="organization,payment")
    reversed_by: Mapped["User"] = relationship("User", foreign_keys=[reversed_by_user_id])

    __table_args__ = (
        ForeignKeyConstraint(
            ['organization_id', 'payment_id'],
            ['payments.organization_id', 'payments.id'],
            name='fk_reversal_payment_org'
        ),
    )
