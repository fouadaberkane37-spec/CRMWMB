from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
import os
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/chats", tags=["chats"])


def _require_admin(user):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/", response_model=List[schemas.ChatConversation])
def list_conversations(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(current_user)
    """Return the most recent message per contact, sorted newest first."""
    msgs = (
        db.query(models.ChatMessage)
        .order_by(desc(models.ChatMessage.created_at))
        .all()
    )

    seen: dict[int, models.ChatMessage] = {}
    for m in msgs:
        if m.contact_id not in seen:
            seen[m.contact_id] = m

    result = []
    for contact_id, last in seen.items():
        contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
        if not contact:
            continue
        result.append(schemas.ChatConversation(
            contact_id=contact.id,
            contact_name=f"{contact.first_name} {contact.last_name or ''}".strip(),
            last_message=last.body,
            last_at=last.created_at,
        ))
    return result


@router.get("/{contact_id}", response_model=List[schemas.ChatMessageOut])
def get_messages(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(current_user)
    if not db.query(models.Contact).filter(models.Contact.id == contact_id).first():
        raise HTTPException(status_code=404, detail="Contact not found")

    msgs = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.contact_id == contact_id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )

    result = []
    for m in msgs:
        if m.sender_id:
            sender = db.query(models.User).filter(models.User.id == m.sender_id).first()
            sender_name = (sender.full_name or sender.username) if sender else "Unknown"
        else:
            # Inbound message from the contact/customer
            contact = db.query(models.Contact).filter(models.Contact.id == m.contact_id).first()
            sender_name = f"{contact.first_name} {contact.last_name or ''}".strip() if contact else "Customer"
        result.append(schemas.ChatMessageOut(
            id=m.id,
            contact_id=m.contact_id,
            sender_id=m.sender_id,
            sender_name=sender_name,
            body=m.body,
            direction=m.direction,
            created_at=m.created_at,
        ))
    return result


@router.post("/{contact_id}", response_model=schemas.ChatMessageOut)
def send_message(
    contact_id: int,
    payload: schemas.ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _require_admin(current_user)
    contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="Message body is empty")

    msg = models.ChatMessage(
        contact_id=contact_id,
        sender_id=current_user.id,
        body=body,
        direction="outbound",
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # Fire Twilio SMS if the contact has a phone — graceful: never blocks the save
    if contact.phone:
        _try_send_twilio(contact.phone, body)

    return schemas.ChatMessageOut(
        id=msg.id,
        contact_id=msg.contact_id,
        sender_id=msg.sender_id,
        sender_name=current_user.full_name or current_user.username,
        body=msg.body,
        direction=msg.direction,
        created_at=msg.created_at,
    )


def _try_send_twilio(to_phone: str, body: str):
    """Best-effort Twilio SMS delivery. Silently skips if not configured."""
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_FROM_NUMBER")
    if not (sid and token and from_number):
        return
    try:
        from twilio.rest import Client
        Client(sid, token).messages.create(body=body, from_=from_number, to=to_phone)
    except Exception:
        pass  # SMS failure must never prevent the chat message from being saved
