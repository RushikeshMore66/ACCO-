from fastapi import APIRouter, Request, HTTPException, status, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.models.email_delivery import EmailDelivery, DeliveryStatus, EmailWebhookEvent
from sqlalchemy import select

router = APIRouter()

@router.post("/email/resend", status_code=status.HTTP_200_OK)
async def resend_webhook(request: Request, db: Session = Depends(get_db)):
    # 1. Read raw body and signature headers
    payload = await request.body()
    svix_id = request.headers.get("svix-id")
    svix_timestamp = request.headers.get("svix-timestamp")
    svix_signature = request.headers.get("svix-signature")
    
    if not svix_id or not svix_timestamp or not svix_signature:
        raise HTTPException(status_code=400, detail="Missing Svix headers")
        
    # In a full implementation we would use svix.Webhook to verify the signature here
    # wh = Webhook(settings.email_webhook_signing_secret)
    # event = wh.verify(payload, request.headers)
    
    # 2. Extract verified event data (Stubbed for phase limits)
    # event_type = event.get("type")
    # provider_message_id = event.get("data", {}).get("email_id")
    event_type = "email.delivered"
    provider_message_id = "stub_id"
    provider_event_id = svix_id
    
    # 3. Deduplicate
    existing = db.scalar(
        select(EmailWebhookEvent)
        .where(EmailWebhookEvent.provider == "resend", EmailWebhookEvent.provider_event_id == provider_event_id)
    )
    if existing:
        return {"status": "already processed"}
        
    # 4. Process Status (Stub)
    delivery = db.scalar(
        select(EmailDelivery)
        .where(EmailDelivery.provider_message_id == provider_message_id)
    )
    
    if delivery:
        if event_type == "email.delivered":
            delivery.status = DeliveryStatus.DELIVERED
        elif event_type == "email.bounced":
            delivery.status = DeliveryStatus.BOUNCED
            
    # 5. Record Event
    webhook_event = EmailWebhookEvent(
        provider="resend",
        provider_event_id=provider_event_id,
        provider_message_id=provider_message_id,
        event_type=event_type,
        processing_result="SUCCESS"
    )
    db.add(webhook_event)
    db.commit()
    
    return {"status": "processed"}
