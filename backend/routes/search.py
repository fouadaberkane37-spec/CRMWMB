from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db
import models
from auth import get_current_user

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/")
def global_search(
    q: str = Query(..., min_length=1, max_length=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    like = f"%{q}%"
    is_admin = current_user.role == "admin"

    contacts_q = db.query(models.Contact).filter(
        models.Contact.first_name.ilike(like)
        | models.Contact.last_name.ilike(like)
        | models.Contact.email.ilike(like)
        | models.Contact.phone.ilike(like)
    )
    if not is_admin:
        contacts_q = contacts_q.filter(models.Contact.created_by == current_user.id)
    contacts = contacts_q.limit(10).all()

    companies_q = db.query(models.Company).filter(
        models.Company.name.ilike(like)
        | models.Company.industry.ilike(like)
        | models.Company.city.ilike(like)
    )
    if not is_admin:
        companies_q = companies_q.filter(models.Company.created_by == current_user.id)
    companies = companies_q.limit(10).all()

    deals_q = db.query(models.Deal).filter(models.Deal.title.ilike(like))
    if not is_admin:
        deals_q = deals_q.filter(
            or_(
                models.Deal.assigned_to == current_user.id,
                models.Deal.created_by == current_user.id,
            )
        )
    deals = deals_q.limit(10).all()

    return {
        "contacts": [
            {"id": c.id, "label": f"{c.first_name} {c.last_name or ''}".strip(), "sub": c.email or c.phone or "", "type": "contact"}
            for c in contacts
        ],
        "companies": [
            {"id": c.id, "label": c.name, "sub": c.industry or c.city or "", "type": "company"}
            for c in companies
        ],
        "deals": [
            {"id": d.id, "label": d.title, "sub": f"${d.value:,.0f} · {d.stage}", "type": "deal"}
            for d in deals
        ],
    }
