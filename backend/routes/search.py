from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import get_current_user

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/")
def global_search(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    like = f"%{q}%"

    contacts = (
        db.query(models.Contact)
        .filter(
            models.Contact.first_name.ilike(like)
            | models.Contact.last_name.ilike(like)
            | models.Contact.email.ilike(like)
            | models.Contact.phone.ilike(like)
        )
        .limit(10)
        .all()
    )

    companies = (
        db.query(models.Company)
        .filter(
            models.Company.name.ilike(like)
            | models.Company.industry.ilike(like)
            | models.Company.city.ilike(like)
        )
        .limit(10)
        .all()
    )

    deals = (
        db.query(models.Deal)
        .filter(models.Deal.title.ilike(like))
        .limit(10)
        .all()
    )

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
