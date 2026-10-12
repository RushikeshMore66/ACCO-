"""
Email provider abstraction and adapters.
Provides idempotent dispatch with provider message tracking and error categorization.
"""
from typing import Optional, Protocol, runtime_checkable
import uuid
import httpx

from app.core.config import settings

class EmailProviderError(Exception):
    def __init__(self, message: str, error_code: str = "PROVIDER_ERROR", is_transient: bool = False):
        super().__init__(message)
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
        from_email: Optional[str] = None
    ) -> dict:
        """
        Dispatches email. Returns dictionary with at least 'provider_message_id'.
        Raises EmailProviderError on failure.
        """
        ...


class ResendEmailProvider:
    def __init__(self, api_key: Optional[str] = None, default_from: Optional[str] = None):
        self.api_key = api_key or settings.resend_api_key
        self.default_from = default_from or getattr(settings, "default_from_email", "billing@acco.app")

    def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        idempotency_key: str,
        from_email: Optional[str] = None
    ) -> dict:
        if not self.api_key:
            raise EmailProviderError(
                "Resend API key is not configured",
                error_code="MISSING_API_KEY",
                is_transient=False
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
                    "https://api.resend.com/emails",
                    json=payload,
                    headers=headers
                )
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise EmailProviderError(
                f"Network error contacting Resend: {str(exc)}",
                error_code="NETWORK_TIMEOUT",
                is_transient=True
            ) from exc

        if response.status_code >= 500 or response.status_code == 429:
            raise EmailProviderError(
                f"Resend service error ({response.status_code}): {response.text}",
                error_code=f"HTTP_{response.status_code}",
                is_transient=True
            )

        if response.status_code >= 400:
            raise EmailProviderError(
                f"Resend client error ({response.status_code}): {response.text}",
                error_code=f"HTTP_{response.status_code}",
                is_transient=False
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
        from_email: Optional[str] = None
    ) -> dict:
        if self.simulate_transient_error:
            raise EmailProviderError(self.error_message, error_code="SIMULATED_TRANSIENT", is_transient=True)
        if self.simulate_permanent_error:
            raise EmailProviderError(self.error_message, error_code="SIMULATED_PERMANENT", is_transient=False)

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


_global_provider: Optional[EmailProvider] = None

def get_email_provider() -> EmailProvider:
    global _global_provider
    if _global_provider is not None:
        return _global_provider
    if settings.resend_api_key:
        return ResendEmailProvider()
    return MockEmailProvider()

def set_email_provider(provider: Optional[EmailProvider]) -> None:
    global _global_provider
    _global_provider = provider
