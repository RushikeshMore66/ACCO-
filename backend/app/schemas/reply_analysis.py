import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.models.reply_analysis import ReplyClassification, AnalysisStatus

class LLMExtractionResult(BaseModel):
    """The structured schema returned by the LLM Provider."""
    primary_classification: ReplyClassification = Field(description="The primary intent of the customer's message.")
    secondary_classifications: List[ReplyClassification] = Field(default_factory=list, description="Any secondary intents found in the message.")
    evidence_summary: str = Field(description="A short, evidence-based summary of what the customer is stating.")
    customer_intent: str = Field(description="A sentence describing the customer's goal.")
    
    explicit_payment_amount: Optional[Decimal] = Field(None, description="The payment amount explicitly stated by the customer, if any.")
    currency: Optional[str] = Field(None, description="The currency explicitly mentioned.")
    proposed_payment_date: Optional[str] = Field(None, description="The payment date exactly as stated (e.g. 'next Friday', '2023-11-01').")
    
    claims_already_paid: bool = Field(False, description="True if the customer claims they have already sent the payment.")
    dispute_category: Optional[str] = Field(None, description="If this is a dispute, a short phrase describing the dispute.")
    requests_information: bool = Field(False, description="True if the customer is requesting an invoice copy or more info.")
    
    missing_information: Optional[str] = Field(None, description="Information that is missing or ambiguous.")
    recommended_next_action: str = Field(description="The recommended next step for the finance team.")
    requires_human_review: bool = Field(description="True if the message is ambiguous, low confidence, or requires a human to verify intent.")
    confidence_score: float = Field(ge=0.0, le=1.0, description="The model's confidence in this classification from 0 to 1.")

class CustomerReplyAnalysisResponse(BaseModel):
    """Schema for returning the persisted analysis to the API."""
    id: uuid.UUID
    organization_id: uuid.UUID
    source_message_id: uuid.UUID
    invoice_id: Optional[uuid.UUID]
    customer_id: uuid.UUID
    classification: ReplyClassification
    confidence_score: float
    analysis_payload: LLMExtractionResult
    status: AnalysisStatus
    reviewed_at: Optional[datetime]
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
