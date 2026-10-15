"""Orchestrate advisory customer-reply analysis without financial side effects."""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.ai.openai_provider import AIProviderError, ReplyExtractionProvider
from app.models.collection_workflow import CollectionMessage, MessageDirection
from app.models.reply_analysis import (
    AnalysisStatus,
    CustomerReplyAnalysis,
    ReplyClassification,
)
from app.schemas.reply_analysis import LLMExtractionResult


class ReplyAnalysisError(ValueError):
    """Expected business-rule failure while analyzing a reply."""

    def __init__(self, message: str, *, code: str):
        super().__init__(message)
        self.code = code


def analyze_customer_reply(
    db: Session,
    message_id: uuid.UUID,
    organization_id: uuid.UUID,
    provider: ReplyExtractionProvider,
) -> CustomerReplyAnalysis:
    """Create a pending analysis. The caller owns commit/rollback and audit logging."""
    message = db.scalar(
        select(CollectionMessage).where(
            CollectionMessage.id == message_id,
            CollectionMessage.organization_id == organization_id,
        )
    )
    if message is None:
        raise ReplyAnalysisError("Message not found", code="not_found")
    if message.direction != MessageDirection.INBOUND:
        raise ReplyAnalysisError(
            "Only inbound customer messages can be analyzed",
            code="invalid_direction",
        )

    try:
        extracted = provider.extract_intelligence(message.body)
        extraction = LLMExtractionResult.model_validate(extracted)
    except AIProviderError:
        raise
    except Exception:  # noqa: BLE001 - provider internals must never propagate
        # Never propagate provider internals, message content, or credentials.
        raise AIProviderError("The customer reply could not be analyzed safely.") from None

    # Deterministic safeguards run after model output. This analysis is advisory only.
    amount = extraction.explicit_payment_amount
    if amount is not None and (not amount.is_finite() or amount <= Decimal(0)):
        extraction.explicit_payment_amount = None
        extraction.requires_human_review = True

    if (
        extraction.primary_classification == ReplyClassification.PAYMENT_CLAIM
        or extraction.claims_already_paid
        or extraction.proposed_payment_date is not None
    ):
        extraction.requires_human_review = True

    analysis = CustomerReplyAnalysis(
        organization_id=message.organization_id,
        source_message_id=message.id,
        invoice_id=message.invoice_id,
        customer_id=message.customer_id,
        classification=extraction.primary_classification,
        confidence_score=extraction.confidence_score,
        analysis_payload=extraction.model_dump(mode="json"),
        model_provider="openai",
        model_name=provider.model,
        prompt_version=provider.prompt_version,
        status=AnalysisStatus.PENDING_REVIEW,
    )
    db.add(analysis)
    db.flush()
    return analysis
