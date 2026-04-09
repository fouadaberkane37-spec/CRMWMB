from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from database import get_db
import models
import os

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


# ── Outbound click-to-call ────────────────────────────────────────────────────

class CallRequest(BaseModel):
    contact_id: int


@router.post("/call")
def initiate_call(
    payload: CallRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Initiates an outbound call:
      1. Twilio calls YOUR phone (CALL_FORWARD_TO)
      2. When you pick up, Twilio dials the contact
      3. Contact sees Twilio number as caller ID
    """
    from twilio.rest import Client
    from pydantic import BaseModel as _BM

    contact = db.query(models.Contact).filter(models.Contact.id == payload.contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if not contact.phone:
        raise HTTPException(status_code=400, detail="Contact has no phone number")

    sid        = os.getenv("TWILIO_ACCOUNT_SID")
    token      = os.getenv("TWILIO_AUTH_TOKEN")
    from_num   = os.getenv("TWILIO_FROM_NUMBER")
    my_phone   = os.getenv("CALL_FORWARD_TO", "+15145597007")

    if not sid or not token or not from_num:
        raise HTTPException(status_code=500, detail="Twilio not configured")

    # Build the connect URL — Twilio fetches this when Fouad picks up
    base_url = os.getenv("APP_URL", "https://crmwmb-production.up.railway.app")
    connect_url = f"{base_url}/api/twilio/connect?to={contact.phone}&from_num={from_num}"

    client = Client(sid, token)
    call = client.calls.create(
        to=my_phone,
        from_=from_num,
        url=connect_url,
    )

    # Log call in contact chat history
    try:
        msg = models.ChatMessage(
            contact_id=contact.id,
            sender_id=current_user.id,
            body=f"📞 Outbound call initiated to {contact.phone}",
            direction="outbound",
        )
        db.add(msg)
        db.commit()
    except Exception:
        pass

    return {"call_sid": call.sid, "status": call.status}


@router.get("/connect", include_in_schema=False, response_class=PlainTextResponse)
async def connect_call(to: str, from_num: str = ""):
    """
    TwiML fetched by Twilio when Fouad answers — dials the contact.
    Contact sees the Twilio number as caller ID.
    """
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response>"
        f'<Dial callerId="{from_num}">{to}</Dial>'
        f"</Response>"
    )
    return PlainTextResponse(twiml, media_type="application/xml")


@router.post(
    "/voice",
    include_in_schema=False,
    response_class=PlainTextResponse,
    summary="Twilio inbound voice call webhook",
)
async def twilio_voice(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Forwards inbound calls to CALL_FORWARD_TO env var (your personal number).
    Announces the caller's name if they're in the CRM.
    Logs the call as a chat message on the matching contact.

    Set your Twilio phone number's Voice webhook to:
        POST  https://crmwmb-production.up.railway.app/api/twilio/voice
    """
    forward_to = os.getenv("CALL_FORWARD_TO", "+15145597007").strip()
    if not forward_to:
        # No forward number configured — play a message and hang up
        twiml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<Response><Say>This number is not configured for calls.</Say></Response>"
        )
        return PlainTextResponse(twiml, media_type="application/xml")

    form = await request.form()
    from_number: str = (form.get("From") or "").strip()
    twilio_number: str = (form.get("To") or "").strip()

    # Try to match caller to a contact
    contact = match_contact_by_phone(db, from_number) if from_number else None

    # Log the call as an inbound chat message
    if contact:
        try:
            save_inbound_message(db, contact, f"📞 Incoming call from {from_number}")
        except Exception:
            pass

    # Build caller announcement
    if contact:
        caller_name = f"{contact.first_name} {contact.last_name or ''}".strip()
        announcement = f"<Say>Call from {caller_name}</Say>"
    else:
        announcement = ""

    # Forward the call — callerId shows original caller's number on your phone
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response>"
        f"{announcement}"
        f'<Dial callerId="{from_number or twilio_number}">{forward_to}</Dial>'
        f"</Response>"
    )
    return PlainTextResponse(twiml, media_type="application/xml")
