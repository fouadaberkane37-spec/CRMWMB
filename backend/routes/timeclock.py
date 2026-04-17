from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date, timedelta
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/timeclock", tags=["timeclock"])


def _entry_to_out(entry: models.TimeClock) -> schemas.TimeClockOut:
    return schemas.TimeClockOut(
        id=entry.id,
        user_id=entry.user_id,
        username=entry.user.username if entry.user else "",
        full_name=entry.user.full_name if entry.user else None,
        deal_id=entry.deal_id,
        deal_title=entry.deal.title if entry.deal else None,
        clock_type=entry.clock_type,
        clocked_at=entry.clocked_at,
        notes=entry.notes,
    )


@router.post("/", response_model=schemas.TimeClockOut)
def clock_in_out(
    body: schemas.TimeClockCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if body.clock_type not in ("in", "out"):
        raise HTTPException(status_code=400, detail="clock_type must be 'in' or 'out'")

    # Prevent duplicate events within 30 seconds (race-condition / double-submit guard)
    recent = db.query(models.TimeClock).filter(
        models.TimeClock.user_id == current_user.id,
        models.TimeClock.clock_type == body.clock_type,
        models.TimeClock.clocked_at >= datetime.utcnow() - timedelta(seconds=30),
    ).first()
    if recent:
        raise HTTPException(status_code=409, detail="Duplicate clock event — please wait before submitting again")

    # Validate deal exists if provided
    if body.deal_id is not None:
        deal = db.query(models.Deal).filter(models.Deal.id == body.deal_id).first()
        if not deal:
            raise HTTPException(status_code=404, detail="Deal not found")

    entry = models.TimeClock(
        user_id=current_user.id,
        deal_id=body.deal_id,
        clock_type=body.clock_type,
        clocked_at=datetime.utcnow(),
        notes=body.notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    # Load relationships
    entry = (
        db.query(models.TimeClock)
        .filter(models.TimeClock.id == entry.id)
        .first()
    )
    return _entry_to_out(entry)


@router.get("/", response_model=List[schemas.TimeClockOut])
def list_entries(
    user_id: Optional[int] = None,
    deal_id: Optional[int] = None,
    date: Optional[str] = None,        # YYYY-MM-DD
    from_date: Optional[str] = None,   # YYYY-MM-DD
    to_date: Optional[str] = None,     # YYYY-MM-DD
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = (
        db.query(models.TimeClock)
        .join(models.User, models.TimeClock.user_id == models.User.id)
    )

    # Non-admins always see only their own entries
    if current_user.role != "admin":
        q = q.filter(models.TimeClock.user_id == current_user.id)
    elif user_id is not None:
        q = q.filter(models.TimeClock.user_id == user_id)

    if deal_id is not None:
        q = q.filter(models.TimeClock.deal_id == deal_id)

    # Date filtering
    if date:
        try:
            d = datetime.strptime(date, "%Y-%m-%d")
            q = q.filter(
                models.TimeClock.clocked_at >= d,
                models.TimeClock.clocked_at < d + timedelta(days=1),
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format; use YYYY-MM-DD")
    else:
        if from_date:
            try:
                fd = datetime.strptime(from_date, "%Y-%m-%d")
                if fd < datetime.utcnow() - timedelta(days=730):
                    raise HTTPException(status_code=400, detail="from_date too old (max 2 years)")
                q = q.filter(models.TimeClock.clocked_at >= fd)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid from_date format; use YYYY-MM-DD")
        if to_date:
            try:
                td = datetime.strptime(to_date, "%Y-%m-%d")
                q = q.filter(models.TimeClock.clocked_at < td + timedelta(days=1))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid to_date format; use YYYY-MM-DD")

    entries = q.order_by(models.TimeClock.clocked_at.asc()).all()
    return [_entry_to_out(e) for e in entries]
