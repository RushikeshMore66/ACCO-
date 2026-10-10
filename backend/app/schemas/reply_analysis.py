import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.reply_analysis import AnalysisStatus, ReplyClassification


class LLMExtractionResult(BaseModel):
    """Structured facts extracted from an untrusted customer message."""

    primary_classification: ReplyClassification = Field(
        description="Primary intent expressed in the customer's message."
    )
    secondary_classifications: list[ReplyClassification] = Field(default_factory=list)
    evidence_summary: str = Field(max_length=1200)
    customer_intent: str = Field(max_length=1200)
    explicit_payment_amount: Optional[Decimal] = Field(
        default=None, description="Only an amount explicitly stated by the customer."
    )
    currency: Optional[str] = Field(
        default=None, description="Only a currency explicitly stated by the customer."
    )
    proposed_payment_date: Optional[str] = Field(
        default=None,
        max_length=120,
        description="Preserve the customer's date phrase verbatim; do not normalize it.",
    )
    claims_already_paid: bool = False
    dispute_category: Optional[str] = Field(default=None, max_length=300)
    requests_information: bool = False
    missing_information: Optional[str] = Field(default=None, max_length=1200)
    recommended_next_action: str = Field(max_length=1200)
    requires_human_review: bool
    confidence_score: float = Field(ge=0.0, le=1.0)


class CustomerReplyAnalysisResponse(BaseModel):
    """Safe API view of a persisted analysis; contains no source-message body."""

    id: uuid.UUID
    organization_id: uuid.UUID
    source_message_id: uuid.UUID
    invoice_id: Optional[uuid.UUID]
    customer_id: uuid.UUID
    classification: ReplyClassification
    confidence_score: float
    analysis_payload: LLMExtractionResult
    model_provider: str
    model_name: str
    prompt_version: str
    status: AnalysisStatus
    reviewed_by_user_id: Optional[uuid.UUID]
    reviewed_at: Optional[datetime]
    review_notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReplyAnalysisReviewRequest(BaseModel):
    """Human decision for a previously generated analysis."""

    decision: AnalysisStatus
    review_notes: Optional[str] = Field(default=None, max_length=2000)

    model_config = ConfigDict(extra="forbid")

    @classmethod
    def validate_decision(cls, value: AnalysisStatus) -> AnalysisStatus:
        if value not in (AnalysisStatus.ACCEPTED, AnalysisStatus.DISMISSED):
            raise ValueError("Decision must be ACCEPTED or DISMISSED")
        return value
