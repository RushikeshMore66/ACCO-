import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.customer import Customer
from app.models.user import User
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate

router = APIRouter()

@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
def create_customer(
    *,
    db: Session = Depends(get_db),
    customer_in: CustomerCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    customer = Customer(
        organization_id=current_user.organization_id,
        name=customer_in.name,
        contact_name=customer_in.contact_name,
        email=customer_in.email,
        phone=customer_in.phone,
        billing_address=customer_in.billing_address,
        tax_identifier=customer_in.tax_identifier,
        is_active=True
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("", response_model=list[CustomerResponse])
def list_customers(
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0,
    name: str | None = None,
    email: str | None = None,
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Customer).filter(Customer.organization_id == current_user.organization_id)
    
    if not include_inactive:
        stmt = stmt.filter(Customer.is_active)
        
    if name:
        stmt = stmt.filter(Customer.name.ilike(f"%{name}%"))
    if email:
        stmt = stmt.filter(Customer.email.ilike(f"%{email}%"))
        
    stmt = stmt.order_by(Customer.created_at.desc()).offset(offset).limit(limit)
    customers = db.execute(stmt).scalars().all()
    return customers


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(
    *,
    db: Session = Depends(get_db),
    customer_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Customer).filter(
        Customer.id == customer_id, 
        Customer.organization_id == current_user.organization_id
    )
    customer = db.execute(stmt).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.patch("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    *,
    db: Session = Depends(get_db),
    customer_id: uuid.UUID,
    customer_in: CustomerUpdate,
    current_user: User = Depends(get_current_user),
) -> Any:
    stmt = select(Customer).filter(
        Customer.id == customer_id, 
        Customer.organization_id == current_user.organization_id
    )
    customer = db.execute(stmt).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    update_data = customer_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)
        
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer
