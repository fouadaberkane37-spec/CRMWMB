from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc
from typing import List
from database import get_db
import models
import schemas
from auth import get_current_user
import os

router = APIRouter(prefix="/api/chats", tags=["chats"])

OWN_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "+10000000000")


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), _=Depends(get_current_user)):
    count = db.query(func.count(models.ChatMessage.id)).filter(
        models.ChatMessage.direction == "inbound",
        models.ChatMessage.is_read == False,
    ).scalar()
    return {"unread": count}


@router.get("/conversations", response_model=List[schemas.ConversationSummary])
def list_conversations(db: Session = Depends(get_db), _=Depends(get_current_user)):
    # Get latest message per phone number
    subq = (
        db.query(
            func.max(models.ChatMessage.id).label("max_id"),
        )
        .group_by(
            func.coalesce(
                models.ChatMessage.from_number,
                models.ChatMessage.to_number,
            )
        )
        .subquery()
    )

    # Use a raw aggregation approach for SQLite compatibility
    rows = db.query(models.ChatMessage).options(joinedload(models.ChatMessage.contact)).all()

    # Group by conversation partner (the non-own-number side)
    convos: dict = {}
    for msg in rows:
        partner = msg.from_number if msg.direction == "inbound" else msg.to_number
        if partner not in convos:
            convos[partner] = {
                "phone_number": partner,
                "last_message": msg.body,
                "last_message_at": msg.created_at,
                "unread_count": 0,
                "contact_id": msg.contact_id,
                "contact_name": None,
            }
            if msg.contact:
                convos[partner]["contact_name"] = f"{msg.contact.first_name} {msg.contact.last_name or ''}".strip()
        else:
            if msg.created_at > convos[partner]["last_message_at"]:
                convos[partner]["last_message"] = msg.body
                convos[partner]["last_message_at"] = msg.created_at
        if msg.direction == "inbound" and not msg.is_read:
            convos[partner]["unread_count"] += 1

    result = sorted(convos.values(), key=lambda x: x["last_message_at"], reverse=True)
    return result


@router.get("/{phone_number}", response_model=List[schemas.ChatMessageOut])
def get_conversation(
    phone_number: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    msgs = (
        db.query(models.ChatMessage)
        .options(joinedload(models.ChatMessage.contact))
        .filter(
            (models.ChatMessage.from_number == phone_number) |
            (models.ChatMessage.to_number == phone_number)
        )
        .order_by(models.ChatMessage.created_at.asc())
        .all()
    )
    # Mark inbound messages as read
    for msg in msgs:
        if msg.direction == "inbound" and not msg.is_read:
            msg.is_read = True
    db.commit()
    return msgs


@router.post("/{phone_number}/send", response_model=schemas.ChatMessageOut)
def send_message(
    phone_number: str,
    payload: schemas.ChatSend,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    msg = models.ChatMessage(
        direction="outbound",
        from_number=OWN_NUMBER,
        to_number=phone_number,
        body=payload.body,
        is_read=True,
        contact_id=payload.contact_id,
        sent_by=current_user.id,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


@router.post("/webhook/inbound")
async def inbound_sms(request: Request, db: Session = Depends(get_db)):
    """Twilio webhook for inbound SMS."""
    form = await request.form()
    from_number = form.get("From", "")
    to_number = form.get("To", OWN_NUMBER)
    body = form.get("Body", "")

    if not from_number or not body:
        raise HTTPException(status_code=400, detail="Missing From or Body")

    # Try to find existing contact by phone
    contact = db.query(models.Contact).filter(models.Contact.phone == from_number).first()

    msg = models.ChatMessage(
        direction="inbound",
        from_number=from_number,
        to_number=to_number,
        body=body,
        is_read=False,
        contact_id=contact.id if contact else None,
    )
    db.add(msg)
    db.commit()
    # Return empty TwiML response
    return {"status": "received"}
