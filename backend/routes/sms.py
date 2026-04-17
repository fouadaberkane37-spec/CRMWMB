from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import get_current_user
from routes.twilio import match_contact_by_phone, save_inbound_message, TWIML_EMPTY
import os

router = APIRouter(prefix="/api/sms", tags=["sms"])


def _twilio_client():
    from twilio.rest import Client
    sid   = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    if not sid or not token:
        raise HTTPException(status_code=500, detail="Twilio is not configured on the server")
    return Client(sid, token)


class SMSPayload(BaseModel):
    contact_id: int
    message: str


@router.post("/send")
def send_sms(
    payload: SMSPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    contact = db.query(models.Contact).filter(models.Contact.id == payload.contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if not contact.phone:
        raise HTTPException(status_code=400, detail="This contact has no phone number")

    from_number = os.getenv("TWILIO_FROM_NUMBER")
    if not from_number:
        raise HTTPException(status_code=500, detail="TWILIO_FROM_NUMBER not configured")

    client = _twilio_client()
    try:
        twilio_msg = client.messages.create(
            body=payload.message,
            from_=from_number,
            to=contact.phone,
        )
    except Exception:
        raise HTTPException(status_code=500, detail="SMS delivery failed. Please try again.")

    # Save to chat log so the conversation thread stays in sync
    db.add(models.ChatMessage(
        contact_id=contact.id,
        sender_id=current_user.id,
        body=payload.message,
        direction="outbound",
    ))
    db.commit()

    return {"sid": twilio_msg.sid, "status": twilio_msg.status}


@router.post("/webhook", include_in_schema=False, response_class=PlainTextResponse)
async def twilio_webhook_legacy(
    request: Request,
    db: Session = Depends(get_db),
):
    """Legacy alias kept for backwards-compatibility.
    Prefer /api/twilio/incoming for new Twilio webhook configurations.
    """
    form = await request.form()
    from_number: str = (form.get("From") or "").strip()
    body: str = (form.get("Body") or "").strip()

    if from_number and body:
        contact = match_contact_by_phone(db, from_number)
        if contact:
            save_inbound_message(db, contact, body)

    return PlainTextResponse(TWIML_EMPTY, media_type="application/xml")
