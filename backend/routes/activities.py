from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("/", response_model=List[schemas.Activity])
def list_activities(
    type: Optional[str] = None,
    contact_id: Optional[int] = None,
    deal_id: Optional[int] = None,
    completed: Optional[bool] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(models.Activity).options(joinedload(models.Activity.contact))
    if type:
        q = q.filter(models.Activity.type == type)
    if contact_id:
        q = q.filter(models.Activity.contact_id == contact_id)
    if deal_id:
        q = q.filter(models.Activity.deal_id == deal_id)
    if completed is not None:
        q = q.filter(models.Activity.completed == completed)
    return q.order_by(models.Activity.created_at.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=schemas.Activity)
def create_activity(activity: schemas.ActivityCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_activity = models.Activity(**activity.model_dump(), created_by=current_user.id)
    db.add(db_activity)
    db.commit()
    db.refresh(db_activity)
    return db_activity


@router.put("/{activity_id}", response_model=schemas.Activity)
def update_activity(activity_id: int, activity: schemas.ActivityUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    db_activity = db.query(models.Activity).filter(models.Activity.id == activity_id).first()
    if not db_activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    for k, v in activity.model_dump(exclude_unset=True).items():
        setattr(db_activity, k, v)
    db.commit()
    db.refresh(db_activity)
    return db_activity


@router.patch("/{activity_id}/complete", response_model=schemas.Activity)
def complete_activity(activity_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    db_activity = db.query(models.Activity).filter(models.Activity.id == activity_id).first()
    if not db_activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    db_activity.completed = True
    db_activity.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(db_activity)
    return db_activity


@router.delete("/{activity_id}")
def delete_activity(activity_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    db_activity = db.query(models.Activity).filter(models.Activity.id == activity_id).first()
    if not db_activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    db.delete(db_activity)
    db.commit()
    return {"message": "Deleted"}
