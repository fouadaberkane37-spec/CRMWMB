from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timedelta
from database import get_db
from auth import get_current_user
import models
from pydantic import BaseModel as _Base

router = APIRouter(prefix="/api/availability", tags=["availability"])

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _week_monday(date_str: str) -> str:
    """Return the Monday of the week containing date_str (YYYY-MM-DD)."""
    from fastapi import HTTPException
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format; use YYYY-MM-DD")
    today = datetime.utcnow().date()
    if not (today.replace(year=today.year - 1) <= d <= today.replace(year=today.year + 2)):
        raise HTTPException(status_code=400, detail="Date must be within 1 year past or 2 years future")
    return (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")


def _avail_out(a: models.TechAvailability) -> dict:
    return {
        "id": a.id,
        "user_id": a.user_id,
        "full_name": a.user.full_name if a.user else None,
        "username": a.user.username if a.user else None,
        "week_start": a.week_start,
        **{d: getattr(a, d) for d in DAYS},
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


# ── Payloads ──────────────────────────────────────────────────────────────────

class AvailabilityIn(_Base):
    week_start: str          # any date in the week — we normalise to Monday
    mon: bool = False
    tue: bool = False
    wed: bool = False
    thu: bool = False
    fri: bool = False
    sat: bool = False
    sun: bool = False


class ConfirmIn(_Base):
    shift_date: str          # YYYY-MM-DD


# ── Tech: set / get own availability ─────────────────────────────────────────

@router.post("/")
def set_availability(
    body: AvailabilityIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Submit or update availability for a week (creates or overwrites)."""
    week_start = _week_monday(body.week_start)
    row = db.query(models.TechAvailability).filter(
        models.TechAvailability.user_id == current_user.id,
        models.TechAvailability.week_start == week_start,
    ).first()
    if row:
        for d in DAYS:
            setattr(row, d, getattr(body, d))
        row.updated_at = datetime.utcnow()
    else:
        row = models.TechAvailability(
            user_id=current_user.id,
            week_start=week_start,
            **{d: getattr(body, d) for d in DAYS},
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return _avail_out(row)


@router.get("/")
def get_availability(
    week_start: Optional[str] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Tech: their own records.
    Admin: all techs, optionally filtered by user_id and/or week_start.
    """
    q = db.query(models.TechAvailability)
    if current_user.role != "admin":
        q = q.filter(models.TechAvailability.user_id == current_user.id)
    elif user_id:
        q = q.filter(models.TechAvailability.user_id == user_id)
    if week_start:
        q = q.filter(models.TechAvailability.week_start == _week_monday(week_start))
    return [_avail_out(a) for a in q.order_by(models.TechAvailability.week_start.desc()).all()]


# ── Tech: confirm shift ───────────────────────────────────────────────────────

@router.post("/confirm")
def confirm_shift(
    body: ConfirmIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Tech confirms they will be on-site on a specific date (idempotent)."""
    existing = db.query(models.ShiftConfirmation).filter(
        models.ShiftConfirmation.user_id == current_user.id,
        models.ShiftConfirmation.shift_date == body.shift_date,
    ).first()
    if not existing:
        existing = models.ShiftConfirmation(
            user_id=current_user.id,
            shift_date=body.shift_date,
        )
        db.add(existing)
        db.commit()
        db.refresh(existing)
    return {
        "user_id": existing.user_id,
        "shift_date": existing.shift_date,
        "confirmed_at": existing.confirmed_at.isoformat(),
    }


@router.delete("/confirm/{shift_date}")
def unconfirm_shift(
    shift_date: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Tech removes their confirmation for a date."""
    row = db.query(models.ShiftConfirmation).filter(
        models.ShiftConfirmation.user_id == current_user.id,
        models.ShiftConfirmation.shift_date == shift_date,
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}


@router.get("/confirmations")
def get_confirmations(
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get shift confirmations. Tech: own. Admin: all or filtered by user_id."""
    q = db.query(models.ShiftConfirmation)
    if current_user.role != "admin":
        q = q.filter(models.ShiftConfirmation.user_id == current_user.id)
    elif user_id:
        q = q.filter(models.ShiftConfirmation.user_id == user_id)
    return [
        {
            "user_id": c.user_id,
            "shift_date": c.shift_date,
            "confirmed_at": c.confirmed_at.isoformat(),
        }
        for c in q.order_by(models.ShiftConfirmation.shift_date.asc()).all()
    ]


# ── Admin: techs available for a date ────────────────────────────────────────

@router.get("/techs-for-date")
def techs_for_date(
    date: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Admin: returns all technicians with their availability and confirmation
    status for a specific date.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    week_start = _week_monday(date)
    d = datetime.strptime(date, "%Y-%m-%d").date()
    day_col = DAYS[d.weekday()]   # mon / tue / … / sun

    techs = (
        db.query(models.User)
        .filter(models.User.role == "technician", models.User.is_active == True)
        .all()
    )
    result = []
    for tech in techs:
        avail = db.query(models.TechAvailability).filter(
            models.TechAvailability.user_id == tech.id,
            models.TechAvailability.week_start == week_start,
        ).first()
        is_available = bool(avail and getattr(avail, day_col, False))

        confirmed = db.query(models.ShiftConfirmation).filter(
            models.ShiftConfirmation.user_id == tech.id,
            models.ShiftConfirmation.shift_date == date,
        ).first() is not None

        result.append({
            "id": tech.id,
            "username": tech.username,
            "full_name": tech.full_name,
            "available": is_available,
            "confirmed": confirmed,
        })

    return result
