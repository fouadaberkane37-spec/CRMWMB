import os
import secrets
import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import models
import schemas
from auth import verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

# In-memory OTP store: session_id -> {username, otp, expires_at, attempts}
_otp_store: dict[str, dict] = {}
OTP_TTL = 600       # 10 minutes
MAX_OTP_ATTEMPTS = 5

# Simple in-memory rate limiter: ip -> [timestamps]
_login_hits: dict[str, list] = defaultdict(list)
_otp_hits:   dict[str, list] = defaultdict(list)


def _rate_check(store: dict, key: str, max_calls: int, window: int):
    now = time.time()
    hits = [t for t in store[key] if now - t < window]
    if len(hits) >= max_calls:
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait and try again.")
    hits.append(now)
    store[key] = hits


def _cleanup_otp():
    now = time.time()
    for k in [k for k, v in _otp_store.items() if v["expires_at"] < now]:
        del _otp_store[k]


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
    ip = request.client.host or "unknown"
    _rate_check(_login_hits, ip, max_calls=10, window=60)  # 10 attempts/min per IP

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

    _cleanup_otp()
    _otp_store[session_id] = {
        "username": user.username,
        "otp": otp,
        "expires_at": time.time() + OTP_TTL,
        "attempts": 0,
    }

    sent = _send_otp_sms(user.phone, otp)
    if not sent:
        del _otp_store[session_id]
        raise HTTPException(status_code=500, detail="Failed to send verification SMS. Contact admin.")

    masked = "***" + user.phone[-4:] if len(user.phone) >= 4 else "***"
    return LoginStep1Response(otp_required=True, session_id=session_id, phone_hint=masked)


@router.post("/verify-otp", response_model=schemas.Token)
def verify_otp(request: Request, body: OTPVerify, db: Session = Depends(get_db)):
    ip = request.client.host or "unknown"
    _rate_check(_otp_hits, ip, max_calls=15, window=60)  # 15 attempts/min per IP

    entry = _otp_store.get(body.session_id)
    if not entry:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if time.time() > entry["expires_at"]:
        del _otp_store[body.session_id]
        raise HTTPException(status_code=401, detail="Verification code expired")

    entry["attempts"] += 1
    if entry["attempts"] > MAX_OTP_ATTEMPTS:
        del _otp_store[body.session_id]
        raise HTTPException(status_code=401, detail="Too many failed attempts. Please log in again.")

    if entry["otp"] != body.otp.strip():
        if entry["attempts"] >= MAX_OTP_ATTEMPTS:
            del _otp_store[body.session_id]
            raise HTTPException(status_code=401, detail="Too many failed attempts. Please log in again.")
        raise HTTPException(status_code=401, detail="Incorrect verification code")

    del _otp_store[body.session_id]
    user = db.query(models.User).filter(models.User.username == entry["username"]).first()
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.User)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user
