import httpx
from typing import Optional
from pydantic import BaseModel

class EmailSendResult(BaseModel):
    success: bool
    provider_message_id: Optional[str] = None
    error_code: Optional[str] = None
    error_summary: Optional[str] = None
    is_transient: bool = False

class EmailProvider:
    def send_email(self, recipient: str, subject: str, body: str, idempotency_key: str) -> EmailSendResult:
        raise NotImplementedError

class ResendProvider(EmailProvider):
    def __init__(self, api_key: str, from_address: str):
        self.api_key = api_key
        self.from_address = from_address
        self.base_url = "https://api.resend.com/emails"
        
    def send_email(self, recipient: str, subject: str, body: str, idempotency_key: str) -> EmailSendResult:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key
        }
        payload = {
            "from": self.from_address,
            "to": [recipient],
            "subject": subject,
            "html": body
        }
        
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(self.base_url, headers=headers, json=payload)
                
            if response.status_code in (200, 201):
                data = response.json()
                return EmailSendResult(success=True, provider_message_id=data.get("id"))
                
            if response.status_code >= 500 or response.status_code == 429:
                return EmailSendResult(
                    success=False, 
                    error_code=str(response.status_code), 
                    error_summary="Transient API Error", 
                    is_transient=True
                )
                
            return EmailSendResult(
                success=False, 
                error_code=str(response.status_code), 
                error_summary="Permanent API Error", 
                is_transient=False
            )
            
        except httpx.RequestError as e:
            return EmailSendResult(
                success=False, 
                error_code="NETWORK_ERROR", 
                error_summary=str(e), 
                is_transient=True
            )
