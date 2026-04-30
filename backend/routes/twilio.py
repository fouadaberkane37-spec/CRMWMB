import logging
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from database import get_db
import models
import os
from auth import get_current_user
from pydantic import BaseModel as _BaseModel, Field as _Field
from datetime import datetime

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/twilio", tags=["twilio"])

TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'


def _notify_admin(contact_label: str, message_body: str):
    """Send a notification SMS to the admin's personal number."""
    notify_to = (os.getenv("NOTIFY_PHONE") or os.getenv("CALL_FORWARD_TO", "")).strip()
    sid       = os.getenv("TWILIO_ACCOUNT_SID")
    token     = os.getenv("TWILIO_AUTH_TOKEN")
    from_num  = os.getenv("TWILIO_FROM_NUMBER")
    if not (notify_to and sid and token and from_num):
        return
    try:
        from twilio.rest import Client
        text = f"💬 {contact_label}: {message_body}"
        Client(sid, token).messages.create(body=text[:320], from_=from_num, to=notify_to)
    except Exception:
        pass


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


def upsert_inbound_lead(db: Session, phone: str, body: str, source: str = "sms"):
    """Create or update an InboundLead for an unknown caller/texter."""
    try:
        lead = db.query(models.InboundLead).filter(models.InboundLead.phone == phone).first()
        if lead:
            lead.last_body = body
            lead.source = source
            lead.count = (lead.count or 0) + 1
            lead.updated_at = datetime.utcnow()
        else:
            lead = models.InboundLead(phone=phone, last_body=body, source=source)
            db.add(lead)
        db.commit()
    except Exception:
        db.rollback()


def save_inbound_message(db: Session, contact: models.Contact, body: str):
    """Persist an inbound SMS as a ChatMessage."""
    msg = models.ChatMessage(
        contact_id=contact.id,
        sender_id=None,       # no CRM user — message came from the customer
        body=body,
        direction="inbound",
        is_read=False,
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
            label = f"{contact.first_name} {contact.last_name or ''}".strip()
        else:
            upsert_inbound_lead(db, from_number, body, source="sms")
            label = from_number
        _notify_admin(label, body)

    # Always return valid TwiML so Twilio doesn't retry
    return PlainTextResponse(TWIML_EMPTY, media_type="application/xml")


# ── Outbound click-to-call ────────────────────────────────────────────────────

class CallRequest(_BaseModel):
    contact_id: int


class CallNumberRequest(_BaseModel):
    phone: str = _Field(..., min_length=7, max_length=20)


@router.post("/call-number")
def call_number_direct(
    payload: CallNumberRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    """Call an arbitrary phone number (e.g. an unknown lead) via Twilio."""
    import re
    from twilio.rest import Client

    if current_user.role not in ("admin", "ceo"):
        raise HTTPException(status_code=403, detail="Admin only")
    if not re.match(r"^\+?[1-9]\d{6,14}$", payload.phone.replace(" ", "").replace("-", "")):
        raise HTTPException(status_code=400, detail="Invalid phone number format")
    if not payload.phone:
        raise HTTPException(status_code=400, detail="Phone number required")

    sid      = os.getenv("TWILIO_ACCOUNT_SID")
    token    = os.getenv("TWILIO_AUTH_TOKEN")
    from_num = os.getenv("TWILIO_FROM_NUMBER")
    my_phone = os.getenv("CALL_FORWARD_TO", "").strip()

    if not sid or not token or not from_num:
        raise HTTPException(status_code=500, detail="Twilio not configured")
    if not my_phone:
        raise HTTPException(status_code=500, detail="CALL_FORWARD_TO not configured")

    base_url    = os.getenv("APP_URL", "https://crmwmb-production.up.railway.app")
    connect_url = f"{base_url}/api/twilio/connect?to={payload.phone}&from_num={from_num}"

    client = Client(sid, token)
    call   = client.calls.create(to=my_phone, from_=from_num, url=connect_url)
    return {"call_sid": call.sid, "status": call.status}


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
    my_phone   = os.getenv("CALL_FORWARD_TO", "").strip()

    if not sid or not token or not from_num:
        raise HTTPException(status_code=500, detail="Twilio not configured")
    if not my_phone:
        raise HTTPException(status_code=500, detail="CALL_FORWARD_TO not configured")

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


@router.post("/test-notify")
def test_notify(
    current_user=Depends(get_current_user),
):
    """Admin: send a test SMS notification to CALL_FORWARD_TO / NOTIFY_PHONE."""
    if current_user.role not in ("admin", "ceo"):
        raise HTTPException(status_code=403, detail="Admin only")

    sid       = os.getenv("TWILIO_ACCOUNT_SID")
    token     = os.getenv("TWILIO_AUTH_TOKEN")
    from_num  = os.getenv("TWILIO_FROM_NUMBER")
    notify_to = (os.getenv("NOTIFY_PHONE") or os.getenv("CALL_FORWARD_TO", "")).strip()

    # Return diagnostic info regardless
    debug = {
        "TWILIO_ACCOUNT_SID":  "set" if sid   else "MISSING",
        "TWILIO_AUTH_TOKEN":   "set" if token  else "MISSING",
        "TWILIO_FROM_NUMBER":  from_num  or "MISSING",
        "notify_to":           notify_to or "MISSING",
    }

    if not (sid and token and from_num and notify_to):
        return {"sent": False, "debug": debug, "error": "One or more env vars missing"}

    try:
        from twilio.rest import Client
        msg = Client(sid, token).messages.create(
            body="✅ CRM test notification — it's working!",
            from_=from_num,
            to=notify_to,
        )
        return {"sent": True, "debug": debug, "sid": msg.sid, "status": msg.status}
    except Exception as e:
        return {"sent": False, "debug": debug, "error": str(e)}


@router.get("/config-check")
def config_check(current_user=Depends(get_current_user)):
    """Admin: verify all Twilio env vars are present and show their values (masked)."""
    if current_user.role not in ("admin", "ceo"):
        raise HTTPException(status_code=403, detail="Admin only")
    sid       = os.getenv("TWILIO_ACCOUNT_SID", "")
    token     = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_num  = os.getenv("TWILIO_FROM_NUMBER", "")
    forward   = os.getenv("CALL_FORWARD_TO", "")
    app_url   = os.getenv("APP_URL", "")
    return {
        "TWILIO_ACCOUNT_SID":  f"{sid[:6]}…" if sid   else "MISSING ❌",
        "TWILIO_AUTH_TOKEN":   "set ✅"       if token  else "MISSING ❌",
        "TWILIO_FROM_NUMBER":  from_num       or "MISSING ❌",
        "CALL_FORWARD_TO":     forward        or "MISSING ❌",
        "APP_URL":             app_url        or "MISSING ❌",
        "voice_webhook_should_be": f"{app_url}/api/twilio/voice" if app_url else "unknown",
        "sms_webhook_should_be":   f"{app_url}/api/twilio/incoming" if app_url else "unknown",
    }


@router.get("/unknown-leads")
def list_unknown_leads(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """All inbound contacts not matched to a CRM contact. Admin only."""
    if current_user.role not in ("admin", "ceo"):
        raise HTTPException(status_code=403, detail="Admin only")
    leads = db.query(models.InboundLead).order_by(models.InboundLead.updated_at.desc()).all()
    return [
        {
            "id": l.id,
            "phone": l.phone,
            "last_body": l.last_body,
            "source": l.source,
            "count": l.count,
            "created_at": l.created_at.isoformat() if l.created_at else None,
            "updated_at": l.updated_at.isoformat() if l.updated_at else None,
        }
        for l in leads
    ]


class ConvertLeadPayload(_BaseModel):
    first_name: str
    last_name: str = ""


@router.post("/unknown-leads/{lead_id}/convert")
def convert_lead_to_contact(
    lead_id: int,
    payload: ConvertLeadPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Convert an unknown inbound lead into a Contact and remove the lead."""
    if current_user.role not in ("admin", "ceo"):
        raise HTTPException(status_code=403, detail="Admin only")
    lead = db.query(models.InboundLead).filter(models.InboundLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    contact = models.Contact(
        first_name=payload.first_name,
        last_name=payload.last_name or None,
        phone=lead.phone,
        status="lead",
        created_by=current_user.id,
    )
    db.add(contact)
    db.flush()
    db.delete(lead)
    db.commit()
    return {"contact_id": contact.id}


@router.delete("/unknown-leads/{lead_id}")
def dismiss_unknown_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Permanently dismiss an unknown lead without converting."""
    if current_user.role not in ("admin", "ceo"):
        raise HTTPException(status_code=403, detail="Admin only")
    lead = db.query(models.InboundLead).filter(models.InboundLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    db.delete(lead)
    db.commit()
    return {"message": "Dismissed"}





@router.get("/connect", include_in_schema=False, response_class=PlainTextResponse)
async def connect_call(to: str, from_num: str = ""):
    """
    TwiML fetched by Twilio when admin answers — dials the contact.
    Contact sees the Twilio number as caller ID.
    """
    to_clean = to.replace(" ", "").replace("-", "")
    from_clean = from_num.replace(" ", "").replace("-", "")
    if not _E164_RE.match(to_clean):
        return PlainTextResponse(TWIML_EMPTY, media_type="application/xml")
    safe_to = to_clean
    safe_from = from_clean if _E164_RE.match(from_clean) else ""
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response>"
        f'<Dial callerId="{safe_from}">{safe_to}</Dial>'
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
    form = await request.form()

    forward_to = os.getenv("CALL_FORWARD_TO", "").strip()
    from_number: str = (form.get("From") or "").strip()
    twilio_number: str = (form.get("To") or "").strip()

    log.info("[voice] inbound call From=%s To=%s forward_to=%s", from_number, twilio_number, forward_to or "NOT SET")

    if not forward_to:
        log.error("[voice] CALL_FORWARD_TO is not set — hanging up")
        twiml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            "<Response><Say>This number is not configured for calls.</Say></Response>"
        )
        return PlainTextResponse(twiml, media_type="application/xml")

    # Try to match caller to a contact
    contact = match_contact_by_phone(db, from_number) if from_number else None

    # Log the call
    if contact:
        try:
            save_inbound_message(db, contact, f"📞 Incoming call from {from_number}")
        except Exception:
            pass
    elif from_number:
        upsert_inbound_lead(db, from_number, "📞 Incoming call", source="call")

    # Announce caller name if known
    if contact:
        caller_name = f"{contact.first_name} {contact.last_name or ''}".strip()
        announcement = f"<Say>Call from {caller_name}</Say>"
    else:
        announcement = ""

    # Use the Twilio number as callerId — using the raw caller number as callerId
    # fails unless it is verified in your Twilio account.
    caller_id = twilio_number or os.getenv("TWILIO_FROM_NUMBER", "")

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response>"
        f"{announcement}"
        f'<Dial callerId="{caller_id}" timeout="30">{forward_to}</Dial>'
        f"</Response>"
    )
    log.info("[voice] responding with Dial to %s callerId=%s", forward_to, caller_id)
    return PlainTextResponse(twiml, media_type="application/xml")
