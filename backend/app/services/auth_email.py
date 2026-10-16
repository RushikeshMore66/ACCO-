"""Transactional account emails (verification, password reset).

Sent through the shared email provider abstraction. Without a configured provider key the
mock provider is used, so development and tests never send real mail. Failures are logged
without the recipient address or the link (the link is a bearer secret).
"""

import logging
import uuid
from urllib.parse import quote

from app.core.config import settings
from app.services.email_provider import EmailProviderError, get_email_provider

logger = logging.getLogger(__name__)


def _link(path: str, token: str) -> str:
    return f"{settings.frontend_base_url.rstrip('/')}{path}?token={quote(token)}"


def _send(to_email: str, subject: str, body: str, kind: str) -> None:
    try:
        get_email_provider().send_email(
            to_email=to_email,
            subject=subject,
            body=body,
            idempotency_key=f"auth-{kind}-{uuid.uuid4().hex}",
        )
    except EmailProviderError as exc:
        logger.error("Account email '%s' failed to send (%s)", kind, exc.error_code)
    except Exception:
        logger.exception("Account email '%s' failed unexpectedly", kind)


def send_verification_email(to_email: str, full_name: str, token: str) -> None:
    link = _link("/verify-email", token)
    if settings.is_development:
        logger.info("DEV ONLY verification link: %s", link)
    _send(
        to_email,
        "Verify your ACCO email address",
        f"Hello {full_name},\n\nConfirm your email address to finish setting up ACCO:\n{link}\n\n"
        f"This link expires in {settings.email_verification_ttl_hours} hours. "
        "If you did not create an account, ignore this message.",
        "verify",
    )


def send_password_reset_email(to_email: str, token: str) -> None:
    link = _link("/reset-password", token)
    if settings.is_development:
        logger.info("DEV ONLY password reset link: %s", link)
    _send(
        to_email,
        "Reset your ACCO password",
        f"We received a request to reset your ACCO password:\n{link}\n\n"
        f"This link expires in {settings.password_reset_ttl_minutes} minutes and works once. "
        "If you did not request it, you can safely ignore this message.",
        "reset",
    )


def send_invitation_email(to_email: str, inviter_name: str, token: str) -> None:
    link = _link("/reset-password", token)
    if settings.is_development:
        logger.info("DEV ONLY invitation link: %s", link)
    _send(
        to_email,
        "You have been invited to ACCO",
        f"{inviter_name} invited you to join their organization on ACCO.\n"
        f"Choose your password to activate your account:\n{link}\n\n"
        "This link expires in 72 hours and works once.",
        "invite",
    )
