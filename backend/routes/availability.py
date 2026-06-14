from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional, List
from datetime import datetime, timedelta
from database import get_db
from auth import get_current_user
import models
from pydantic import BaseModel as _Base

router = APIRouter(prefix="/api/availability", tags=["availability"])

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _day_bounds(date_str: str):
    """Return (start, end) datetimes covering the whole calendar day."""
    day = datetime.strptime(date_str, "%Y-%m-%d")
    return day, day + timedelta(days=1)


def _deals_on_date(db: Session, date_str: str):
    """All non-cancelled deals whose appointment falls on `date_str`."""
    start, end = _day_bounds(date_str)
    return (
        db.query(models.Deal)
        .filter(
            models.Deal.expected_close_date >= start,
            models.Deal.expected_close_date < end,
            models.Deal.job_status != "cancelled",
        )
        .all()
    )


def assign_tech_to_day(db: Session, user_id: int, date_str: str) -> int:
    """Add `user_id` as a technician on every deal scheduled for `date_str`.
    Returns the number of newly-assigned deals. Idempotent."""
    added = 0
    for deal in _deals_on_date(db, date_str):
        exists_row = db.query(models.DealTechnician).filter(
            models.DealTechnician.deal_id == deal.id,
            models.DealTechnician.user_id == user_id,
        ).first()
        if not exists_row:
            db.add(models.DealTechnician(deal_id=deal.id, user_id=user_id))
            added += 1
    if added:
        db.commit()
    return added


def unassign_tech_from_day(db: Session, user_id: int, date_str: str) -> None:
    """Remove `user_id` from every deal scheduled for `date_str` (releases a claim)."""
    deal_ids = [d.id for d in _deals_on_date(db, date_str)]
    if deal_ids:
        db.query(models.DealTechnician).filter(
            models.DealTechnician.user_id == user_id,
            models.DealTechnician.deal_id.in_(deal_ids),
        ).delete(synchronize_session=False)
        db.commit()


def day_owner(db: Session, date_str: str):
    """Return the ShiftConfirmation that owns `date_str`, or None.
    A day can be claimed by at most one technician."""
    return db.query(models.ShiftConfirmation).filter(
        models.ShiftConfirmation.shift_date == date_str
    ).first()


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
    if current_user.role not in ("admin", "ceo"):
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
    """Tech claims a day: it becomes exclusively theirs and every appointment
    that day is auto-assigned to them. A day can only be claimed by one tech."""
    # Is the day already claimed by someone else?
    owner = day_owner(db, body.shift_date)
    if owner and owner.user_id != current_user.id:
        owner_name = owner.user.full_name or owner.user.username if owner.user else "another technician"
        raise HTTPException(
            status_code=409,
            detail=f"This day is already claimed by {owner_name}.",
        )

    existing = owner if owner and owner.user_id == current_user.id else None
    if not existing:
        try:
            existing = models.ShiftConfirmation(
                user_id=current_user.id,
                shift_date=body.shift_date,
            )
            db.add(existing)
            db.commit()
            db.refresh(existing)
        except IntegrityError:
            db.rollback()
            existing = db.query(models.ShiftConfirmation).filter(
                models.ShiftConfirmation.user_id == current_user.id,
                models.ShiftConfirmation.shift_date == body.shift_date,
            ).first()

    # Auto-assign this tech to every appointment already booked that day
    assigned = assign_tech_to_day(db, current_user.id, body.shift_date)

    return {
        "user_id": existing.user_id,
        "shift_date": existing.shift_date,
        "confirmed_at": existing.confirmed_at.isoformat(),
        "jobs_assigned": assigned,
    }


@router.delete("/confirm/{shift_date}")
def unconfirm_shift(
    shift_date: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Tech releases their claim on a date. Their auto-assigned appointments for
    that day are unassigned, freeing the day for another technician to claim."""
    row = db.query(models.ShiftConfirmation).filter(
        models.ShiftConfirmation.user_id == current_user.id,
        models.ShiftConfirmation.shift_date == shift_date,
    ).first()
    if row:
        db.delete(row)
        db.commit()
        unassign_tech_from_day(db, current_user.id, shift_date)
    return {"ok": True}


@router.get("/day-claims")
def get_day_claims(
    week_start: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Every claimed day with the tech who owns it. Visible to all users so a
    tech can see which days are already taken. Optionally scoped to one week."""
    q = db.query(models.ShiftConfirmation)
    if week_start:
        monday = _week_monday(week_start)
        sunday = (datetime.strptime(monday, "%Y-%m-%d").date() + timedelta(days=6)).strftime("%Y-%m-%d")
        q = q.filter(
            models.ShiftConfirmation.shift_date >= monday,
            models.ShiftConfirmation.shift_date <= sunday,
        )
    return [
        {
            "shift_date": c.shift_date,
            "user_id": c.user_id,
            "full_name": c.user.full_name if c.user else None,
            "username": c.user.username if c.user else None,
        }
        for c in q.order_by(models.ShiftConfirmation.shift_date.asc()).all()
    ]


@router.get("/confirmations")
def get_confirmations(
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get shift confirmations. Tech: own. Admin: all or filtered by user_id."""
    q = db.query(models.ShiftConfirmation)
    if current_user.role not in ("admin", "ceo"):
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
    if current_user.role not in ("admin", "ceo"):
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
