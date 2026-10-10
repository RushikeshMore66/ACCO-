"""API routes for AI-assisted customer reply analysis and human review."""
from __future__ import annotations

import uuid
from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.adapters.ai.openai_provider import (
    AIProviderError,
    AIProviderNotConfigured,
    OpenAIProviderAdapter,
    ReplyExtractionProvider,
)
from app.api.deps import get_db, require_roles
from app.models.collection_workflow import (
    CollectionActivity,
    CollectionMessage,
    EventType,
    MessageDirection,
)
from app.models.reply_analysis import AnalysisStatus, CustomerReplyAnalysis
from app.models.user import User, UserRole
from app.schemas.reply_analysis import (
    CustomerReplyAnalysisResponse,
    ReplyAnalysisReviewRequest,
)
from app.services.customer_reply_intelligence import (
    ReplyAnalysisError,
    analyze_customer_reply,
)

router = APIRouter()


def get_reply_provider_factory() -> Callable[[], ReplyExtractionProvider]:
    """Return a lazy provider factory so invalid message IDs never trigger AI execution."""
    return OpenAIProviderAdapter


def _analysis_activity(
    *,
    organization_id: uuid.UUID,
    customer_id: uuid.UUID,
    invoice_id: uuid.UUID | None,
    actor_user_id: uuid.UUID,
    event_type: EventType,
    description: str,
) -> CollectionActivity:
    return CollectionActivity(
        organization_id=organization_id,
        customer_id=customer_id,
        invoice_id=invoice_id,
        actor_user_id=actor_user_id,
        event_type=event_type,
        description=description,
    )


@router.post(
    "/messages/{message_id}/analyze",
    response_model=CustomerReplyAnalysisResponse,
    status_code=status.HTTP_201_CREATED,
)
def analyze_message(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR])
    ),
    provider_factory: Callable[[], ReplyExtractionProvider] = Depends(get_reply_provider_factory),
) -> CustomerReplyAnalysisResponse:
    """Analyze one inbound message and save the result awaiting human review."""
    message = db.scalar(
        select(CollectionMessage).where(
            CollectionMessage.id == message_id,
            CollectionMessage.organization_id == current_user.organization_id,
        )
    )
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.direction != MessageDirection.INBOUND:
        raise HTTPException(status_code=409, detail="Only inbound customer messages can be analyzed")

    try:
        provider = provider_factory()
        analysis = analyze_customer_reply(
            db=db,
            message_id=message_id,
            organization_id=current_user.organization_id,
            provider=provider,
        )
        db.add(
            _analysis_activity(
                organization_id=analysis.organization_id,
                customer_id=analysis.customer_id,
                invoice_id=analysis.invoice_id,
                actor_user_id=current_user.id,
                event_type=EventType.REPLY_ANALYSIS_CREATED,
                description=f"Created reply analysis {analysis.id} (pending human review)",
            )
        )
        db.commit()
        db.refresh(analysis)
        return analysis
    except AIProviderNotConfigured:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="AI reply analysis is not configured. Set ACCO_OPENAI_API_KEY to enable it.",
        ) from None
    except AIProviderError:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="AI reply analysis is temporarily unavailable. Please retry later.",
        ) from None
    except ReplyAnalysisError as exc:
        db.rollback()
        if exc.code == "not_found":
            raise HTTPException(status_code=404, detail="Message not found") from None
        raise HTTPException(status_code=409, detail=str(exc)) from None
    except Exception:
        db.rollback()
        # Avoid exposing provider/database internals or customer message content.
        raise HTTPException(
            status_code=500,
            detail="Could not save the reply analysis.",
        ) from None


@router.get(
    "/messages/{message_id}/analyses",
    response_model=list[CustomerReplyAnalysisResponse],
)
def list_message_analyses(
    message_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10000),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            [UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR, UserRole.VIEWER]
        )
    ),
) -> list[CustomerReplyAnalysis]:
    """List only analyses for a message belonging to the authenticated organization."""
    message = db.scalar(
        select(CollectionMessage.id).where(
            CollectionMessage.id == message_id,
            CollectionMessage.organization_id == current_user.organization_id,
        )
    )
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")

    return list(
        db.scalars(
            select(CustomerReplyAnalysis)
            .where(
                CustomerReplyAnalysis.source_message_id == message_id,
                CustomerReplyAnalysis.organization_id == current_user.organization_id,
            )
            .order_by(CustomerReplyAnalysis.created_at.desc(), CustomerReplyAnalysis.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )


@router.post(
    "/reply-analyses/{analysis_id}/review",
    response_model=CustomerReplyAnalysisResponse,
)
def review_analysis(
    analysis_id: uuid.UUID,
    review_req: ReplyAnalysisReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR])
    ),
) -> CustomerReplyAnalysisResponse:
    """Record a one-time human decision without triggering any financial operation."""
    analysis = db.scalar(
        select(CustomerReplyAnalysis)
        .where(
            CustomerReplyAnalysis.id == analysis_id,
            CustomerReplyAnalysis.organization_id == current_user.organization_id,
        )
        .with_for_update()
    )
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if analysis.status != AnalysisStatus.PENDING_REVIEW:
        raise HTTPException(status_code=409, detail="Analysis has already been reviewed")

    decision = review_req.decision
    result = db.execute(
        update(CustomerReplyAnalysis)
        .where(
            CustomerReplyAnalysis.id == analysis_id,
            CustomerReplyAnalysis.organization_id == current_user.organization_id,
            CustomerReplyAnalysis.status == AnalysisStatus.PENDING_REVIEW,
        )
        .values(
            status=decision,
            reviewed_by_user_id=current_user.id,
            reviewed_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
            review_notes=review_req.review_notes,
        )
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=409, detail="Analysis has already been reviewed")

    event_type = (
        EventType.REPLY_ANALYSIS_ACCEPTED
        if decision == AnalysisStatus.ACCEPTED
        else EventType.REPLY_ANALYSIS_DISMISSED
    )
    db.add(
        _analysis_activity(
            organization_id=analysis.organization_id,
            customer_id=analysis.customer_id,
            invoice_id=analysis.invoice_id,
            actor_user_id=current_user.id,
            event_type=event_type,
            description=f"Human reviewer {decision.value.lower()} reply analysis {analysis.id}",
        )
    )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not save the review decision.") from None

    db.refresh(analysis)
    return analysis
