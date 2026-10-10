import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.deps import get_db, get_current_user, require_roles
from app.models.user import User, UserRole
from app.models.reply_analysis import CustomerReplyAnalysis, AnalysisStatus
from app.schemas.reply_analysis import CustomerReplyAnalysisResponse
from pydantic import BaseModel

class ReviewRequest(BaseModel):
    decision: AnalysisStatus
    review_notes: Optional[str] = None

router = APIRouter()

@router.get("/messages/{message_id}/analyses", response_model=List[CustomerReplyAnalysisResponse])
def get_analyses(
    message_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR, UserRole.VIEWER]))
):
    """
    List analyses for a given inbound message.
    """
    analyses = db.scalars(
        select(CustomerReplyAnalysis)
        .where(
            CustomerReplyAnalysis.source_message_id == message_id,
            CustomerReplyAnalysis.organization_id == current_user.organization_id
        )
        .order_by(CustomerReplyAnalysis.created_at.desc())
    ).all()
    
    return analyses


@router.post("/reply-analyses/{analysis_id}/review", response_model=CustomerReplyAnalysisResponse)
def review_analysis(
    analysis_id: uuid.UUID,
    review_req: ReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.OWNER, UserRole.FINANCE_MANAGER, UserRole.COLLECTOR]))
):
    """
    Review a pending analysis to ACCEPT or DISMISS it.
    """
    if review_req.decision not in (AnalysisStatus.ACCEPTED, AnalysisStatus.DISMISSED):
        raise HTTPException(status_code=400, detail="Decision must be ACCEPTED or DISMISSED")
        
    analysis = db.scalar(
        select(CustomerReplyAnalysis)
        .where(
            CustomerReplyAnalysis.id == analysis_id,
            CustomerReplyAnalysis.organization_id == current_user.organization_id
        )
        .with_for_update()
    )
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
        
    if analysis.status != AnalysisStatus.PENDING_REVIEW:
        raise HTTPException(status_code=409, detail="Analysis is not in PENDING_REVIEW state")
        
    # Apply review
    analysis.status = review_req.decision
    analysis.reviewed_by_user_id = current_user.id
    analysis.review_notes = review_req.review_notes
    from datetime import datetime, UTC
    analysis.reviewed_at = datetime.now(UTC)
    
    # In a full implementation, we log a CollectionActivity event here
    
    db.commit()
    db.refresh(analysis)
    
    return analysis
