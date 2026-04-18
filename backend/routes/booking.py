from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


@router.get("/", response_model=List[schemas.Booking])
def list_bookings(
    technician_id: Optional[int] = None,
    status: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(models.Booking).options(
        joinedload(models.Booking.contact),
        joinedload(models.Booking.technician),
    )
    if technician_id:
        q = q.filter(models.Booking.technician_id == technician_id)
    if status:
        q = q.filter(models.Booking.status == status)
    if from_date:
        q = q.filter(models.Booking.scheduled_at >= from_date)
    if to_date:
        q = q.filter(models.Booking.scheduled_at <= to_date)
    return q.order_by(models.Booking.scheduled_at.asc()).offset(skip).limit(limit).all()


@router.get("/{booking_id}", response_model=schemas.Booking)
def get_booking(booking_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    b = (
        db.query(models.Booking)
        .options(joinedload(models.Booking.contact), joinedload(models.Booking.technician))
        .filter(models.Booking.id == booking_id)
        .first()
    )
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return b


@router.post("/", response_model=schemas.Booking)
def create_booking(
    booking: schemas.BookingCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_booking = models.Booking(**booking.model_dump(), created_by=current_user.id)
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    return db_booking


@router.put("/{booking_id}", response_model=schemas.Booking)
def update_booking(
    booking_id: int,
    booking: schemas.BookingUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    db_booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    for k, v in booking.model_dump(exclude_unset=True).items():
        setattr(db_booking, k, v)
    db.commit()
    db.refresh(db_booking)
    return db_booking


@router.delete("/{booking_id}")
def delete_booking(booking_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    db_booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    db.delete(db_booking)
    db.commit()
    return {"message": "Deleted"}
