from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/knocks", tags=["knocks"])


def _own_knock(knock: models.Knock, user: models.User) -> bool:
    return user.role in ("admin", "ceo") or knock.created_by == user.id


@router.get("/", response_model=List[schemas.Knock])
def list_knocks(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    q = db.query(models.Knock).options(joinedload(models.Knock.contact))
    if current_user.role not in ("admin", "ceo"):
        q = q.filter(models.Knock.created_by == current_user.id)
    return q.order_by(models.Knock.created_at.desc()).all()


@router.post("/", response_model=schemas.Knock)
def create_knock(data: schemas.KnockCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if data.contact_id and current_user.role not in ("admin", "ceo"):
        contact = db.query(models.Contact).filter(models.Contact.id == data.contact_id).first()
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        if contact.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot link knock to a contact you don't own")
    knock = models.Knock(**data.model_dump(), created_by=current_user.id)
    db.add(knock)
    db.commit()
    db.refresh(knock)
    return db.query(models.Knock).options(joinedload(models.Knock.contact)).filter(models.Knock.id == knock.id).first()


@router.patch("/{knock_id}", response_model=schemas.Knock)
def update_knock(knock_id: int, data: schemas.KnockUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    knock = db.query(models.Knock).filter(models.Knock.id == knock_id).first()
    if not knock:
        raise HTTPException(status_code=404, detail="Not found")
    if not _own_knock(knock, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    updates = data.model_dump(exclude_unset=True)
    if "contact_id" in updates and updates["contact_id"] is not None and current_user.role not in ("admin", "ceo"):
        contact = db.query(models.Contact).filter(models.Contact.id == updates["contact_id"]).first()
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        if contact.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot link knock to a contact you don't own")
    for k, v in updates.items():
        setattr(knock, k, v)
    db.commit()
    db.refresh(knock)
    return db.query(models.Knock).options(joinedload(models.Knock.contact)).filter(models.Knock.id == knock_id).first()


@router.delete("/{knock_id}")
def delete_knock(knock_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    knock = db.query(models.Knock).filter(models.Knock.id == knock_id).first()
    if not knock:
        raise HTTPException(status_code=404, detail="Not found")
    if not _own_knock(knock, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(knock)
    db.commit()
    return {"ok": True}
