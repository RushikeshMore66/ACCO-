import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReplyClassification(str, enum.Enum):
    PAYMENT_PROMISE = "PAYMENT_PROMISE"
    PAYMENT_CLAIM = "PAYMENT_CLAIM"
    DISPUTE = "DISPUTE"
    INVOICE_COPY_REQUEST = "INVOICE_COPY_REQUEST"
    PAYMENT_PLAN_REQUEST = "PAYMENT_PLAN_REQUEST"
    NEED_MORE_INFORMATION = "NEED_MORE_INFORMATION"
    PAYMENT_REFUSAL = "PAYMENT_REFUSAL"
    GENERAL_REPLY = "GENERAL_REPLY"
    AUTOMATED_REPLY = "AUTOMATED_REPLY"
    BOUNCE_OR_DELIVERY_NOTICE = "BOUNCE_OR_DELIVERY_NOTICE"
    UNRELATED = "UNRELATED"
    UNCERTAIN = "UNCERTAIN"


class AnalysisStatus(str, enum.Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    ACCEPTED = "ACCEPTED"
    DISMISSED = "DISMISSED"


class CustomerReplyAnalysis(Base):
    __tablename__ = "customer_reply_analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("collection_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("invoices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    classification: Mapped[ReplyClassification] = mapped_column(
        Enum(ReplyClassification, name="replyclassification"), nullable=False
    )
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)

    # JSON works in SQLite tests; PostgreSQL stores JSONB in production.
    analysis_payload: Mapped[dict] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), nullable=False
    )

    model_provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)

    status: Mapped[AnalysisStatus] = mapped_column(
        Enum(AnalysisStatus, name="analysisstatus"),
        default=AnalysisStatus.PENDING_REVIEW,
        nullable=False,
        index=True,
    )
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "confidence_score >= 0 AND confidence_score <= 1",
            name="chk_reply_analysis_confidence_range",
        ),
        Index(
            "ix_reply_analysis_org_message_created",
            "organization_id",
            "source_message_id",
            "created_at",
        ),
    )
