from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/chats", tags=["chats"])

# Chat messages are stored as Activity rows with type='chat'.
# No new table required — works with the existing database.


def _to_msg_out(activity: models.Activity, sender_name: str) -> schemas.ChatMessageOut:
    return schemas.ChatMessageOut(
        id=activity.id,
        contact_id=activity.contact_id,
        sender_id=activity.created_by,
        sender_name=sender_name,
        body=activity.title,
        created_at=activity.created_at,
    )


@router.get("/", response_model=List[schemas.ChatConversation])
def list_conversations(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """One entry per contact that has at least one chat message."""
    # Find all contacts that have chat activities
    rows = (
        db.query(models.Activity)
        .filter(models.Activity.type == "chat", models.Activity.contact_id.isnot(None))
        .order_by(desc(models.Activity.created_at))
        .all()
    )

    seen = {}
    for row in rows:
        if row.contact_id not in seen:
            seen[row.contact_id] = row

    result = []
    for contact_id, last_row in seen.items():
        contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
        if not contact:
            continue
        result.append(schemas.ChatConversation(
            contact_id=contact.id,
            contact_name=f"{contact.first_name} {contact.last_name or ''}".strip(),
            last_message=last_row.title,
            last_at=last_row.created_at,
        ))
    return result


@router.get("/{contact_id}", response_model=List[schemas.ChatMessageOut])
def get_messages(contact_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    rows = (
        db.query(models.Activity)
        .filter(models.Activity.type == "chat", models.Activity.contact_id == contact_id)
        .order_by(models.Activity.created_at.asc())
        .all()
    )

    out = []
    for row in rows:
        sender = db.query(models.User).filter(models.User.id == row.created_by).first()
        name = (sender.full_name or sender.username) if sender else "Unknown"
        out.append(_to_msg_out(row, name))
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

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    activity = models.Activity(
        type="chat",
        title=body,
        contact_id=contact_id,
        created_by=current_user.id,
        completed=True,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)

    sender_name = current_user.full_name or current_user.username
    return _to_msg_out(activity, sender_name)
