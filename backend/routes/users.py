import os
import secrets
import string
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models
import schemas
from auth import require_admin, get_current_user, get_password_hash

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["users"])

ALLOWED_ROLES = {"admin", "user", "technician", "sales", "ceo"}
MIN_PASSWORD_LENGTH = 8
_PWD_ALPHABET = string.ascii_letters + string.digits + "!@#$%&"
APP_URL = os.getenv("APP_URL", "https://crmwmb-production.up.railway.app")


def _validate_password(password: str):
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters")


def _generate_password(length: int = 12) -> str:
    return "".join(secrets.choice(_PWD_ALPHABET) for _ in range(length))


def _send_welcome_sms(phone: str, name: str, username: str, password: str) -> bool:
    sid      = os.getenv("TWILIO_ACCOUNT_SID")
    token    = os.getenv("TWILIO_AUTH_TOKEN")
    from_num = os.getenv("TWILIO_FROM_NUMBER")
    if not (sid and token and from_num):
        return False
    try:
        from twilio.rest import Client
        body = (
            f"Hi {name}! Your WMB CRM account is ready.\n"
            f"Username: {username}\n"
            f"Password: {password}\n"
            f"Login at: {APP_URL}"
        )
        Client(sid, token).messages.create(body=body, from_=from_num, to=phone)
        return True
    except Exception as e:
        log.error("[welcome SMS] failed to=%s error=%s", phone, e)
        return False


def _send_password_sms(phone: str, name: str, password: str) -> bool:
    sid      = os.getenv("TWILIO_ACCOUNT_SID")
    token    = os.getenv("TWILIO_AUTH_TOKEN")
    from_num = os.getenv("TWILIO_FROM_NUMBER")
    if not (sid and token and from_num):
        return False
    try:
        from twilio.rest import Client
        body = (
            f"Hi {name}! Your WMB CRM password has been reset.\n"
            f"New password: {password}\n"
            f"Please log in and update it right away."
        )
        Client(sid, token).messages.create(body=body, from_=from_num, to=phone)
        return True
    except Exception:
        return False


@router.get("/team", response_model=List[schemas.UserBasic])
def list_team(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(models.User).filter(models.User.is_active == True).order_by(models.User.created_at).all()


@router.get("/", response_model=List[schemas.User])
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(models.User).order_by(models.User.created_at).all()


@router.post("/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    _validate_password(user.password)
    if user.role and user.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(sorted(ALLOWED_ROLES))}")
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
    if db_user.phone:
        _send_welcome_sms(db_user.phone, db_user.full_name or db_user.username, db_user.username, user.password)
    return db_user


@router.put("/{user_id}", response_model=schemas.User)
def update_user(user_id: int, user: schemas.UserUpdate, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.email is not None:
        db_user.email = user.email
    if user.phone is not None:
        db_user.phone = user.phone or None
    if user.full_name is not None:
        db_user.full_name = user.full_name
    if user.role is not None:
        if user.role not in ALLOWED_ROLES:
            raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(sorted(ALLOWED_ROLES))}")
        if user.role == "admin" and db_user.role != "admin":
            log.warning("[AUDIT] user_id=%s promoted to admin by admin_id=%s", user_id, current_user.id)
        elif db_user.role == "admin" and user.role != "admin":
            log.warning("[AUDIT] user_id=%s demoted from admin by admin_id=%s", user_id, current_user.id)
        db_user.role = user.role
    if user.is_active is not None:
        db_user.is_active = user.is_active
    if user.password:
        _validate_password(user.password)
        db_user.hashed_password = get_password_hash(user.password)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/reset-all-passwords")
def reset_all_passwords(db: Session = Depends(get_db), current_user=Depends(require_admin)):
    """Generate new random passwords for all non-admin users and send via SMS."""
    users = (
        db.query(models.User)
        .filter(models.User.role != "admin", models.User.is_active == True)
        .all()
    )
    results = []
    for u in users:
        pwd = _generate_password(12)
        u.hashed_password = get_password_hash(pwd)
        sent = False
        if u.phone:
            sent = _send_password_sms(u.phone, u.full_name or u.username, pwd)
        results.append({
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "phone": u.phone,
            "sms_sent": sent,
        })
    db.commit()
    return {"reset": len(users), "details": results}


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    uid = db_user.id
    db.query(models.Deal).filter(models.Deal.assigned_to == uid).update({"assigned_to": None})
    db.query(models.Deal).filter(models.Deal.created_by == uid).update({"created_by": None})
    db.query(models.Contact).filter(models.Contact.created_by == uid).update({"created_by": None})
    db.query(models.Company).filter(models.Company.created_by == uid).update({"created_by": None})
    db.query(models.Activity).filter(models.Activity.created_by == uid).update({"created_by": None})

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
