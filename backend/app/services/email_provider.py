"""
Email provider abstraction and adapters.
Provides idempotent dispatch with provider message tracking and error categorization.
"""

import uuid
from typing import Protocol, runtime_checkable

import httpx

from app.core.config import settings


class EmailProviderError(Exception):
    def __init__(
        self, message: str, error_code: str = "PROVIDER_ERROR", is_transient: bool = False
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.is_transient = is_transient


@runtime_checkable
class EmailProvider(Protocol):
    def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        idempotency_key: str,
        from_email: str | None = None,
    ) -> dict:
        """
        Dispatches email. Returns dictionary with at least 'provider_message_id'.
        Raises EmailProviderError on failure.
        """
        ...


class ResendEmailProvider:
    def __init__(self, api_key: str | None = None, default_from: str | None = None):
        self.api_key = api_key or settings.resend_api_key
        self.default_from = default_from or getattr(
            settings, "default_from_email", "billing@acco.app"
        )

    def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        idempotency_key: str,
        from_email: str | None = None,
    ) -> dict:
        if not self.api_key:
            raise EmailProviderError(
                "Resend API key is not configured", error_code="MISSING_API_KEY", is_transient=False
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key,
        }
        payload = {
            "from": from_email or self.default_from,
            "to": [to_email],
            "subject": subject,
            "html": body,
        }

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(
                    "https://api.resend.com/emails", json=payload, headers=headers
                )
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise EmailProviderError(
                f"Network error contacting Resend: {exc!s}",
                error_code="NETWORK_TIMEOUT",
                is_transient=True,
            ) from exc

        if response.status_code >= 500 or response.status_code == 429:
            raise EmailProviderError(
                f"Resend service error ({response.status_code}): {response.text}",
                error_code=f"HTTP_{response.status_code}",
                is_transient=True,
            )

        if response.status_code >= 400:
            raise EmailProviderError(
                f"Resend client error ({response.status_code}): {response.text}",
                error_code=f"HTTP_{response.status_code}",
                is_transient=False,
            )

        data = response.json()
        provider_message_id = data.get("id") or str(uuid.uuid4())
        return {"provider_message_id": provider_message_id}


class MockEmailProvider:
    def __init__(self):
        self.sent_messages = []
        self.simulate_transient_error = False
        self.simulate_permanent_error = False
        self.error_message = "Simulated failure"

    def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        idempotency_key: str,
        from_email: str | None = None,
    ) -> dict:
        if self.simulate_transient_error:
            raise EmailProviderError(
                self.error_message, error_code="SIMULATED_TRANSIENT", is_transient=True
            )
        if self.simulate_permanent_error:
            raise EmailProviderError(
                self.error_message, error_code="SIMULATED_PERMANENT", is_transient=False
            )

        provider_message_id = f"mock_msg_{uuid.uuid4().hex[:12]}"
        record = {
            "to": to_email,
            "subject": subject,
            "body": body,
            "idempotency_key": idempotency_key,
            "from": from_email,
            "provider_message_id": provider_message_id,
        }
        self.sent_messages.append(record)
        return {"provider_message_id": provider_message_id}


_global_provider: EmailProvider | None = None


def get_email_provider() -> EmailProvider:
    if _global_provider is not None:
        return _global_provider
    if settings.resend_api_key:
        return ResendEmailProvider()
    return MockEmailProvider()


def set_email_provider(provider: EmailProvider | None) -> None:
    global _global_provider
    _global_provider = provider


@runtime_checkable
class EmailReceivingProvider(Protocol):
    def get_received_email(self, email_id: str) -> dict:
        """
        Retrieves received email content and headers by email_id.
        Returns dict matching Resend receiving email schema.
        Raises EmailProviderError on failure.
        """
        ...


class ResendReceivingProvider:
    def __init__(self, api_key: str | None = None, base_url: str = "https://api.resend.com"):
        self.api_key = api_key or (
            settings.resend_api_key.get_secret_value() if settings.resend_api_key else None
        )
        self.base_url = base_url.rstrip("/")

    def get_received_email(self, email_id: str) -> dict:
        if not self.api_key:
            raise EmailProviderError(
                "Resend API key is not configured for receiving API",
                error_code="MISSING_API_KEY",
                is_transient=False,
            )

        url = f"{self.base_url}/emails/receiving/{email_id}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
                response = client.get(url, headers=headers)
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise EmailProviderError(
                f"Network error contacting Resend receiving API: {exc!s}",
                error_code="NETWORK_TIMEOUT",
                is_transient=True,
            ) from exc

        if response.status_code == 404:
            raise EmailProviderError(
                f"Received email {email_id} not found in Resend (404)",
                error_code="MESSAGE_NOT_FOUND",
                is_transient=False,
            )

        if response.status_code in (401, 403):
            raise EmailProviderError(
                f"Authentication failed retrieving email from Resend ({response.status_code})",
                error_code="AUTHENTICATION_FAILED",
                is_transient=False,
            )

        if response.status_code == 429:
            raise EmailProviderError(
                "Resend receiving API rate limit exceeded (429)",
                error_code="RATE_LIMITED",
                is_transient=True,
            )

        if response.status_code >= 500:
            raise EmailProviderError(
                f"Resend service error retrieving email ({response.status_code})",
                error_code=f"HTTP_{response.status_code}",
                is_transient=True,
            )

        if response.status_code >= 400:
            raise EmailProviderError(
                f"Resend client error ({response.status_code}): {response.text}",
                error_code=f"HTTP_{response.status_code}",
                is_transient=False,
            )

        try:
            data = response.json()
        except Exception as exc:
            raise EmailProviderError(
                "Malformed JSON response from Resend receiving API",
                error_code="MALFORMED_RESPONSE",
                is_transient=False,
            ) from exc

        if not isinstance(data, dict):
            raise EmailProviderError(
                "Invalid response structure from Resend receiving API",
                error_code="INVALID_RESPONSE",
                is_transient=False,
            )

        return data


class MockReceivingProvider:
    def __init__(self, emails: dict[str, dict] | None = None):
        self.emails: dict[str, dict] = dict(emails) if emails else {}
        self.calls: list[str] = []
        self.simulate_transient_error = False
        self.simulate_permanent_error = False
        self.error_message = "Simulated retrieval failure"

    def get_received_email(self, email_id: str) -> dict:
        self.calls.append(email_id)
        if self.simulate_transient_error:
            raise EmailProviderError(
                self.error_message,
                error_code="SIMULATED_TRANSIENT",
                is_transient=True,
            )
        if self.simulate_permanent_error:
            raise EmailProviderError(
                self.error_message,
                error_code="SIMULATED_PERMANENT",
                is_transient=False,
            )
        if email_id not in self.emails:
            raise EmailProviderError(
                f"Email {email_id} not found in mock store",
                error_code="MESSAGE_NOT_FOUND",
                is_transient=False,
            )
        return self.emails[email_id]


_global_receiving_provider: EmailReceivingProvider | None = None


def get_receiving_provider() -> EmailReceivingProvider:
    if _global_receiving_provider is not None:
        return _global_receiving_provider
    if settings.resend_api_key:
        return ResendReceivingProvider()
    return MockReceivingProvider()


def set_receiving_provider(provider: EmailReceivingProvider | None) -> None:
    global _global_receiving_provider
    _global_receiving_provider = provider
