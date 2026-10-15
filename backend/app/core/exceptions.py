from typing import Any


class ACCOException(Exception):
    """Base exception for all ACCO application errors."""

    def __init__(self, message: str, details: Any | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class TenantNotFoundException(ACCOException):
    """Raised when an organization tenant cannot be resolved or accessed."""


class TenantIsolationViolation(ACCOException):
    """Raised when an operation attempts to access data outside the authenticated tenant."""


class EntityNotFoundException(ACCOException):
    """Raised when a requested entity does not exist within the tenant scope."""


class PolicyViolationException(ACCOException):
    """Raised when an automated or requested collection action violates deterministic collection policy."""


class ApprovalRequiredException(ACCOException):
    """Raised when a sensitive collection or financial action requires human sign-off."""


class IdempotencyConflictException(ACCOException):
    """Raised when an operation with an existing idempotency key is already in progress or completed."""
