from fastapi import Header

from app.db.session import get_db

# Re-export get_db for convenient dependency injection
__all__ = ["get_current_organization_id", "get_db"]


async def get_current_organization_id(
    x_organization_id: str | None = Header(None, alias="X-Organization-ID")
) -> str:
    """
    Placeholder dependency resolving the active tenant (Organization ID).
    In subsequent Auth milestones, this will validate cryptographic JWT claims
    and ensure the user has verified membership in this organization.
    """
    if not x_organization_id:
        # Default placeholder tenant for scaffold liveness testing
        return "org_scaffold_default"
    return x_organization_id
