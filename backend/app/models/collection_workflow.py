import enum
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MessageDirection(str, enum.Enum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"
    INTERNAL_NOTE = "INTERNAL_NOTE"

class MessageChannel(str, enum.Enum):
    EMAIL = "EMAIL"
    WHATSAPP = "WHATSAPP"
    PHONE = "PHONE"
    INTERNAL = "INTERNAL"

class MessageStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    RECEIVED = "RECEIVED"
    RECORDED = "RECORDED"

class CollectionMessage(Base):
    __tablename__ = "collection_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=True, index=True)
    
    direction: Mapped[MessageDirection] = mapped_column(Enum(MessageDirection), nullable=False)
    channel: Mapped[MessageChannel] = mapped_column(Enum(MessageChannel), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[MessageStatus] = mapped_column(Enum(MessageStatus), nullable=False)
    
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ['organization_id', 'customer_id'],
            ['customers.organization_id', 'customers.id']
        ),
    )

class PromiseStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    FULFILLED = "FULFILLED"
    MISSED = "MISSED"
    CANCELLED = "CANCELLED"

class PaymentPromise(Base):
    __tablename__ = "payment_promises"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    
    promised_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    expected_payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    follow_up_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[PromiseStatus] = mapped_column(Enum(PromiseStatus), nullable=False, default=PromiseStatus.ACTIVE)
    
    recorded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    source_message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("collection_messages.id", ondelete="SET NULL"), nullable=True)
    reply_analysis_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_reply_analyses.id", ondelete="SET NULL"), nullable=True, unique=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ['organization_id', 'invoice_id', 'customer_id'],
            ['invoices.organization_id', 'invoices.id', 'invoices.customer_id']
        ),
        CheckConstraint('promised_amount > 0', name='chk_promise_amount_positive'),
        CheckConstraint('follow_up_date >= expected_payment_date', name='chk_promise_follow_up_date'),
    )

class DisputeCategory(str, enum.Enum):
    INCORRECT_AMOUNT = "INCORRECT_AMOUNT"
    DUPLICATE_INVOICE = "DUPLICATE_INVOICE"
    SERVICE_OR_PRODUCT_ISSUE = "SERVICE_OR_PRODUCT_ISSUE"
    TAX_OR_BILLING_ISSUE = "TAX_OR_BILLING_ISSUE"
    PAYMENT_ALREADY_MADE = "PAYMENT_ALREADY_MADE"
    OTHER = "OTHER"

class DisputeStatus(str, enum.Enum):
    OPEN = "OPEN"
    UNDER_REVIEW = "UNDER_REVIEW"
    RESOLVED = "RESOLVED"
    REJECTED = "REJECTED"

class CollectionDispute(Base):
    __tablename__ = "collection_disputes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    
    category: Mapped[DisputeCategory] = mapped_column(Enum(DisputeCategory), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[DisputeStatus] = mapped_column(Enum(DisputeStatus), nullable=False, default=DisputeStatus.OPEN)
    
    opened_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ['organization_id', 'invoice_id', 'customer_id'],
            ['invoices.organization_id', 'invoices.id', 'invoices.customer_id']
        ),
    )

class EventType(str, enum.Enum):
    POLICY_UPDATED = "POLICY_UPDATED"
    MESSAGE_CREATED = "MESSAGE_CREATED"
    MESSAGE_EDITED = "MESSAGE_EDITED"
    MESSAGE_SUBMITTED = "MESSAGE_SUBMITTED"
    MESSAGE_APPROVED = "MESSAGE_APPROVED"
    MESSAGE_REJECTED = "MESSAGE_REJECTED"
    MESSAGE_CANCELLED = "MESSAGE_CANCELLED"
    INBOUND_RECORDED = "INBOUND_RECORDED"
    NOTE_RECORDED = "NOTE_RECORDED"
    REPLY_ANALYSIS_CREATED = "REPLY_ANALYSIS_CREATED"
    REPLY_ANALYSIS_ACCEPTED = "REPLY_ANALYSIS_ACCEPTED"
    REPLY_ANALYSIS_DISMISSED = "REPLY_ANALYSIS_DISMISSED"
    PROMISE_CREATED = "PROMISE_CREATED"
    PROMISE_FULFILLED = "PROMISE_FULFILLED"
    PROMISE_MISSED = "PROMISE_MISSED"
    PROMISE_CANCELLED = "PROMISE_CANCELLED"
    DISPUTE_OPENED = "DISPUTE_OPENED"
    DISPUTE_UNDER_REVIEW = "DISPUTE_UNDER_REVIEW"
    DISPUTE_RESOLVED = "DISPUTE_RESOLVED"
    DISPUTE_REJECTED = "DISPUTE_REJECTED"
    COLLECTION_PAUSED = "COLLECTION_PAUSED"
    COLLECTION_RESUMED = "COLLECTION_RESUMED"

class CollectionActivity(Base):
    __tablename__ = "collection_activities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=True, index=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    event_type: Mapped[EventType] = mapped_column(Enum(EventType), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # Using String for metadata fallback, in production we might use JSONB but SQLite doesn't natively support it exactly like PG.
    # Actually, SQLAlchemy 2.x JSON is supported by sqlite. Let's use JSON.
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSONB().with_variant(String(), "sqlite"), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
