import os
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import models
import schemas
from auth import verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

OTP_TTL_MINUTES = 10
MAX_OTP_ATTEMPTS = 5

# Simple in-memory rate limiter: key -> [timestamps]
_rate_store: dict[str, list] = defaultdict(list)


def _real_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For from Railway's proxy."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host or "unknown"


def _rate_check(key: str, max_calls: int, window: int):
    now = time.time()
    hits = [t for t in _rate_store[key] if now - t < window]
    if len(hits) >= max_calls:
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait and try again.")
    hits.append(now)
    _rate_store[key] = hits


def _cleanup_otp_sessions(db: Session):
    db.query(models.OTPSession).filter(
        models.OTPSession.expires_at < datetime.utcnow()
    ).delete()
    db.commit()


def _send_otp_sms(phone: str, otp: str) -> bool:
    sid   = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    from_ = os.getenv("TWILIO_FROM_NUMBER")
    if not (sid and token and from_):
        return False
    try:
        from twilio.rest import Client
        Client(sid, token).messages.create(
            body=f"Your WMB CRM verification code is: {otp}. It expires in 10 minutes.",
            from_=from_,
            to=phone,
        )
        return True
    except Exception:
        return False


class OTPVerify(BaseModel):
    session_id: str
    otp: str


class LoginStep1Response(BaseModel):
    otp_required: bool
    session_id: str
    phone_hint: str


@router.post("/login")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    ip = _real_ip(request)
    _rate_check(f"login:{ip}", max_calls=10, window=60)

    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is disabled")

    # No phone on file — skip 2FA and issue token directly
    if not user.phone:
        token = create_access_token({"sub": user.username})
        return {"access_token": token, "token_type": "bearer", "otp_required": False}

    otp = str(secrets.randbelow(900000) + 100000)  # 6-digit
    session_id = secrets.token_urlsafe(24)

    _cleanup_otp_sessions(db)
    session = models.OTPSession(
        session_id=session_id,
        username=user.username,
        otp=otp,
        attempts=0,
        expires_at=datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES),
    )
    db.add(session)
    db.commit()

    sent = _send_otp_sms(user.phone, otp)
    if not sent:
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=500, detail="Failed to send verification SMS. Contact admin.")

    masked = "***" + user.phone[-4:] if len(user.phone) >= 4 else "***"
    return LoginStep1Response(otp_required=True, session_id=session_id, phone_hint=masked)


@router.post("/verify-otp", response_model=schemas.Token)
def verify_otp(request: Request, body: OTPVerify, db: Session = Depends(get_db)):
    ip = _real_ip(request)
    _rate_check(f"otp:{ip}", max_calls=15, window=60)

    _cleanup_otp_sessions(db)
    session = db.query(models.OTPSession).filter(
        models.OTPSession.session_id == body.session_id
    ).first()

    if not session or session.expires_at < datetime.utcnow():
        if session:
            db.delete(session)
            db.commit()
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    session.attempts += 1
    db.commit()

    if session.attempts > MAX_OTP_ATTEMPTS:
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=401, detail="Too many failed attempts. Please log in again.")

    if session.otp != body.otp.strip():
        if session.attempts >= MAX_OTP_ATTEMPTS:
            db.delete(session)
            db.commit()
            raise HTTPException(status_code=401, detail="Too many failed attempts. Please log in again.")
        raise HTTPException(status_code=401, detail="Incorrect verification code")

    username = session.username
    db.delete(session)
    db.commit()

    user = db.query(models.User).filter(models.User.username == username).first()
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.User)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user
