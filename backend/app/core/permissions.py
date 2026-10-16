"""Role / permission matrix (single source of truth).

ADMIN is tenant-scoped, exactly like every other role: it has the same powers as
OWNER *inside its own organization* and nothing across tenants. The only OWNER-only
capabilities are those in ``OWNER_ONLY`` (ownership and privilege-escalation actions).
"""

from app.models.user import UserRole

# Roles that may manage the organization (users, settings, approvals of sensitive actions).
MANAGEMENT_ROLES: frozenset[UserRole] = frozenset({UserRole.OWNER, UserRole.ADMIN})

# Roles for which TOTP MFA is mandatory (Task 0.5).
PRIVILEGED_ROLES: frozenset[UserRole] = MANAGEMENT_ROLES

# Actions only an OWNER may perform (ADMIN is deliberately excluded).
OWNER_ONLY: frozenset[str] = frozenset(
    {"assign_owner_role", "assign_admin_role", "remove_owner", "delete_organization"}
)


def expand_allowed_roles(allowed: list[UserRole] | frozenset[UserRole]) -> frozenset[UserRole]:
    """ADMIN inherits every endpoint that is open to OWNER."""
    roles = set(allowed)
    if UserRole.OWNER in roles:
        roles.add(UserRole.ADMIN)
    return frozenset(roles)


def can_assign_role(actor: UserRole, target: UserRole) -> bool:
    """Whether ``actor`` may grant ``target`` to another user in the same organization."""
    if actor == UserRole.OWNER:
        return True
    if actor == UserRole.ADMIN:
        return target not in (UserRole.OWNER, UserRole.ADMIN)
    return False


def can_manage_user(actor: UserRole, subject: UserRole) -> bool:
    """Whether ``actor`` may modify / deactivate a user currently holding ``subject``."""
    if actor == UserRole.OWNER:
        return True
    if actor == UserRole.ADMIN:
        return subject not in (UserRole.OWNER, UserRole.ADMIN)
    return False
