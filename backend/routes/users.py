from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models
import schemas
from auth import require_admin, get_current_user, get_password_hash

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/team", response_model=List[schemas.UserBasic])
def list_team(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Return basic user info (id + name) for all active users — no admin required.
    Used by the Team Map to build the user-color legend."""
    return db.query(models.User).filter(models.User.is_active == True).order_by(models.User.created_at).all()


@router.get("/", response_model=List[schemas.User])
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(models.User).order_by(models.User.created_at).all()


@router.post("/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if db.query(models.User).filter(models.User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if user.email and db.query(models.User).filter(models.User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
    db_user = models.User(
        username=user.username,
        email=user.email or None,
        full_name=user.full_name,
        role=user.role,
        hashed_password=get_password_hash(user.password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.put("/{user_id}", response_model=schemas.User)
def update_user(user_id: int, user: schemas.UserUpdate, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.email is not None:
        db_user.email = user.email
    if user.phone is not None:
        db_user.phone = user.phone or None   # empty string → NULL
    if user.full_name is not None:
        db_user.full_name = user.full_name
    if user.role is not None:
        db_user.role = user.role
    if user.is_active is not None:
        db_user.is_active = user.is_active
    if user.password:
        db_user.hashed_password = get_password_hash(user.password)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    uid = db_user.id
    # Nullify nullable FK references so the delete doesn't violate constraints
    db.query(models.Deal).filter(models.Deal.assigned_to == uid).update({"assigned_to": None})
    db.query(models.Deal).filter(models.Deal.created_by == uid).update({"created_by": None})
    db.query(models.Contact).filter(models.Contact.created_by == uid).update({"created_by": None})
    db.query(models.Company).filter(models.Company.created_by == uid).update({"created_by": None})
    db.query(models.Activity).filter(models.Activity.created_by == uid).update({"created_by": None})

    # Delete rows that hard-reference the user
    db.query(models.DealTechnician).filter(models.DealTechnician.user_id == uid).delete()
    db.query(models.ReminderLog).filter(models.ReminderLog.user_id == uid).delete()
    for tbl in [models.TimeClock, models.TechAvailability, models.ShiftConfirmation, models.ChatMessage, models.Invite]:
        try:
            db.query(tbl).filter(tbl.user_id == uid).delete()
        except Exception:
            pass

    db.delete(db_user)
    db.commit()
    return {"message": "User deleted"}
