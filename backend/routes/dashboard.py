from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=schemas.DashboardStats)
def get_stats(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    is_admin = current_user.role in ("admin", "ceo")

    # Contacts — admin sees all, sales sees only their own
    contacts_q = db.query(func.count(models.Contact.id))
    if not is_admin:
        contacts_q = contacts_q.filter(models.Contact.created_by == current_user.id)
    total_contacts = contacts_q.scalar() or 0

    # Companies — scoped like contacts
    companies_q = db.query(func.count(models.Company.id))
    if not is_admin:
        companies_q = companies_q.filter(models.Company.created_by == current_user.id)
    total_companies = companies_q.scalar() or 0

    # Deals — admin sees all, sales sees assigned/created
    deals_q = db.query(models.Deal)
    if not is_admin:
        deals_q = deals_q.filter(
            or_(
                models.Deal.assigned_to == current_user.id,
                models.Deal.created_by == current_user.id,
            )
        )

    active_deals = deals_q.filter(models.Deal.stage.notin_(["won", "lost"]))
    open_deals = active_deals.with_entities(func.count(models.Deal.id)).scalar() or 0
    total_deal_value = active_deals.with_entities(func.sum(models.Deal.value)).scalar() or 0
    won_deals = deals_q.filter(models.Deal.stage == "won").with_entities(func.count(models.Deal.id)).scalar() or 0

    # Profit: CEO = 80% window / 35% landscape; everyone else = 35% flat
    # Excludes cancelled jobs
    revenue_deals = (
        db.query(models.Deal.value, models.Deal.business_type)
        .filter(models.Deal.job_status != "cancelled")
    )
    if not is_admin:
        revenue_deals = revenue_deals.filter(
            or_(
                models.Deal.assigned_to == current_user.id,
                models.Deal.created_by == current_user.id,
            )
        )
    is_ceo = current_user.role in ("ceo", "admin")
    revenue_made = sum(
        (val or 0) * (0.35 if btype == "landscape" else 0.80) if is_ceo else (val or 0) * 0.35
        for val, btype in revenue_deals.all()
    )

    # Activities — admin sees all, sales sees their own
    today = datetime.utcnow().date()
    activities_q = db.query(func.count(models.Activity.id)).filter(func.date(models.Activity.created_at) == today)
    if not is_admin:
        activities_q = activities_q.filter(models.Activity.created_by == current_user.id)
    activities_today = activities_q.scalar() or 0

    return {
        "total_contacts": total_contacts,
        "total_companies": total_companies,
        "open_deals": open_deals,
        "total_deal_value": total_deal_value,
        "won_deals": won_deals,
        "activities_today": activities_today,
        "revenue_made": revenue_made,
    }
