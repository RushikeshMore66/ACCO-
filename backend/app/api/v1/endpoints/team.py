"""Organization user management (tenant-scoped, role-gated, audited)."""

import secrets
import uuid
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_roles
from app.core.permissions import can_assign_role, can_manage_user
from app.core.security import get_password_hash
from app.models.auth_tokens import UserTokenPurpose
from app.models.user import User, UserRole
from app.schemas.team import (
    MfaResetRequest,
    TeamInviteRequest,
    TeamMemberResponse,
    TeamRoleUpdateRequest,
)
from app.services import auth_email, auth_service
from app.services.audit_service import record_audit_event

router = APIRouter()

INVITE_TTL = timedelta(hours=72)

_viewers = require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER])
_managers = require_roles([UserRole.OWNER, UserRole.ADMIN])


def _member(user: User) -> TeamMemberResponse:
    if not user.is_active:
        member_status = "INACTIVE"
    elif user.email_verified_at is None and user.last_login_at is None:
        member_status = "PENDING_INVITATION"
    else:
        member_status = "ACTIVE"
    return TeamMemberResponse(
        id=user.id,
        organization_id=user.organization_id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        status=member_status,
        is_active=user.is_active,
        mfa_enabled=user.mfa_enabled_at is not None,
        invited_at=user.created_at if member_status == "PENDING_INVITATION" else None,
        created_at=user.created_at,
    )


def _target(db: Session, actor: User, user_id: uuid.UUID) -> User:
    """Tenant-scoped lookup: other organizations' users are indistinguishable from missing."""
    user = db.scalar(
        select(User).where(User.id == user_id, User.organization_id == actor.organization_id)
    )
    if user is None:
        raise HTTPException(status_code=404, detail="Team member not found")
    return user


def _ensure_not_last_owner(db: Session, target: User) -> None:
    if target.role != UserRole.OWNER or not target.is_active:
        return
    owners = db.scalar(
        select(func.count())
        .select_from(User)
        .where(
            User.organization_id == target.organization_id,
            User.role == UserRole.OWNER,
            User.is_active.is_(True),
        )
    )
    if (owners or 0) <= 1:
        raise HTTPException(status_code=409, detail="An organization must keep at least one owner")


@router.get("", response_model=list[TeamMemberResponse])
def list_team(db: Session = Depends(get_db), current_user: User = Depends(_viewers)):
    users = db.scalars(
        select(User)
        .where(User.organization_id == current_user.organization_id)
        .order_by(User.created_at, User.id)
    ).all()
    return [_member(u) for u in users]


@router.post("/invites", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
def invite_member(
    request: TeamInviteRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(_managers),
):
    if not can_assign_role(current_user.role, request.role):
        raise HTTPException(status_code=403, detail="You cannot grant that role")
    email = auth_service.normalize_email(request.email)
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email already in use")

    invitee = User(
        email=email,
        full_name=request.full_name.strip(),
        # Unusable random password: the invitee sets their own through the emailed link.
        password_hash=get_password_hash(secrets.token_urlsafe(48)),
        organization_id=current_user.organization_id,
        role=request.role,
    )
    db.add(invitee)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already in use")
    token = auth_service.create_user_token(db, invitee, UserTokenPurpose.PASSWORD_RESET, INVITE_TTL)
    record_audit_event(
        db,
        action="team.invited",
        actor=current_user,
        entity_type="user",
        entity_id=invitee.id,
        after={"role": request.role},
    )
    db.commit()
    db.refresh(invitee)
    background.add_task(
        auth_email.send_invitation_email, invitee.email, current_user.full_name, token
    )
    return _member(invitee)


@router.patch("/{user_id}/role", response_model=TeamMemberResponse)
def update_role(
    user_id: uuid.UUID,
    request: TeamRoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_managers),
):
    target = _target(db, current_user, user_id)
    if target.id == current_user.id:
        raise HTTPException(status_code=403, detail="You cannot change your own role")
    if not can_manage_user(current_user.role, target.role) or not can_assign_role(
        current_user.role, request.role
    ):
        raise HTTPException(status_code=403, detail="Not enough permissions for this change")
    if target.role == request.role:
        return _member(target)
    if request.role != UserRole.OWNER:
        _ensure_not_last_owner(db, target)

    target.role = request.role
    # Role changes take effect immediately: privileged roles must re-authenticate with MFA.
    auth_service.revoke_all_user_sessions(db, target.id, "role_changed")
    db.commit()
    db.refresh(target)
    return _member(target)


@router.post("/{user_id}/deactivate", response_model=TeamMemberResponse)
def deactivate_member(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(_managers),
):
    target = _target(db, current_user, user_id)
    if target.id == current_user.id:
        raise HTTPException(status_code=403, detail="You cannot deactivate yourself")
    if not can_manage_user(current_user.role, target.role):
        raise HTTPException(status_code=403, detail="Not enough permissions for this change")
    _ensure_not_last_owner(db, target)
    target.is_active = False
    auth_service.revoke_all_user_sessions(db, target.id, "deactivated")
    db.commit()
    db.refresh(target)
    return _member(target)


@router.post("/{user_id}/reactivate", response_model=TeamMemberResponse)
def reactivate_member(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(_managers),
):
    target = _target(db, current_user, user_id)
    if not can_manage_user(current_user.role, target.role):
        raise HTTPException(status_code=403, detail="Not enough permissions for this change")
    target.is_active = True
    db.commit()
    db.refresh(target)
    return _member(target)


@router.post("/{user_id}/mfa/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_member_mfa(
    user_id: uuid.UUID,
    request: MfaResetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_managers),
):
    """Controlled MFA recovery for a colleague who lost their device and recovery codes."""
    target = _target(db, current_user, user_id)
    if target.id == current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Reset your own MFA with your recovery codes or ask another owner/admin",
        )
    if not can_manage_user(current_user.role, target.role):
        raise HTTPException(status_code=403, detail="Not enough permissions for this change")
    auth_service.reset_user_mfa(db, target, actor=current_user, reason=request.reason.strip())
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
