"""Read-only audit trail. There is deliberately no create/update/delete API."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.core.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.models.audit_event import AuditEvent
from app.models.user import User, UserRole
from app.schemas.audit import AuditEventResponse
from app.utils.pagination import Page

router = APIRouter()


@router.get("", response_model=Page[AuditEventResponse])
def list_audit_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    action: str | None = Query(None, max_length=100),
    entity_type: str | None = Query(None, max_length=100),
    entity_id: str | None = Query(None, max_length=64),
    actor_user_id: str | None = Query(None, max_length=64),
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.ADMIN])),
):
    # Always tenant-scoped: events with no organization (pre-auth) are never returned here.
    conditions = [AuditEvent.organization_id == current_user.organization_id]
    if action:
        conditions.append(AuditEvent.action == action)
    if entity_type:
        conditions.append(AuditEvent.entity_type == entity_type)
    if entity_id:
        conditions.append(AuditEvent.entity_id == entity_id)
    if actor_user_id:
        conditions.append(AuditEvent.actor_user_id == actor_user_id)
    if created_from:
        conditions.append(AuditEvent.created_at >= created_from)
    if created_to:
        conditions.append(AuditEvent.created_at <= created_to)

    total = db.scalar(select(func.count()).select_from(AuditEvent).where(*conditions)) or 0
    rows = db.scalars(
        select(AuditEvent)
        .where(*conditions)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page(
        items=[AuditEventResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )
