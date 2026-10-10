from datetime import datetime, UTC
from typing import Any, List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.invoice import Invoice, InvoiceStatus
from app.models.customer import Customer
from app.models.user import User
from app.schemas.invoice import InvoiceCreate, InvoiceResponse, InvoiceUpdate, InvoiceVoid
from app.schemas.receivables import InvoiceBalanceResponse

router = APIRouter()

@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(
    *,
    db: Session = Depends(get_db),
    invoice_in: InvoiceCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Customer).filter(
        Customer.id == invoice_in.customer_id, 
        Customer.organization_id == current_user.organization_id
    )
    customer = db.execute(stmt).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=400, detail="Customer not found or doesn't belong to organization")
    if not customer.is_active:
        raise HTTPException(status_code=400, detail="Cannot create invoice for an inactive customer")

    # Check for duplicate invoice number within the organization
    existing_stmt = select(Invoice).filter(
        Invoice.organization_id == current_user.organization_id,
        Invoice.invoice_number == invoice_in.invoice_number
    )
    if db.execute(existing_stmt).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Invoice number already exists in this organization")

    invoice = Invoice(
        organization_id=current_user.organization_id,
        customer_id=invoice_in.customer_id,
        invoice_number=invoice_in.invoice_number,
        issue_date=invoice_in.issue_date,
        due_date=invoice_in.due_date,
        currency=invoice_in.currency,
        total_amount=invoice_in.total_amount,
        description=invoice_in.description,
        status=InvoiceStatus.DRAFT,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice

@router.get("", response_model=List[InvoiceResponse])
def list_invoices(
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0,
    customer_id: uuid.UUID | None = None,
    status: InvoiceStatus | None = None,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Invoice).filter(Invoice.organization_id == current_user.organization_id)
    
    if customer_id:
        stmt = stmt.filter(Invoice.customer_id == customer_id)
    if status:
        stmt = stmt.filter(Invoice.status == status)
        
    stmt = stmt.order_by(Invoice.created_at.desc()).offset(offset).limit(limit)
    invoices = db.execute(stmt).scalars().all()
    return invoices

@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    *,
    db: Session = Depends(get_db),
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Invoice).filter(
        Invoice.id == invoice_id, 
        Invoice.organization_id == current_user.organization_id
    )
    invoice = db.execute(stmt).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice

@router.get("/{invoice_id}/balance", response_model=InvoiceBalanceResponse)
def get_invoice_balance_endpoint(
    *,
    db: Session = Depends(get_db),
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Invoice).filter(
        Invoice.id == invoice_id, 
        Invoice.organization_id == current_user.organization_id
    )
    invoice = db.execute(stmt).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    if invoice.status != InvoiceStatus.ISSUED:
        raise HTTPException(status_code=409, detail="Invoice balance is only applicable for issued invoices")
        
    from app.services.receivables import get_invoice_balance
    return get_invoice_balance(db, invoice)

@router.patch("/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(
    *,
    db: Session = Depends(get_db),
    invoice_id: uuid.UUID,
    invoice_in: InvoiceUpdate,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Invoice).filter(
        Invoice.id == invoice_id, 
        Invoice.organization_id == current_user.organization_id
    )
    invoice = db.execute(stmt).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    if invoice.status != InvoiceStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Only DRAFT invoices can be updated")
        
    update_data = invoice_in.model_dump(exclude_unset=True)
    
    if "customer_id" in update_data:
        customer_stmt = select(Customer).filter(
            Customer.id == update_data["customer_id"], 
            Customer.organization_id == current_user.organization_id
        )
        customer = db.execute(customer_stmt).scalar_one_or_none()
        if not customer:
            raise HTTPException(status_code=400, detail="Customer not found or doesn't belong to organization")
        if not customer.is_active:
            raise HTTPException(status_code=400, detail="Cannot assign invoice to an inactive customer")

    if "invoice_number" in update_data and update_data["invoice_number"] != invoice.invoice_number:
        existing_stmt = select(Invoice).filter(
            Invoice.organization_id == current_user.organization_id,
            Invoice.invoice_number == update_data["invoice_number"],
            Invoice.id != invoice_id
        )
        if db.execute(existing_stmt).scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Invoice number already exists in this organization")

    issue_date = update_data.get("issue_date", invoice.issue_date)
    due_date = update_data.get("due_date", invoice.due_date)
    
    if due_date < issue_date:
         raise HTTPException(status_code=400, detail="due_date cannot be earlier than issue_date")

    for field, value in update_data.items():
        setattr(invoice, field, value)
        
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice

@router.post("/{invoice_id}/issue", response_model=InvoiceResponse)
def issue_invoice(
    *,
    db: Session = Depends(get_db),
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Invoice).filter(
        Invoice.id == invoice_id, 
        Invoice.organization_id == current_user.organization_id
    )
    invoice = db.execute(stmt).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    if invoice.status == InvoiceStatus.ISSUED:
        raise HTTPException(status_code=409, detail="Invoice is already issued")
    if invoice.status == InvoiceStatus.VOID:
        raise HTTPException(status_code=409, detail="Invoice is void")

    customer_stmt = select(Customer).filter(
        Customer.id == invoice.customer_id, 
        Customer.organization_id == current_user.organization_id
    )
    customer = db.execute(customer_stmt).scalar_one_or_none()
    if not customer or not customer.is_active:
         raise HTTPException(status_code=400, detail="Customer is inactive or missing")
         
    invoice.status = InvoiceStatus.ISSUED
    
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice

@router.post("/{invoice_id}/void", response_model=InvoiceResponse)
def void_invoice(
    *,
    db: Session = Depends(get_db),
    invoice_id: uuid.UUID,
    void_in: InvoiceVoid,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Invoice).filter(
        Invoice.id == invoice_id, 
        Invoice.organization_id == current_user.organization_id
    )
    invoice = db.execute(stmt).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    if invoice.status == InvoiceStatus.VOID:
        raise HTTPException(status_code=409, detail="Invoice is already void")

    from app.services.receivables import get_invoice_balance
    balance = get_invoice_balance(db, invoice)
    if balance.paid_amount > 0:
        raise HTTPException(status_code=409, detail="Cannot void an invoice with active payment allocations")
        
    invoice.status = InvoiceStatus.VOID
    invoice.void_reason = void_in.void_reason
    invoice.voided_at = datetime.now(UTC)
    
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice
