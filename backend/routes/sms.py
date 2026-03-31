from fastapi import APIRouter, Depends, HTTPException
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
