from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/knocks", tags=["knocks"])


@router.get("/", response_model=List[schemas.Knock])
def list_knocks(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(models.Knock).options(joinedload(models.Knock.contact)).order_by(models.Knock.created_at.desc()).all()


@router.post("/", response_model=schemas.Knock)
def create_knock(data: schemas.KnockCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    knock = models.Knock(**data.model_dump(), created_by=current_user.id)
    db.add(knock)
    db.commit()
    db.refresh(knock)
    return db.query(models.Knock).options(joinedload(models.Knock.contact)).filter(models.Knock.id == knock.id).first()


@router.patch("/{knock_id}", response_model=schemas.Knock)
def update_knock(knock_id: int, data: schemas.KnockUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    knock = db.query(models.Knock).filter(models.Knock.id == knock_id).first()
    if not knock:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(knock, k, v)
    db.commit()
    db.refresh(knock)
    return db.query(models.Knock).options(joinedload(models.Knock.contact)).filter(models.Knock.id == knock_id).first()


@router.delete("/{knock_id}")
def delete_knock(knock_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    knock = db.query(models.Knock).filter(models.Knock.id == knock_id).first()
    if not knock:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(knock)
    db.commit()
    return {"ok": True}
