import secrets
import os
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List

from database import get_db
import models
import schemas
from auth import get_current_user, require_admin, get_password_hash

router = APIRouter(prefix="/api/invites", tags=["invites"])

_invite_check_hits: dict[str, list] = defaultdict(list)
_invite_token_hits: dict[str, list] = defaultdict(list)


def _invite_rate_check(request: Request):
    forwarded = request.headers.get("X-Forwarded-For", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host or "unknown")
    now = time.time()
    hits = [t for t in _invite_check_hits[ip] if now - t < 60]
    if len(hits) >= 10:
        raise HTTPException(status_code=429, detail="Too many requests")
    hits.append(now)
    _invite_check_hits[ip] = hits


def _invite_token_rate_check(token: str):
    """Per-token rate limit to prevent brute-force against a specific invite."""
    now = time.time()
    hits = [t for t in _invite_token_hits[token] if now - t < 60]
    if len(hits) >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts for this invite")
    hits.append(now)
    _invite_token_hits[token] = hits

INVITE_EXPIRY_HOURS = 48


def _send_invite_sms(to_phone: str, invite_url: str, inviter_name: str, full_name: str):
    """Send invite via Twilio SMS. Silently skips if Twilio not configured."""
    sid       = os.getenv("TWILIO_ACCOUNT_SID")
    token     = os.getenv("TWILIO_AUTH_TOKEN")
    from_num  = os.getenv("TWILIO_FROM_NUMBER")
    if not (sid and token and from_num):
        return  # Twilio not configured — admin copies the link manually

    try:
        from twilio.rest import Client
        body = (
            f"Hi {full_name}! {inviter_name} has invited you to join the CRM.\n"
            f"Click to create your account (valid 48h):\n{invite_url}"
        )
        Client(sid, token).messages.create(body=body, from_=from_num, to=to_phone)
    except Exception:
        pass  # Don't crash the request if SMS fails — link is still returned


def _placeholder_email(phone: str) -> str:
    """Generate a unique internal email so the DB unique constraint is satisfied."""
    digits = re.sub(r"\D", "", phone)
    return f"{digits}@wmb.internal"


@router.post("/", response_model=schemas.InviteOut)
def create_invite(
    data: schemas.InviteCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Admin creates a phone-based invite link and sends it via SMS."""
    allowed_roles = {"admin", "user", "technician", "sales"}
    if data.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(sorted(allowed_roles))}")
    # Check for active (unused, unexpired) invite for this phone
    existing = (
        db.query(models.Invite)
        .filter(
            models.Invite.phone == data.phone,
            models.Invite.used_at.is_(None),
            models.Invite.expires_at > datetime.utcnow(),
        )
        .first()
    )
    if existing:
        token = existing.token
        invite = existing
        # Update full_name/role in case admin changed them
        invite.full_name = data.full_name
        invite.role = data.role
        db.commit()
        db.refresh(invite)
    else:
        token = secrets.token_urlsafe(32)
        invite = models.Invite(
            phone=data.phone,
            full_name=data.full_name,
            role=data.role,
            token=token,
            created_by=current_user.id,
            expires_at=datetime.utcnow() + timedelta(hours=INVITE_EXPIRY_HOURS),
        )
        db.add(invite)
        db.commit()
        db.refresh(invite)

    base = os.getenv("PUBLIC_URL", "").rstrip("/")
    invite_url = f"{base}/invite/{token}" if base else f"/invite/{token}"

    inviter_name = current_user.full_name or current_user.username
    _send_invite_sms(data.phone, invite_url, inviter_name, data.full_name)

    return schemas.InviteOut(
        id=invite.id,
        phone=invite.phone,
        full_name=invite.full_name,
        role=invite.role,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        used_at=invite.used_at,
        invite_url=invite_url,
    )


@router.get("/", response_model=List[schemas.InviteOut])
def list_invites(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    invites = db.query(models.Invite).order_by(models.Invite.created_at.desc()).all()
    base = os.getenv("PUBLIC_URL", "").rstrip("/")
    result = []
    for inv in invites:
        result.append(schemas.InviteOut(
            id=inv.id,
            email=inv.email,
            phone=inv.phone,
            full_name=inv.full_name,
            role=inv.role,
            created_at=inv.created_at,
            expires_at=inv.expires_at,
            used_at=inv.used_at,
            invite_url=f"{base}/invite/{inv.token}" if base else f"/invite/{inv.token}",
        ))
    return result


@router.get("/check/{token}", response_model=schemas.InviteCheck)
def check_invite(request: Request, token: str, db: Session = Depends(get_db)):
    _invite_rate_check(request)
    """Public — validate an invite token (no auth required)."""
    invite = db.query(models.Invite).filter(models.Invite.token == token).first()
    if not invite or invite.used_at or invite.expires_at < datetime.utcnow():
        return schemas.InviteCheck(phone=None, full_name=None, role="user", valid=False)
    return schemas.InviteCheck(
        phone=invite.phone,
        full_name=invite.full_name,
        role=invite.role,
        valid=True,
    )


@router.post("/accept/{token}", response_model=schemas.User)
def accept_invite(request: Request, token: str, data: schemas.InviteAccept, db: Session = Depends(get_db)):
    """Public — register an account using a valid invite token (no auth required)."""
    _invite_rate_check(request)
    _invite_token_rate_check(token)
    invite = db.query(models.Invite).filter(models.Invite.token == token).first()
    if not invite or invite.used_at or invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invite link is invalid or has expired")

    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    # Auto-generate a unique placeholder email so the DB constraint is satisfied
    placeholder_email = _placeholder_email(invite.phone) if invite.phone else None
    if placeholder_email and db.query(models.User).filter(models.User.email == placeholder_email).first():
        placeholder_email = None  # leave email null if duplicate

    user = models.User(
        username=data.username,
        email=placeholder_email,
        phone=invite.phone,
        full_name=data.full_name or invite.full_name,
        role=invite.role,
        hashed_password=get_password_hash(data.password),
        is_active=True,
    )
    db.add(user)

    invite.used_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user
