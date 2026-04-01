from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/chats", tags=["chats"])


@router.get("/", response_model=List[schemas.ChatConversation])
def list_conversations(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Return one entry per contact that has at least one message, sorted by most recent."""
    # Subquery: last message per contact
    last_msg_sub = (
        db.query(
            models.ChatMessage.contact_id,
            func.max(models.ChatMessage.created_at).label("last_at"),
        )
        .group_by(models.ChatMessage.contact_id)
        .subquery()
    )

    rows = (
        db.query(models.Contact, last_msg_sub.c.last_at)
        .join(last_msg_sub, models.Contact.id == last_msg_sub.c.contact_id)
        .order_by(desc(last_msg_sub.c.last_at))
        .all()
    )

    result = []
    for contact, last_at in rows:
        last_msg = (
            db.query(models.ChatMessage)
            .filter(models.ChatMessage.contact_id == contact.id)
            .order_by(desc(models.ChatMessage.created_at))
            .first()
        )
        result.append(schemas.ChatConversation(
            contact_id=contact.id,
            contact_name=f"{contact.first_name} {contact.last_name or ''}".strip(),
            last_message=last_msg.body if last_msg else None,
            last_at=last_at,
        ))
    return result


@router.get("/{contact_id}", response_model=List[schemas.ChatMessageOut])
def get_messages(contact_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    msgs = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.contact_id == contact_id)
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )

    out = []
    for m in msgs:
        sender = db.query(models.User).filter(models.User.id == m.sender_id).first()
        out.append(schemas.ChatMessageOut(
            id=m.id,
            contact_id=m.contact_id,
            sender_id=m.sender_id,
            sender_name=sender.full_name or sender.username if sender else "Unknown",
            body=m.body,
            created_at=m.created_at,
        ))
    return out


@router.post("/{contact_id}", response_model=schemas.ChatMessageOut)
def send_message(
    contact_id: int,
    payload: schemas.ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    msg = models.ChatMessage(
        contact_id=contact_id,
        sender_id=current_user.id,
        body=payload.body.strip(),
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
