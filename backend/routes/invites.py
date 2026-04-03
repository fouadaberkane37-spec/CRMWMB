import secrets
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
import models
import schemas
from auth import get_current_user, require_admin, get_password_hash

router = APIRouter(prefix="/api/invites", tags=["invites"])

INVITE_EXPIRY_HOURS = 48


def _send_invite_email(to_email: str, invite_url: str, inviter_name: str):
    """Send invite email via SMTP. Silently skips if SMTP not configured."""
    host = os.getenv("SMTP_HOST")
    if not host:
        return  # SMTP not configured — admin copies the link manually

    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", "")
    from_addr = os.getenv("SMTP_FROM", user)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"You've been invited to join the CRM"
    msg["From"] = from_addr
    msg["To"] = to_email

    text = (
        f"Hi,\n\n"
        f"{inviter_name} has invited you to join the CRM platform.\n\n"
        f"Click the link below to create your account (valid for {INVITE_EXPIRY_HOURS} hours):\n"
        f"{invite_url}\n\n"
        f"If you didn't expect this email, you can ignore it."
    )
    html = f"""
    <html><body style="font-family:sans-serif;color:#1e293b;max-width:480px;margin:auto;padding:32px">
      <h2 style="color:#6366f1">You've been invited!</h2>
      <p><strong>{inviter_name}</strong> has invited you to join the CRM platform.</p>
      <a href="{invite_url}" style="display:inline-block;margin:20px 0;padding:14px 28px;background:#6366f1;color:white;text-decoration:none;border-radius:10px;font-weight:bold">
        Accept Invitation
      </a>
      <p style="color:#94a3b8;font-size:12px">This link expires in {INVITE_EXPIRY_HOURS} hours.<br>
      If you didn't expect this, ignore this email.</p>
    </body></html>
    """

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.ehlo()
            if port != 25:
                smtp.starttls()
            if user and password:
                smtp.login(user, password)
            smtp.sendmail(from_addr, to_email, msg.as_string())
    except Exception:
        pass  # Don't crash the request if email fails — link is still returned


@router.post("/", response_model=schemas.InviteOut)
def create_invite(
    data: schemas.InviteCreate,
    request_base_url: str = "",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Admin creates an invite link for an email address."""
    # Check if there's already an active (unused, unexpired) invite for this email
    existing = (
        db.query(models.Invite)
        .filter(
            models.Invite.email == data.email,
            models.Invite.used_at.is_(None),
            models.Invite.expires_at > datetime.utcnow(),
        )
        .first()
    )
    if existing:
        # Re-use existing token
        token = existing.token
        invite = existing
    else:
        token = secrets.token_urlsafe(32)
        invite = models.Invite(
            email=data.email,
            token=token,
            role=data.role,
            created_by=current_user.id,
            expires_at=datetime.utcnow() + timedelta(hours=INVITE_EXPIRY_HOURS),
        )
        db.add(invite)
        db.commit()
        db.refresh(invite)

    # Build the invite URL — uses the Referer/Origin header forwarded via middleware
    # Falls back to Railway URL env var or relative path
    base = os.getenv("PUBLIC_URL", "").rstrip("/")
    invite_url = f"{base}/invite/{token}" if base else f"/invite/{token}"

    inviter_name = current_user.full_name or current_user.username
    _send_invite_email(data.email, invite_url, inviter_name)

    return schemas.InviteOut(
        id=invite.id,
        email=invite.email,
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
            role=inv.role,
            created_at=inv.created_at,
            expires_at=inv.expires_at,
            used_at=inv.used_at,
            invite_url=f"{base}/invite/{inv.token}" if base else f"/invite/{inv.token}",
        ))
    return result


@router.get("/check/{token}", response_model=schemas.InviteCheck)
def check_invite(token: str, db: Session = Depends(get_db)):
    """Public — validate an invite token (no auth required)."""
    invite = db.query(models.Invite).filter(models.Invite.token == token).first()
    if not invite or invite.used_at or invite.expires_at < datetime.utcnow():
        return schemas.InviteCheck(email="", role="user", valid=False)
    return schemas.InviteCheck(email=invite.email, role=invite.role, valid=True)


@router.post("/accept/{token}", response_model=schemas.User)
def accept_invite(token: str, data: schemas.InviteAccept, db: Session = Depends(get_db)):
    """Public — register an account using a valid invite token (no auth required)."""
    invite = db.query(models.Invite).filter(models.Invite.token == token).first()
    if not invite or invite.used_at or invite.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invite link is invalid or has expired")

    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(models.User).filter(models.User.email == invite.email).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = models.User(
        username=data.username,
        email=invite.email,
        full_name=data.full_name,
        role=invite.role,
        hashed_password=get_password_hash(data.password),
        is_active=True,
    )
    db.add(user)

    invite.used_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user
