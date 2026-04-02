from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/chats", tags=["chats"])


@router.get("/", response_model=List[schemas.ChatConversation])
def list_conversations(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
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
    _=Depends(get_current_user),
):
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
        sender = db.query(models.User).filter(models.User.id == m.sender_id).first()
        result.append(schemas.ChatMessageOut(
            id=m.id,
            contact_id=m.contact_id,
            sender_id=m.sender_id,
            sender_name=(sender.full_name or sender.username) if sender else "Unknown",
            body=m.body,
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
    if not db.query(models.Contact).filter(models.Contact.id == contact_id).first():
        raise HTTPException(status_code=404, detail="Contact not found")

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="Message body is empty")

    msg = models.ChatMessage(
        contact_id=contact_id,
        sender_id=current_user.id,
        body=body,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return schemas.ChatMessageOut(
        id=msg.id,
        contact_id=msg.contact_id,
        sender_id=msg.sender_id,
        sender_name=current_user.full_name or current_user.username,
        body=msg.body,
        created_at=msg.created_at,
    )
