import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.invoice import Invoice
    from app.models.payment import Payment


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_address: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    tax_identifier: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=lambda: datetime.now(UTC), 
        onupdate=lambda: datetime.now(UTC), 
        nullable=False
    )

    organization: Mapped["Organization"] = relationship("Organization", back_populates="customers")
    invoices: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="customer", overlaps="invoices")
    payments: Mapped[list["Payment"]] = relationship("Payment", back_populates="customer", overlaps="payments")

    __table_args__ = (
        UniqueConstraint('organization_id', 'id', name='uq_customer_organization_id'),
    )
