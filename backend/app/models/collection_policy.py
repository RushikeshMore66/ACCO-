import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.organization import Organization


class CollectionPolicy(Base):
    __tablename__ = "collection_policies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    initial_reminder_after_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    follow_up_after_days: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    escalation_after_days: Mapped[int] = mapped_column(Integer, default=31, nullable=False)

    require_approval_before_send: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    pause_collection_on_dispute: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    pause_collection_on_payment_promise: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    organization: Mapped["Organization"] = relationship("Organization")

    __table_args__ = (
        CheckConstraint("initial_reminder_after_days >= 1", name="chk_initial_reminder_days"),
        CheckConstraint(
            "follow_up_after_days > initial_reminder_after_days", name="chk_follow_up_days"
        ),
        CheckConstraint("escalation_after_days > follow_up_after_days", name="chk_escalation_days"),
    )
