from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/timesheet", tags=["timesheet"])


@router.get("/active")
def get_active_entry(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Return the current user's open clock-in entry if any."""
    entry = (
        db.query(models.TimeEntry)
        .filter(
            models.TimeEntry.user_id == current_user.id,
            models.TimeEntry.clock_out == None,
        )
        .order_by(models.TimeEntry.clock_in.desc())
        .first()
    )
    if not entry:
        return None
    return schemas.TimeEntryOut.model_validate(entry)


@router.post("/clock-in", response_model=schemas.TimeEntryOut)
def clock_in(
    payload: schemas.TimeEntryClockIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Ensure no open entry exists
    open_entry = (
        db.query(models.TimeEntry)
        .filter(
            models.TimeEntry.user_id == current_user.id,
            models.TimeEntry.clock_out == None,
        )
        .first()
    )
    if open_entry:
        raise HTTPException(status_code=400, detail="Already clocked in")
    entry = models.TimeEntry(
        user_id=current_user.id,
        clock_in=datetime.utcnow(),
        notes=payload.notes,
        job_id=payload.job_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/clock-out", response_model=schemas.TimeEntryOut)
def clock_out(
    payload: schemas.TimeEntryClockOut,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    entry = (
        db.query(models.TimeEntry)
        .filter(
            models.TimeEntry.user_id == current_user.id,
            models.TimeEntry.clock_out == None,
        )
        .order_by(models.TimeEntry.clock_in.desc())
        .first()
    )
    if not entry:
        raise HTTPException(status_code=400, detail="Not clocked in")
    entry.clock_out = datetime.utcnow()
    if payload.notes:
        entry.notes = payload.notes
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/", response_model=List[schemas.TimeEntryOut])
def list_entries(
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.TimeEntry).options(joinedload(models.TimeEntry.user))
    if current_user.role != "admin":
        q = q.filter(models.TimeEntry.user_id == current_user.id)
    elif user_id:
        q = q.filter(models.TimeEntry.user_id == user_id)
    return q.order_by(models.TimeEntry.clock_in.desc()).offset(skip).limit(limit).all()
