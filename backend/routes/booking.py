from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
from database import get_db
import models
import schemas
import scheduling
from auth import get_current_user

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _day_bookings(db: Session, dt: datetime, exclude_id: Optional[int] = None):
    """Return all bookings on the same calendar day as dt, optionally excluding one."""
    d     = dt.date()
    start = datetime(d.year, d.month, d.day,  0,  0,  0)
    end   = datetime(d.year, d.month, d.day, 23, 59, 59)
    q = db.query(models.Booking).filter(
        models.Booking.scheduled_at >= start,
        models.Booking.scheduled_at <= end,
    )
    if exclude_id is not None:
        q = q.filter(models.Booking.id != exclude_id)
    return q.all()


def _load(db: Session, booking_id: int):
    return (
        db.query(models.Booking)
        .options(joinedload(models.Booking.contact),
                 joinedload(models.Booking.technician))
        .filter(models.Booking.id == booking_id)
        .first()
    )


# ── Service config (consumed by frontend) ─────────────────────────────────────

@router.get("/service-config")
def get_service_config(_=Depends(get_current_user)):
    """Return full service-type configuration for frontend consumption."""
    return {
        k: {"techs": v[0], "default_duration": v[1], "label": v[2]}
        for k, v in scheduling.SERVICE_CONFIG.items()
    }


# ── Available slots ───────────────────────────────────────────────────────────

@router.get("/available-slots")
def get_available_slots(
    date:       str           = Query(...,    description="YYYY-MM-DD"),
    type:       str           = Query("service"),
    duration:   Optional[int] = Query(None,   description="Override duration (minutes)"),
    exclude_id: Optional[int] = Query(None,   description="Booking ID to exclude (for edits)"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

    dur        = duration or scheduling.get_default_duration(type)
    day        = _day_bookings(db, dt, exclude_id)
    slots      = scheduling.available_slots(type, date, dur, day)
    active     = [b for b in day if (b.status or 'todo') != 'cancelled']
    day_class  = scheduling.classify_day(active)

    return {
        "slots":            slots,
        "day_class":        day_class,
        "tech_requirement": scheduling.get_tech_requirement(type),
        "duration_minutes": dur,
        "blocked_reason":   None if slots or day_class == 'empty' else _block_reason(day_class, type),
    }


def _block_reason(day_class: str, service_type: str) -> Optional[str]:
    new_techs = scheduling.get_tech_requirement(service_type)
    if day_class == 'mixed':
        return "Cette journée contient des rendez-vous mixtes. Aucun nouveau rendez-vous ne peut y être ajouté."
    if day_class == '1-tech' and new_techs == 2:
        if service_type == 'gutters':
            return "Impossible d'ajouter un nettoyage de gouttières : cette journée est déjà classée comme journée à 1 technicien."
        return "Impossible d'ajouter ce service à 2 techniciens : cette journée est déjà classée comme journée à 1 technicien."
    if day_class == '2-tech' and new_techs == 1:
        return "Impossible d'ajouter ce service à 1 technicien : cette journée nécessite 2 techniciens."
    if day_class == '1-tech':
        return "Cette journée a atteint sa capacité maximale de 5 rendez-vous."
    return "Aucun créneau disponible pour cette journée."


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.Booking])
def list_bookings(
    technician_id: Optional[int]      = None,
    status:        Optional[str]      = None,
    from_date:     Optional[datetime] = None,
    to_date:       Optional[datetime] = None,
    skip:          int = 0,
    limit:         int = 200,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(models.Booking).options(
        joinedload(models.Booking.contact),
        joinedload(models.Booking.technician),
    )
    if technician_id: q = q.filter(models.Booking.technician_id == technician_id)
    if status:        q = q.filter(models.Booking.status == status)
    if from_date:     q = q.filter(models.Booking.scheduled_at >= from_date)
    if to_date:       q = q.filter(models.Booking.scheduled_at <= to_date)
    return q.order_by(models.Booking.scheduled_at.asc()).offset(skip).limit(limit).all()


@router.get("/{booking_id}", response_model=schemas.Booking)
def get_booking(booking_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    b = _load(db, booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return b


@router.post("/", response_model=schemas.Booking)
def create_booking(
    booking: schemas.BookingCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Auto-fill duration from service type if client sent the schema default (60)
    # or nothing meaningful — prefer the service-type default.
    dur = booking.duration_minutes if booking.duration_minutes else scheduling.get_default_duration(booking.type)

    # Validate scheduling constraints
    day = _day_bookings(db, booking.scheduled_at)
    err = scheduling.validate_new_booking(booking.type, booking.scheduled_at, dur, day)
    if err:
        raise HTTPException(status_code=422, detail=err)

    data = booking.model_dump()
    data['duration_minutes'] = dur
    db_booking = models.Booking(**data, created_by=current_user.id)
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    return _load(db, db_booking.id)


@router.put("/{booking_id}", response_model=schemas.Booking)
def update_booking(
    booking_id: int,
    booking:    schemas.BookingUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    db_booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Only validate scheduling when time or type actually changes
    if booking.scheduled_at is not None or booking.type is not None:
        new_type     = booking.type         if booking.type         is not None else db_booking.type
        new_sched    = booking.scheduled_at if booking.scheduled_at is not None else db_booking.scheduled_at
        new_duration = booking.duration_minutes if booking.duration_minutes is not None else db_booking.duration_minutes

        day = _day_bookings(db, new_sched, exclude_id=booking_id)
        err = scheduling.validate_new_booking(new_type, new_sched, new_duration, day)
        if err:
            raise HTTPException(status_code=422, detail=err)

    for k, v in booking.model_dump(exclude_unset=True).items():
        setattr(db_booking, k, v)
    db.commit()
    db.refresh(db_booking)
    return _load(db, booking_id)


@router.delete("/{booking_id}")
def delete_booking(booking_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    db_booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    db.delete(db_booking)
    db.commit()
    return {"message": "Deleted"}
