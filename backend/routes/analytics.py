from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from database import get_db
import models
from auth import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
def overview(db: Session = Depends(get_db), _=Depends(get_current_user)):
    today = datetime.utcnow().date()
    start_of_month = datetime(today.year, today.month, 1)

    total_contacts = db.query(func.count(models.Contact.id)).scalar()
    new_contacts_month = db.query(func.count(models.Contact.id)).filter(
        models.Contact.created_at >= start_of_month
    ).scalar()

    total_deals = db.query(func.count(models.Deal.id)).scalar()
    won_deals = db.query(func.count(models.Deal.id)).filter(models.Deal.stage == "won").scalar()
    open_deals = db.query(func.count(models.Deal.id)).filter(
        models.Deal.stage.notin_(["won", "lost"])
    ).scalar()
    total_value = db.query(func.coalesce(func.sum(models.Deal.value), 0)).filter(
        models.Deal.stage == "won"
    ).scalar()
    pipeline_value = db.query(func.coalesce(func.sum(models.Deal.value), 0)).filter(
        models.Deal.stage.notin_(["won", "lost"])
    ).scalar()

    total_knocks = db.query(func.count(models.Knock.id)).scalar()
    interested_knocks = db.query(func.count(models.Knock.id)).filter(
        models.Knock.status == "interested"
    ).scalar()

    total_bookings = db.query(func.count(models.Booking.id)).scalar()
    completed_bookings = db.query(func.count(models.Booking.id)).filter(
        models.Booking.status == "completed"
    ).scalar()

    return {
        "contacts": {
            "total": total_contacts,
            "new_this_month": new_contacts_month,
        },
        "deals": {
            "total": total_deals,
            "won": won_deals,
            "open": open_deals,
            "won_value": float(total_value),
            "pipeline_value": float(pipeline_value),
            "win_rate": round(won_deals / total_deals * 100, 1) if total_deals else 0,
        },
        "knocks": {
            "total": total_knocks,
            "interested": interested_knocks,
            "conversion_rate": round(interested_knocks / total_knocks * 100, 1) if total_knocks else 0,
        },
        "bookings": {
            "total": total_bookings,
            "completed": completed_bookings,
        },
    }


@router.get("/team-sales")
def team_sales(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Per-rep deal stats."""
    rows = (
        db.query(
            models.User.id,
            models.User.full_name,
            models.User.username,
            func.count(models.Deal.id).label("deals"),
            func.coalesce(func.sum(models.Deal.value), 0).label("value"),
        )
        .outerjoin(models.Deal, models.Deal.assigned_to == models.User.id)
        .group_by(models.User.id)
        .all()
    )
    return [
        {
            "user_id": r.id,
            "name": r.full_name or r.username,
            "deals": r.deals,
            "value": float(r.value),
        }
        for r in rows
    ]


@router.get("/new-numbers")
def new_numbers(days: int = 30, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """New contacts added per day over the last N days."""
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(
            func.date(models.Contact.created_at).label("date"),
            func.count(models.Contact.id).label("count"),
        )
        .filter(models.Contact.created_at >= since)
        .group_by(func.date(models.Contact.created_at))
        .order_by(func.date(models.Contact.created_at))
        .all()
    )
    return [{"date": str(r.date), "count": r.count} for r in rows]
