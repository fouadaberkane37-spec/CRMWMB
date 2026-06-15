from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel as _Base, Field
from database import get_db
import models
from auth import get_current_user

router = APIRouter(prefix="/api/hours", tags=["hours"])


class HoursIn(_Base):
    log_date: str          # YYYY-MM-DD
    hours: float = Field(..., ge=0, le=24)
    notes: Optional[str] = None


class HoursOut(_Base):
    id: int
    user_id: int
    username: str
    full_name: Optional[str]
    log_date: str
    hours: float
    notes: Optional[str]
    updated_at: Optional[str]

    class Config:
        from_attributes = True


def _out(row: models.DailyHoursLog) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "username": row.user.username if row.user else "",
        "full_name": row.user.full_name if row.user else None,
        "log_date": row.log_date,
        "hours": row.hours,
        "notes": row.notes,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.post("/")
def log_hours(
    body: HoursIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Tech submits (or updates) their hours for a day. One entry per user per date."""
    existing = db.query(models.DailyHoursLog).filter(
        models.DailyHoursLog.user_id == current_user.id,
        models.DailyHoursLog.log_date == body.log_date,
    ).first()
    if existing:
        existing.hours      = body.hours
        existing.notes      = body.notes
        existing.updated_at = datetime.utcnow()
    else:
        existing = models.DailyHoursLog(
            user_id=current_user.id,
            log_date=body.log_date,
            hours=body.hours,
            notes=body.notes,
        )
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return _out(existing)


@router.get("/")
def list_hours(
    log_date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Admin/CEO: see all entries, optionally filtered.
    Tech: see only their own.
    """
    q = db.query(models.DailyHoursLog)
    if current_user.role not in ("admin", "ceo"):
        q = q.filter(models.DailyHoursLog.user_id == current_user.id)
    elif user_id:
        q = q.filter(models.DailyHoursLog.user_id == user_id)

    if log_date:
        q = q.filter(models.DailyHoursLog.log_date == log_date)
    if from_date:
        q = q.filter(models.DailyHoursLog.log_date >= from_date)
    if to_date:
        q = q.filter(models.DailyHoursLog.log_date <= to_date)

    rows = q.order_by(models.DailyHoursLog.log_date.desc()).all()
    return [_out(r) for r in rows]
