from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import get_current_user
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
        msg = client.messages.create(
            body=payload.message,
            from_=from_number,
            to=contact.phone,
        )
        return {"sid": msg.sid, "status": msg.status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/webhook", include_in_schema=False, response_class=PlainTextResponse)
async def twilio_inbound_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Twilio webhook for inbound SMS.
    Configure your Twilio number's Messaging webhook URL to:
        https://crmwmb-production.up.railway.app/api/sms/webhook
    (HTTP POST, application/x-www-form-urlencoded)
    """
    form = await request.form()
    from_number: str = (form.get("From") or "").strip()
    body: str = (form.get("Body") or "").strip()

    if from_number and body:
        # Normalize phone: Twilio sends e.g. +15551234567
        # Try to match contact by phone (exact or suffix match)
        contacts = db.query(models.Contact).all()
        contact = None
        for c in contacts:
            if c.phone:
                # Strip non-digit chars for comparison
                c_digits = "".join(filter(str.isdigit, c.phone))
                f_digits = "".join(filter(str.isdigit, from_number))
                if c_digits and f_digits and (c_digits == f_digits or c_digits.endswith(f_digits[-9:]) or f_digits.endswith(c_digits[-9:])):
                    contact = c
                    break

        if contact:
            msg = models.ChatMessage(
                contact_id=contact.id,
                sender_id=None,       # inbound — no CRM user
                body=body,
                direction="inbound",
            )
            db.add(msg)
            db.commit()

    # Return empty TwiML — no auto-reply
    return PlainTextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', media_type="application/xml")
