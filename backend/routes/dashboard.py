from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=schemas.DashboardStats)
def get_stats(db: Session = Depends(get_db), _=Depends(get_current_user)):
    total_contacts = db.query(func.count(models.Contact.id)).scalar() or 0
    total_companies = db.query(func.count(models.Company.id)).scalar() or 0
    open_deals = (
        db.query(func.count(models.Deal.id))
        .filter(models.Deal.stage.notin_(["won", "lost"]))
        .scalar() or 0
    )
    total_deal_value = (
        db.query(func.sum(models.Deal.value))
        .filter(models.Deal.stage.notin_(["won", "lost"]))
        .scalar() or 0
    )
    won_deals = (
        db.query(func.count(models.Deal.id))
        .filter(models.Deal.stage == "won")
        .scalar() or 0
    )
    today = datetime.utcnow().date()
    activities_today = (
        db.query(func.count(models.Activity.id))
        .filter(func.date(models.Activity.created_at) == today)
        .scalar() or 0
    )
    return {
        "total_contacts": total_contacts,
        "total_companies": total_companies,
        "open_deals": open_deals,
        "total_deal_value": total_deal_value,
        "won_deals": won_deals,
        "activities_today": activities_today,
    }
