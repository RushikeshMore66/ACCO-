import json
from collections.abc import Callable
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.ai.openai_provider import ReplyExtractionProvider
from app.api.deps import get_db
from app.api.v1.endpoints.reply_analyses import get_reply_provider_factory
from app.models.audit_event import AuditActorType
from app.models.audit_hooks import mark_session_actor
from app.models.email_delivery import DeliveryStatus, EmailDelivery, EmailWebhookEvent
from app.services.email_provider import EmailReceivingProvider, get_receiving_provider
from app.services.inbound_email_service import (
    InboundWebhookError,
    process_inbound_email_event,
    validate_webhook_security,
)

router = APIRouter()


def get_receiving_provider_dep() -> EmailReceivingProvider:
    return get_receiving_provider()


@router.post("/email/inbound", status_code=status.HTTP_200_OK)
async def inbound_email_webhook(
    request: Request,
    db: Session = Depends(get_db),
    provider_factory: Callable[[], ReplyExtractionProvider] = Depends(get_reply_provider_factory),
    receiving_provider: EmailReceivingProvider = Depends(get_receiving_provider_dep),
):
    """
    Provider-specific inbound email webhook endpoint for receiving customer replies.
    Validates signature, deduplicates events, retrieves content if metadata-only,
    safely matches customer/invoice/thread, persists inbound collection message,
    and triggers advisory AI reply analysis.
    """
    mark_session_actor(db, actor_type=AuditActorType.WEBHOOK)
    body_bytes = await request.body()
    headers_dict = dict(request.headers)

    # 1. Enforce consistent webhook signature and replay-window verification
    try:
        validate_webhook_security(body_bytes=body_bytes, headers=headers_dict)
    except InboundWebhookError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None

    try:
        result = process_inbound_email_event(
            db,
            body_bytes=body_bytes,
            headers=headers_dict,
            provider_factory=provider_factory,
            receiving_provider=receiving_provider,
            skip_security_validation=True,
        )
        return result
    except InboundWebhookError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 - roll back and hide internals behind an opaque 500
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error processing inbound email webhook",
        ) from None


@router.post("/email/resend", status_code=status.HTTP_200_OK)
async def resend_webhook(
    request: Request,
    db: Session = Depends(get_db),
    provider_factory: Callable[[], ReplyExtractionProvider] = Depends(get_reply_provider_factory),
    receiving_provider: EmailReceivingProvider = Depends(get_receiving_provider_dep),
):
    """
    Existing Resend webhook endpoint. Enforces the same signature verification policy.
    Handles delivery status events (delivered, bounced, complained) and transparently
    routes inbound customer replies (email.received) to the inbound pipeline.
    """
    mark_session_actor(db, actor_type=AuditActorType.WEBHOOK)
    body_bytes = await request.body()
    headers_dict = dict(request.headers)

    # 1. Enforce consistent webhook signature and replay-window verification
    try:
        validate_webhook_security(body_bytes=body_bytes, headers=headers_dict)
    except InboundWebhookError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None

    try:
        payload_data = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Malformed JSON webhook payload")

    if not isinstance(payload_data, dict):
        raise HTTPException(status_code=400, detail="Webhook payload must be a JSON object")

    event_type = payload_data.get("type", "email.delivered")

    # If this is an inbound email event, delegate to inbound processing
    if event_type == "email.received":
        try:
            return process_inbound_email_event(
                db,
                body_bytes=body_bytes,
                headers=headers_dict,
                provider_factory=provider_factory,
                receiving_provider=receiving_provider,
                skip_security_validation=True,
            )
        except InboundWebhookError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from None

    norm_headers = {k.lower(): v for k, v in headers_dict.items()}
    svix_id = norm_headers.get("svix-id") or norm_headers.get("webhook-id")
    provider_event_id = svix_id or payload_data.get("data", {}).get("email_id") or "unknown"
    provider_message_id = (
        payload_data.get("data", {}).get("email_id") or payload_data.get("email_id") or "unknown"
    )

    # 2. Deduplicate event
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
            select(EmailDelivery).where(EmailDelivery.provider_message_id == provider_message_id)
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
