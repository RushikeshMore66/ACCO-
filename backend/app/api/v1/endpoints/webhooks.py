import json
from collections.abc import Callable
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.ai.openai_provider import ReplyExtractionProvider
from app.api.deps import get_db
from app.api.v1.endpoints.reply_analyses import get_reply_provider_factory
from app.core.config import settings
from app.models.email_delivery import DeliveryStatus, EmailDelivery, EmailWebhookEvent
from app.services.inbound_email_service import (
    InboundWebhookError,
    process_inbound_email_event,
    verify_svix_signature,
)

router = APIRouter()


async def get_raw_body(request: Request) -> bytes:
    return await request.body()


@router.post("/email/inbound", status_code=status.HTTP_200_OK)
def inbound_email_webhook(
    request: Request,
    body_bytes: bytes = Depends(get_raw_body),
    db: Session = Depends(get_db),
    provider_factory: Callable[[], ReplyExtractionProvider] = Depends(get_reply_provider_factory),
):
    """
    Provider-specific inbound email webhook endpoint for receiving customer replies.
    Validates signature, deduplicates events, safely matches customer/invoice/thread,
    persists inbound collection message, and triggers advisory AI reply analysis.
    """
    headers_dict = dict(request.headers)

    try:
        result = process_inbound_email_event(
            db,
            body_bytes=body_bytes,
            headers=headers_dict,
            provider_factory=provider_factory,
        )
        return result
    except InboundWebhookError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error processing inbound email webhook",
        ) from None


@router.post("/email/resend", status_code=status.HTTP_200_OK)
def resend_webhook(
    request: Request,
    body_bytes: bytes = Depends(get_raw_body),
    db: Session = Depends(get_db),
    provider_factory: Callable[[], ReplyExtractionProvider] = Depends(get_reply_provider_factory),
):
    """
    Existing Resend webhook endpoint. Handles delivery status events (delivered, bounced, complained)
    and transparently routes inbound customer replies (email.received) to the inbound pipeline.
    """
    headers_dict = dict(request.headers)
    svix_id = headers_dict.get("svix-id") or headers_dict.get("webhook-id")
    svix_timestamp = headers_dict.get("svix-timestamp") or headers_dict.get("webhook-timestamp")
    svix_signature = headers_dict.get("svix-signature") or headers_dict.get("webhook-signature")

    if not svix_id:
        raise HTTPException(status_code=400, detail="Missing Svix header: svix-id")

    # In production with configured signing secret, enforce signature validation
    if settings.email_webhook_signing_secret:
        if not svix_timestamp or not svix_signature:
            raise HTTPException(status_code=400, detail="Missing Svix signature headers")
        
        # Verify using standard Svix verification
        is_valid = verify_svix_signature(
            body_bytes=body_bytes,
            headers=headers_dict,
            secret_value=settings.email_webhook_signing_secret.get_secret_value(),
        )
        if not is_valid:
            # Fallback check with svix package if installed
            try:
                from svix.webhooks import Webhook
                wh = Webhook(settings.email_webhook_signing_secret.get_secret_value())
                wh.verify(body_bytes.decode("utf-8"), headers_dict)
            except Exception:
                raise HTTPException(status_code=401, detail="Invalid webhook signature") from None

        try:
            payload_data = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Malformed JSON webhook payload")
    else:
        try:
            payload_data = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
        except json.JSONDecodeError:
            payload_data = {}

    event_type = payload_data.get("type", "email.delivered")

    # If this is an inbound email event, delegate to inbound processing
    if event_type == "email.received":
        try:
            return process_inbound_email_event(
                db,
                body_bytes=body_bytes,
                headers=headers_dict,
                provider_factory=provider_factory,
            )
        except InboundWebhookError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from None

    provider_event_id = svix_id
    provider_message_id = (
        payload_data.get("data", {}).get("email_id")
        or payload_data.get("email_id")
        or "unknown"
    )

    # 2. Deduplicate inbound event
    existing = db.scalar(
        select(EmailWebhookEvent).where(
            EmailWebhookEvent.provider == "resend",
            EmailWebhookEvent.provider_event_id == provider_event_id,
        )
    )
    if existing:
        return {"status": "already processed"}

    # 3. Match and update delivery record
    delivery = None
    if provider_message_id and provider_message_id != "unknown":
        delivery = db.scalar(
            select(EmailDelivery).where(
                EmailDelivery.provider_message_id == provider_message_id
            )
        )
        if delivery:
            if event_type == "email.delivered":
                delivery.status = DeliveryStatus.DELIVERED
                delivery.delivered_at = datetime.now(UTC)
            elif event_type in ("email.bounced", "email.failed"):
                delivery.status = DeliveryStatus.BOUNCED
                delivery.bounced_at = datetime.now(UTC)
            elif event_type == "email.complained":
                delivery.status = DeliveryStatus.COMPLAINED
                delivery.complained_at = datetime.now(UTC)

    # 4. Record Event audit
    webhook_event = EmailWebhookEvent(
        provider="resend",
        provider_event_id=provider_event_id,
        provider_message_id=provider_message_id,
        event_type=event_type,
        email_delivery_id=delivery.id if delivery else None,
        event_timestamp=datetime.now(UTC),
        processing_result="SUCCESS",
    )
    db.add(webhook_event)
    db.commit()

    return {"status": "processed"}

