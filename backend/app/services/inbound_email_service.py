"""
Inbound Email Processing Service for ACCO.
Handles signature verification, payload validation, sender normalization,
safe thread/customer/invoice matching, message persistence, and advisory AI analysis.
"""
from __future__ import annotations

import base64
import email.utils
import hashlib
import hmac
import html
import json
import logging
import re
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.adapters.ai.openai_provider import (
    AIProviderError,
    AIProviderNotConfigured,
    OpenAIProviderAdapter,
    ReplyExtractionProvider,
)
from app.core.config import settings
from app.models.collection_workflow import (
    CollectionActivity,
    CollectionMessage,
    EventType,
    MessageChannel,
    MessageDirection,
    MessageStatus,
)
from app.models.customer import Customer
from app.models.email_delivery import EmailDelivery, EmailWebhookEvent
from app.models.invoice import Invoice, InvoiceStatus
from app.services.customer_reply_intelligence import (
    ReplyAnalysisError,
    analyze_customer_reply,
)
from app.services.email_provider import (
    EmailProviderError,
    EmailReceivingProvider,
    get_receiving_provider,
)

logger = logging.getLogger(__name__)

# Enforce reasonable payload boundary (2MB)
MAX_INBOUND_PAYLOAD_BYTES = 2 * 1024 * 1024
DEFAULT_TOLERANCE_SECONDS = 300  # 5 minutes Svix replay window


class InboundWebhookError(Exception):
    """Base exception for inbound webhook processing errors."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class WebhookSignatureVerificationError(InboundWebhookError):
    def __init__(self, message: str = "Invalid webhook signature"):
        super().__init__(message, status_code=401)


class WebhookConfigurationError(InboundWebhookError):
    def __init__(self, message: str = "Webhook signing secret is not configured"):
        super().__init__(message, status_code=503)


class PayloadTooLargeError(InboundWebhookError):
    def __init__(self, message: str = "Webhook payload exceeds allowed size limit"):
        super().__init__(message, status_code=413)


def verify_svix_signature(
    *,
    body_bytes: bytes,
    headers: dict[str, str],
    secret_value: str | None,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
) -> bool:
    """
    Verify Svix HMAC-SHA256 signature according to the standard Svix / Standard Webhooks spec.
    Validates signature and enforces the replay tolerance window.
    """
    if not secret_value:
        return False

    # Svix headers (case-insensitive lookup)
    norm_headers = {k.lower(): v for k, v in headers.items()}
    svix_id = norm_headers.get("svix-id") or norm_headers.get("webhook-id")
    svix_timestamp = norm_headers.get("svix-timestamp") or norm_headers.get("webhook-timestamp")
    svix_signature = norm_headers.get("svix-signature") or norm_headers.get("webhook-signature")

    if not svix_id or not svix_timestamp or not svix_signature:
        return False

    # Enforce replay tolerance window
    try:
        ts = int(svix_timestamp)
    except ValueError:
        return False

    now = int(time.time())
    if abs(now - ts) > tolerance_seconds:
        logger.warning("Webhook timestamp %s outside tolerance window (%s seconds)", ts, tolerance_seconds)
        return False

    # Decode key: Svix secret starts with 'whsec_' followed by base64
    if secret_value.startswith("whsec_"):
        try:
            key = base64.b64decode(secret_value[6:])
        except ValueError:
            key = secret_value.encode("utf-8")
    else:
        key = secret_value.encode("utf-8")

    # Construct signed payload
    to_sign = f"{svix_id}.{svix_timestamp}.".encode() + body_bytes
    computed_digest = hmac.new(key, to_sign, hashlib.sha256).digest()
    computed_b64 = base64.b64encode(computed_digest).decode("utf-8")
    expected_v1 = f"v1,{computed_b64}"

    # Signatures can be space-delimited if secrets were rotated
    passed_signatures = svix_signature.strip().split()
    for sig in passed_signatures:
        if hmac.compare_digest(sig, expected_v1):
            return True

    return False


def validate_webhook_security(
    *,
    body_bytes: bytes,
    headers: dict[str, str],
) -> None:
    """
    Shared signature verification policy for all incoming email webhook endpoints:
      - In production (ACCO_ENVIRONMENT=production): fail closed (503) if signing secret is missing.
      - If signing secret is configured: reject missing headers (400), invalid signatures (401),
        or replay-window violations (401).
      - In non-production without configured secret: allow unsigned requests for local testing/dev.
    """
    is_prod = settings.environment.lower() == "production"
    signing_secret = settings.email_webhook_signing_secret

    if is_prod and not signing_secret:
        logger.error("Production email webhook rejected: signing secret is not configured")
        raise WebhookConfigurationError("Webhook signing secret is not configured in production")

    if signing_secret:
        norm_headers = {k.lower(): v for k, v in headers.items()}
        svix_id = norm_headers.get("svix-id") or norm_headers.get("webhook-id")
        svix_timestamp = norm_headers.get("svix-timestamp") or norm_headers.get("webhook-timestamp")
        svix_signature = norm_headers.get("svix-signature") or norm_headers.get("webhook-signature")

        if not svix_id or not svix_timestamp or not svix_signature:
            raise InboundWebhookError("Missing Svix signature headers", status_code=400)

        is_valid = verify_svix_signature(
            body_bytes=body_bytes,
            headers=headers,
            secret_value=signing_secret.get_secret_value(),
        )
        if not is_valid:
            logger.warning("Email webhook signature verification failed for event %s", svix_id)
            raise WebhookSignatureVerificationError("Invalid webhook signature")



def normalize_email_address(raw_address: str | None) -> str:
    """Extract clean, lowercase email address from display names or raw strings."""
    if not raw_address:
        return ""
    _, addr = email.utils.parseaddr(raw_address)
    clean = addr.strip().lower()
    if "@" in clean and "." in clean:
        return clean
    return ""


def clean_html_to_text(html_content: str) -> str:
    """Convert HTML content into plain text fallback."""
    if not html_content:
        return ""
    # Strip script and style tags
    cleaned = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html_content, flags=re.DOTALL | re.IGNORECASE)
    # Replace block breaks with newlines
    cleaned = re.sub(r"<(?:br|div|p|/p|/div)[^>]*>", "\n", cleaned, flags=re.IGNORECASE)
    # Strip remaining HTML tags
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    # Unescape HTML entities
    unescaped = html.unescape(cleaned)
    # Normalize excessive whitespace
    lines = [line.strip() for line in unescaped.splitlines()]
    return "\n".join(line for line in lines if line)


@dataclass
class MatchResult:
    matched: bool
    organization_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    invoice_id: uuid.UUID | None = None
    email_delivery_id: uuid.UUID | None = None
    original_outbound_message_id: uuid.UUID | None = None
    match_confidence: str = "NONE"
    match_reason: str = ""


def _extract_reference_ids(headers: dict[str, Any], data: dict[str, Any]) -> list[str]:
    """Extract candidate Message-IDs, In-Reply-To, and References identifiers."""
    candidates: list[str] = []

    # Check top-level or data headers
    headers_dict = {}
    if isinstance(headers, dict):
        headers_dict.update({k.lower(): v for k, v in headers.items()})
    if isinstance(data.get("headers"), dict):
        headers_dict.update({k.lower(): v for k, v in data["headers"].items()})

    for header_key in ("in-reply-to", "references", "message-id"):
        val = headers_dict.get(header_key)
        if isinstance(val, str):
            for part in re.findall(r"<([^>]+)>|([^\s,;<>]+)", val):
                raw = part[0] or part[1]
                if raw and raw not in candidates:
                    candidates.append(raw)

    # Check data fields directly
    for key in ("in_reply_to", "references", "message_id"):
        val = data.get(key)
        if isinstance(val, str):
            for part in re.findall(r"<([^>]+)>|([^\s,;<>]+)", val):
                raw = part[0] or part[1]
                if raw and raw not in candidates:
                    candidates.append(raw)
        elif isinstance(val, list):
            for item in val:
                if isinstance(item, str) and item not in candidates:
                    candidates.append(item.strip("<> "))

    return candidates


def resolve_inbound_reply(
    db: Session,
    *,
    sender_email: str,
    subject: str,
    body_text: str,
    headers: dict[str, Any],
    data: dict[str, Any],
) -> MatchResult:
    """
    Safely resolve organization, customer, original outbound message, and invoice.
    Uses the strongest available evidence first:
      1. Verified thread identifier (In-Reply-To / References / Provider message ID)
      2. Verified sender and customer relationship
      3. Explicit invoice reference in subject or body
      4. Single open invoice for unambiguous customer
    Never arbitrarily picks the first open invoice when ambiguous.
    """
    reference_candidates = _extract_reference_ids(headers, data)

    # 1. Attempt thread / delivery lookup using reference candidates
    for ref in reference_candidates:
        deliveries = db.scalars(
            select(EmailDelivery).where(
                (EmailDelivery.provider_message_id == ref)
                | (EmailDelivery.idempotency_key == ref)
            )
        ).all()

        # If UUID format, also check delivery id directly
        if not deliveries:
            try:
                ref_uuid = uuid.UUID(ref)
                deliveries = db.scalars(
                    select(EmailDelivery).where(EmailDelivery.id == ref_uuid)
                ).all()
            except ValueError:
                pass

        if len(deliveries) == 1:
            delivery = deliveries[0]
            # Verify recipient email matches sender or belongs to customer
            if (
                delivery.recipient_email.lower() == sender_email
                or db.scalar(
                    select(Customer.id).where(
                        Customer.id == delivery.customer_id,
                        Customer.organization_id == delivery.organization_id,
                        Customer.email.ilike(sender_email),
                    )
                )
            ):
                return MatchResult(
                    matched=True,
                    organization_id=delivery.organization_id,
                    customer_id=delivery.customer_id,
                    invoice_id=delivery.invoice_id,
                    email_delivery_id=delivery.id,
                    original_outbound_message_id=delivery.collection_message_id,
                    match_confidence="HIGH_THREAD_REFERENCE",
                    match_reason=f"Matched outbound email delivery {delivery.id} via reference '{ref}'",
                )

    # 2. Resolve Customer by Sender Email
    if not sender_email:
        return MatchResult(
            matched=False,
            match_confidence="NONE",
            match_reason="Sender email address is missing or invalid",
        )

    matched_customers = db.scalars(
        select(Customer).where(Customer.email.ilike(sender_email))
    ).all()

    if len(matched_customers) == 0:
        return MatchResult(
            matched=False,
            match_confidence="NONE",
            match_reason=f"Unknown sender '{sender_email}': no matching customer record found",
        )

    if len(matched_customers) > 1:
        # Multiple customers found (potentially across tenants). Do NOT guess.
        return MatchResult(
            matched=False,
            match_confidence="AMBIGUOUS",
            match_reason=f"Multiple customer records found matching '{sender_email}'; cannot resolve tenant safely",
        )

    customer = matched_customers[0]
    org_id = customer.organization_id
    customer_id = customer.id

    # 3. Resolve Invoice for this Customer
    # Check explicit invoice number mentions in subject or body
    customer_invoices = db.scalars(
        select(Invoice).where(
            Invoice.organization_id == org_id,
            Invoice.customer_id == customer_id,
        )
    ).all()

    text_to_search = f"{subject} {body_text}".lower()
    explicitly_mentioned_invoices: list[Invoice] = []

    for inv in customer_invoices:
        inv_num_clean = inv.invoice_number.strip().lower()
        if inv_num_clean and re.search(r"\b" + re.escape(inv_num_clean) + r"\b", text_to_search):
            explicitly_mentioned_invoices.append(inv)

    if len(explicitly_mentioned_invoices) == 1:
        return MatchResult(
            matched=True,
            organization_id=org_id,
            customer_id=customer_id,
            invoice_id=explicitly_mentioned_invoices[0].id,
            match_confidence="HIGH_EXPLICIT_INVOICE_MENTION",
            match_reason=f"Explicitly referenced invoice '{explicitly_mentioned_invoices[0].invoice_number}' in message",
        )

    # If multiple invoices are explicitly mentioned, do not guess
    if len(explicitly_mentioned_invoices) > 1:
        return MatchResult(
            matched=True,
            organization_id=org_id,
            customer_id=customer_id,
            invoice_id=None,  # Leave ambiguous for human review
            match_confidence="AMBIGUOUS_INVOICES_MENTIONED",
            match_reason="Multiple customer invoices mentioned; unlinked for safety",
        )

    # Check open/issued customer invoices
    open_invoices = [inv for inv in customer_invoices if inv.status == InvoiceStatus.ISSUED]

    if len(open_invoices) == 1:
        return MatchResult(
            matched=True,
            organization_id=org_id,
            customer_id=customer_id,
            invoice_id=open_invoices[0].id,
            match_confidence="MEDIUM_SINGLE_OPEN_INVOICE",
            match_reason=f"Customer has exactly one open invoice '{open_invoices[0].invoice_number}'",
        )

    if len(open_invoices) > 1:
        # Customer has several outstanding invoices and no thread/explicit evidence:
        # DO NOT guess or pick the first invoice!
        return MatchResult(
            matched=True,
            organization_id=org_id,
            customer_id=customer_id,
            invoice_id=None,
            match_confidence="AMBIGUOUS_MULTIPLE_OPEN_INVOICES",
            match_reason=f"Customer has {len(open_invoices)} open invoices; unlinked for safety",
        )

    # Customer has 0 open invoices
    return MatchResult(
        matched=True,
        organization_id=org_id,
        customer_id=customer_id,
        invoice_id=None,
        match_confidence="CUSTOMER_NO_OPEN_INVOICES",
        match_reason="Customer matched but has no open invoices",
    )


def process_inbound_email_event(
    db: Session,
    *,
    body_bytes: bytes,
    headers: dict[str, str],
    provider_factory: Callable[[], ReplyExtractionProvider] = OpenAIProviderAdapter,
    receiving_provider: EmailReceivingProvider | None = None,
    skip_security_validation: bool = False,
) -> dict[str, Any]:
    """
    End-to-end inbound email processing:
      1. Enforce signature and replay verification (if not already verified upstream).
      2. Check payload size boundary.
      3. Deduplicate event against database.
      4. Parse message; if metadata-only, retrieve real content via Resend Receiving API.
      5. Validate real customer body (no silent substitutions of subject or placeholder).
      6. Resolve customer/invoice evidence safely.
      7. Persist inbound CollectionMessage and audit records.
      8. Trigger advisory AI reply analysis (if eligible).
    """
    # 1. Enforce security policy
    if not skip_security_validation:
        validate_webhook_security(body_bytes=body_bytes, headers=headers)

    # 2. Enforce payload size boundary
    if len(body_bytes) > MAX_INBOUND_PAYLOAD_BYTES:
        raise PayloadTooLargeError("Inbound webhook payload exceeds 2MB limit")

    # 3. Parse JSON payload
    try:
        payload = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise InboundWebhookError("Malformed JSON webhook payload", status_code=400)

    if not isinstance(payload, dict):
        raise InboundWebhookError("Webhook payload must be a JSON object", status_code=400)

    norm_headers = {k.lower(): v for k, v in headers.items()}
    svix_id = norm_headers.get("svix-id") or norm_headers.get("webhook-id")

    event_type = payload.get("type", "email.received")
    data = payload.get("data", {})
    if not isinstance(data, dict):
        data = {}

    provider_event_id = svix_id or data.get("email_id") or data.get("id") or payload.get("id")
    if not provider_event_id:
        raise InboundWebhookError("Webhook missing required event identifier", status_code=400)

    email_id = data.get("email_id") or data.get("id")
    provider_message_id = (
        data.get("message_id")
        or email_id
        or "unknown"
    )

    # 4. Deduplicate against EmailWebhookEvent
    existing_event = db.scalar(
        select(EmailWebhookEvent).where(
            EmailWebhookEvent.provider == "resend",
            EmailWebhookEvent.provider_event_id == provider_event_id,
        )
    )
    if existing_event:
        logger.info("Inbound webhook event %s already processed; skipping idempotently", provider_event_id)
        return {
            "status": "already processed",
            "provider_event_id": provider_event_id,
            "message_id": str(existing_event.inbound_message_id) if existing_event.inbound_message_id else None,
        }

    # Only process email.received events in inbound handler
    if event_type != "email.received":
        event_record = EmailWebhookEvent(
            provider="resend",
            provider_event_id=provider_event_id,
            provider_message_id=provider_message_id,
            event_type=event_type,
            event_timestamp=datetime.now(UTC),
            processing_result="SKIPPED_NON_INBOUND",
        )
        db.add(event_record)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        return {"status": "skipped", "reason": f"unhandled event type {event_type}"}

    # 5. Extract or retrieve actual customer email content
    raw_from = data.get("from")
    subject = (data.get("subject") or "").strip()
    body_text = data.get("text")
    raw_html = data.get("html")

    has_usable_payload_content = bool(
        (body_text and body_text.strip()) or (raw_html and raw_html.strip())
    )

    if not has_usable_payload_content:
        # Documented Resend inbound event is metadata-only. Retrieve actual content from Receiving API.
        if not email_id:
            logger.warning("Inbound email event %s missing email_id for content retrieval", provider_event_id)
            audit_event = EmailWebhookEvent(
                provider="resend",
                provider_event_id=provider_event_id,
                provider_message_id=provider_message_id,
                event_type=event_type,
                event_timestamp=datetime.now(UTC),
                processing_result="REJECTED_MISSING_EMAIL_ID",
                error_detail="Webhook event has no message body and no email_id for retrieval",
            )
            db.add(audit_event)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
            return {
                "status": "ignored",
                "reason": "missing_email_id",
                "provider_event_id": provider_event_id,
                "confidence": "NONE",
            }

        rec_provider = receiving_provider or get_receiving_provider()
        try:
            retrieved = rec_provider.get_received_email(str(email_id))
        except EmailProviderError as prov_err:
            if prov_err.is_transient:
                logger.warning(
                    "Transient error retrieving received email %s: %s",
                    email_id,
                    str(prov_err),
                )
                # DO NOT commit deduplication record so Resend can retry
                raise InboundWebhookError(
                    f"Temporary failure retrieving email content: {prov_err.message}",
                    status_code=503,
                ) from prov_err
            else:
                logger.error(
                    "Permanent error retrieving received email %s: %s",
                    email_id,
                    str(prov_err),
                )
                audit_event = EmailWebhookEvent(
                    provider="resend",
                    provider_event_id=provider_event_id,
                    provider_message_id=str(email_id),
                    event_type=event_type,
                    event_timestamp=datetime.now(UTC),
                    processing_result="RETRIEVAL_FAILED_PERMANENT",
                    error_detail=prov_err.message,
                )
                db.add(audit_event)
                try:
                    db.commit()
                except IntegrityError:
                    db.rollback()
                return {
                    "status": "ignored",
                    "reason": f"retrieval_failed: {prov_err.message}",
                    "provider_event_id": provider_event_id,
                    "confidence": "NONE",
                }
        except Exception as unk_err:
            logger.exception("Unexpected error retrieving email %s", email_id)
            raise InboundWebhookError(
                "Unexpected error retrieving email content",
                status_code=503,
            ) from unk_err

        # Merge retrieved fields
        raw_from = retrieved.get("from") or raw_from
        subject = (retrieved.get("subject") or subject).strip()
        body_text = retrieved.get("text")
        raw_html = retrieved.get("html")

        if isinstance(retrieved.get("headers"), dict):
            curr_headers = dict(data.get("headers") or {})
            curr_headers.update(retrieved["headers"])
            data["headers"] = curr_headers
        if retrieved.get("message_id"):
            data["message_id"] = retrieved["message_id"]

    # Extract and normalize body text
    if body_text and body_text.strip():
        clean_body = body_text.strip()
    elif raw_html and raw_html.strip():
        clean_body = clean_html_to_text(raw_html).strip()
    else:
        clean_body = ""

    # Validate that clean_body is usable - NEVER substitute subject or placeholder
    if not clean_body:
        logger.warning("Inbound email %s has no usable plain-text or HTML body", provider_event_id)
        audit_event = EmailWebhookEvent(
            provider="resend",
            provider_event_id=provider_event_id,
            provider_message_id=provider_message_id,
            event_type=event_type,
            event_timestamp=datetime.now(UTC),
            processing_result="REJECTED_EMPTY_BODY",
            error_detail="Email contains no usable plain-text or HTML body",
        )
        db.add(audit_event)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        return {
            "status": "ignored",
            "reason": "empty_email_body",
            "provider_event_id": provider_event_id,
            "confidence": "NONE",
        }

    # Normalize sender email address
    sender_email = normalize_email_address(raw_from)

    # 6. Entity resolution
    match = resolve_inbound_reply(
        db,
        sender_email=sender_email,
        subject=subject,
        body_text=clean_body,
        headers=norm_headers,
        data=data,
    )

    if not match.matched:
        # Safely record operational event without guessing
        audit_event = EmailWebhookEvent(
            provider="resend",
            provider_event_id=provider_event_id,
            provider_message_id=provider_message_id,
            event_type=event_type,
            email_delivery_id=None,
            inbound_message_id=None,
            event_timestamp=datetime.now(UTC),
            processing_result=f"REJECTED_{match.match_confidence}",
            error_detail=match.match_reason,
        )
        db.add(audit_event)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return {"status": "already processed", "provider_event_id": provider_event_id}

        logger.info(
            "Inbound email %s rejected: %s (sender: %s)",
            provider_event_id,
            match.match_reason,
            sender_email,
        )
        return {
            "status": "ignored",
            "reason": match.match_reason,
            "provider_event_id": provider_event_id,
            "confidence": match.match_confidence,
        }

    # 7. Persist inbound CollectionMessage
    inbound_message = CollectionMessage(
        organization_id=match.organization_id,
        customer_id=match.customer_id,
        invoice_id=match.invoice_id,
        direction=MessageDirection.INBOUND,
        channel=MessageChannel.EMAIL,
        subject=subject or f"Reply from {sender_email}",
        body=clean_body,
        status=MessageStatus.RECEIVED,
        created_by_user_id=None,
    )
    db.add(inbound_message)
    db.flush()

    # Record CollectionActivity
    activity = CollectionActivity(
        organization_id=match.organization_id,
        customer_id=match.customer_id,
        invoice_id=match.invoice_id,
        actor_user_id=None,
        event_type=EventType.INBOUND_RECORDED,
        description=f"Inbound email reply received from {sender_email} ({match.match_reason})",
    )
    db.add(activity)

    # Record EmailWebhookEvent
    webhook_audit = EmailWebhookEvent(
        provider="resend",
        provider_event_id=provider_event_id,
        provider_message_id=provider_message_id,
        event_type=event_type,
        email_delivery_id=match.email_delivery_id,
        inbound_message_id=inbound_message.id,
        event_timestamp=datetime.now(UTC),
        processing_result="SUCCESS",
        error_detail=match.match_reason,
    )
    db.add(webhook_audit)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.info("Concurrent duplicate prevented for event %s", provider_event_id)
        return {"status": "already processed", "provider_event_id": provider_event_id}

    db.refresh(inbound_message)

    # 7. Trigger Advisory AI Reply Analysis
    analysis_id: str | None = None
    analysis_status = "SKIPPED"
    try:
        provider = provider_factory()
        analysis = analyze_customer_reply(
            db=db,
            message_id=inbound_message.id,
            organization_id=match.organization_id,
            provider=provider,
        )
        db.add(
            CollectionActivity(
                organization_id=match.organization_id,
                customer_id=match.customer_id,
                invoice_id=match.invoice_id,
                actor_user_id=None,
                event_type=EventType.REPLY_ANALYSIS_CREATED,
                description=f"AI reply analysis {analysis.id} generated (pending human review)",
            )
        )
        db.commit()
        analysis_id = str(analysis.id)
        analysis_status = "PENDING_REVIEW"
    except (AIProviderNotConfigured, AIProviderError, ReplyAnalysisError) as ai_err:
        db.rollback()
        logger.warning(
            "AI reply analysis not executed for message %s: %s (inbound message preserved)",
            inbound_message.id,
            str(ai_err),
        )
        analysis_status = "FAILED"
    except Exception:
        db.rollback()
        logger.exception(
            "Unexpected error analyzing inbound message %s (inbound message preserved)",
            inbound_message.id,
        )
        analysis_status = "FAILED"

    return {
        "status": "processed",
        "provider_event_id": provider_event_id,
        "message_id": str(inbound_message.id),
        "customer_id": str(match.customer_id),
        "invoice_id": str(match.invoice_id) if match.invoice_id else None,
        "match_confidence": match.match_confidence,
        "analysis_status": analysis_status,
        "analysis_id": analysis_id,
    }
