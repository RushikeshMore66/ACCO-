import enum
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Index, String, event
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AuditActorType(str, enum.Enum):
    USER = "USER"
    SYSTEM = "SYSTEM"
    WORKER = "WORKER"
    WEBHOOK = "WEBHOOK"
    ANONYMOUS = "ANONYMOUS"


class AuditEvent(Base):
    """Append-only record of a security- or finance-relevant action.

    Immutable by design: ORM update/delete is blocked here, and PostgreSQL enforces the
    same with a trigger plus revoked privileges (see migration 20261016_10_audit_events).
    ``organization_id`` is nullable only for events that precede tenant resolution
    (e.g. a failed login for an unknown email).
    """

    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_org_created", "organization_id", "created_at"),
        Index("ix_audit_events_org_entity", "organization_id", "entity_type", "entity_id"),
        Index("ix_audit_events_org_action", "organization_id", "action"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True
    )
    actor_type: Mapped[AuditActorType] = mapped_column(
        Enum(AuditActorType, name="auditactortype"), nullable=False
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    before: Mapped[dict[str, Any] | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), nullable=True
    )
    after: Mapped[dict[str, Any] | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Declared so the unit of work flushes an organization before its audit events
    # (SQLAlchemy orders unrelated mappers by relationship, not by foreign key alone).
    organization = relationship("Organization", lazy="raise", viewonly=False)


class AuditImmutableError(RuntimeError):
    """Raised when code attempts to modify or delete an audit event."""


@event.listens_for(AuditEvent, "before_update")
def _block_update(mapper, connection, target) -> None:
    raise AuditImmutableError("Audit events are append-only and cannot be updated.")


@event.listens_for(AuditEvent, "before_delete")
def _block_delete(mapper, connection, target) -> None:
    raise AuditImmutableError("Audit events are append-only and cannot be deleted.")
