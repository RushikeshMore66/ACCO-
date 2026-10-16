"""Role / permission matrix tests (Task 0.2)."""

import pytest

from app.core.permissions import can_assign_role, can_manage_user, expand_allowed_roles
from app.core.security import create_access_token, get_password_hash
from app.models.organization import Organization
from app.models.user import User, UserRole


def _make_user(db, org: Organization, role: UserRole) -> User:
    user = User(
        email=f"{role.value.lower()}@{org.slug}.example.com",
        full_name=f"{role.value} user",
        password_hash=get_password_hash("securepassword123"),
        organization_id=org.id,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def org(db_session) -> Organization:
    organization = Organization(name="Roles Org", slug="roles-org")
    db_session.add(organization)
    db_session.commit()
    return organization


def test_admin_role_exists_and_persists(db_session, org):
    user = _make_user(db_session, org, UserRole.ADMIN)
    db_session.expire_all()
    assert db_session.get(User, user.id).role is UserRole.ADMIN


def test_expand_allowed_roles_adds_admin_only_with_owner():
    assert UserRole.ADMIN in expand_allowed_roles([UserRole.OWNER])
    assert UserRole.ADMIN not in expand_allowed_roles([UserRole.FINANCE_MANAGER])


# (role, PUT /collections/policy allowed?, GET /dashboard/summary allowed?)
MATRIX = [
    (UserRole.OWNER, True, True),
    (UserRole.ADMIN, True, True),
    (UserRole.FINANCE_MANAGER, True, True),
    (UserRole.COLLECTOR, False, True),
    (UserRole.VIEWER, False, True),
]


@pytest.mark.parametrize(("role", "can_write_policy", "can_read_dashboard"), MATRIX)
def test_permission_matrix(
    client, db_session, org, session_headers, role, can_write_policy, can_read_dashboard
):
    headers = session_headers(_make_user(db_session, org, role))

    write = client.put("/api/v1/collections/policy", json={}, headers=headers)
    if can_write_policy:
        assert write.status_code != 403, write.text
    else:
        assert write.status_code == 403

    read = client.get("/api/v1/dashboard/summary", headers=headers)
    assert (read.status_code != 403) is can_read_dashboard


def test_unauthenticated_requests_are_rejected(client):
    assert client.put("/api/v1/collections/policy", json={}).status_code == 401
    assert client.get("/api/v1/dashboard/summary").status_code == 401


@pytest.mark.parametrize(
    ("actor", "target", "expected"),
    [
        (UserRole.OWNER, UserRole.ADMIN, True),
        (UserRole.OWNER, UserRole.OWNER, True),
        (UserRole.ADMIN, UserRole.OWNER, False),
        (UserRole.ADMIN, UserRole.ADMIN, False),
        (UserRole.ADMIN, UserRole.COLLECTOR, True),
        (UserRole.FINANCE_MANAGER, UserRole.VIEWER, False),
        (UserRole.COLLECTOR, UserRole.VIEWER, False),
        (UserRole.VIEWER, UserRole.VIEWER, False),
    ],
)
def test_role_assignment_rules(actor, target, expected):
    assert can_assign_role(actor, target) is expected
    assert can_manage_user(actor, target) is expected


def test_admin_cannot_cross_tenants(client, db_session, org):

    other = Organization(name="Other", slug="other-org")
    db_session.add(other)
    db_session.commit()
    admin = _make_user(db_session, org, UserRole.ADMIN)
    other_owner = _make_user(db_session, other, UserRole.OWNER)
    # A token claiming the wrong organization for the user is rejected outright.
    forged = create_access_token(
        subject=str(admin.id), organization_id=str(other_owner.organization_id)
    )
    resp = client.get("/api/v1/dashboard/summary", headers={"Authorization": f"Bearer {forged}"})
    assert resp.status_code == 401
