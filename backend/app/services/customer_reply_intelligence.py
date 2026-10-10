import uuid
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime, UTC
from pydantic import ValidationError

from app.models.collection_workflow import CollectionMessage, MessageDirection
from app.models.reply_analysis import CustomerReplyAnalysis, ReplyClassification, AnalysisStatus
from app.schemas.reply_analysis import LLMExtractionResult
from app.models.invoice import Invoice
from decimal import Decimal

# A mock provider class representing the OpenAI extraction logic
class OpenAIProviderAdapter:
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.api_key = api_key
        self.model = model

    def extract_intelligence(self, message_body: str) -> LLMExtractionResult:
        """
        Uses the OpenAI Python SDK `client.beta.chat.completions.parse` method
        to guarantee structured output conforming to LLMExtractionResult.
        For this stub, we return a deterministic fake result.
        """
        return LLMExtractionResult(
            primary_classification=ReplyClassification.UNCERTAIN,
            secondary_classifications=[],
            evidence_summary="The customer sent a message, but the intent is unclear.",
            customer_intent="Unknown",
            explicit_payment_amount=None,
            currency=None,
            proposed_payment_date=None,
            claims_already_paid=False,
            dispute_category=None,
            requests_information=False,
            missing_information="Need clarification on invoice intent.",
            recommended_next_action="Review manually.",
            requires_human_review=True,
            confidence_score=0.4
        )

def analyze_customer_reply(
    db: Session, 
    message_id: uuid.UUID, 
    organization_id: uuid.UUID,
    provider: OpenAIProviderAdapter
) -> CustomerReplyAnalysis:
    """
    Analyzes an inbound message and persists a CustomerReplyAnalysis record.
    """
    message = db.scalar(
        select(CollectionMessage)
        .where(CollectionMessage.id == message_id, CollectionMessage.organization_id == organization_id)
    )
    if not message:
        raise ValueError("Message not found")
        
    if message.direction != MessageDirection.INBOUND:
        raise ValueError("Can only analyze INBOUND messages")
        
    # Extract payload
    try:
        extraction = provider.extract_intelligence(message.body)
    except Exception as e:
        raise ValueError(f"Failed to extract intelligence: {str(e)}")
        
    # Deterministic consistency checks
    if extraction.explicit_payment_amount is not None and extraction.explicit_payment_amount < Decimal("0"):
        extraction.explicit_payment_amount = None
        extraction.requires_human_review = True
        
    # Create Analysis Record
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
        prompt_version="v1.0.0",
        status=AnalysisStatus.PENDING_REVIEW
    )
    
    db.add(analysis)
    
    # In a full implementation, we'd also log a CollectionActivity here.
    
    db.commit()
    db.refresh(analysis)
    
    return analysis
