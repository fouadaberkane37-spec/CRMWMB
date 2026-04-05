from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from database import get_db
import models

router = APIRouter(prefix="/api/twilio", tags=["twilio"])

TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'


def _digits(phone: str) -> str:
    """Strip all non-digit characters from a phone string."""
    return "".join(filter(str.isdigit, phone or ""))


def match_contact_by_phone(db: Session, from_number: str):
    """
    Find a Contact whose phone matches the inbound Twilio `From` number.
    Compares the last 9 digits to handle country-code variations
    (e.g. +15551234567 matches stored value '5551234567' or '(555) 123-4567').
    Returns the first match or None.
    """
    f_digits = _digits(from_number)
    if not f_digits:
        return None

    candidates = db.query(models.Contact).filter(models.Contact.phone.isnot(None)).all()
    for c in candidates:
        c_digits = _digits(c.phone)
        if not c_digits:
            continue
        # Match on full digit string or last-9 suffix
        if c_digits == f_digits:
            return c
        if len(f_digits) >= 9 and len(c_digits) >= 9:
            if c_digits.endswith(f_digits[-9:]) or f_digits.endswith(c_digits[-9:]):
                return c
    return None


def save_inbound_message(db: Session, contact: models.Contact, body: str):
    """Persist an inbound SMS as a ChatMessage."""
    msg = models.ChatMessage(
        contact_id=contact.id,
        sender_id=None,       # no CRM user — message came from the customer
        body=body,
        direction="inbound",
    )
    db.add(msg)
    db.commit()
    return msg


@router.post(
    "/incoming",
    include_in_schema=False,
    response_class=PlainTextResponse,
    summary="Twilio inbound SMS webhook",
)
async def twilio_incoming(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Public endpoint — no authentication required (Twilio calls this).

    Set your Twilio phone number's Messaging webhook to:
        POST  https://crmwmb-production.up.railway.app/api/twilio/incoming

    Twilio posts application/x-www-form-urlencoded with at minimum:
        From  — sender's E.164 phone number  (+15551234567)
        To    — your Twilio number
        Body  — SMS text content
    """
    form = await request.form()
    from_number: str = (form.get("From") or "").strip()
    body: str = (form.get("Body") or "").strip()

    if from_number and body:
        contact = match_contact_by_phone(db, from_number)
        if contact:
            save_inbound_message(db, contact, body)
        # If no matching contact, we silently discard — unknown senders don't
        # create phantom records.  Log here if you want visibility.

    # Always return valid TwiML so Twilio doesn't retry
    return PlainTextResponse(TWIML_EMPTY, media_type="application/xml")
