"""
Segment-based SMS campaigns.

POST /api/campaigns/sms — send a templated SMS to every contact carrying a given
tag (e.g. "Saguenay"). Skips contacts with no phone and anyone who has opted out
(STOP/ARRET). Supports a {name} / {first_name} placeholder (first name only).

Sends run in the background with a delay between each message to avoid carrier
filtering. `dry_run` (default TRUE) returns a preview without sending anything —
so this endpoint is safe to call for inspection.
"""
import os
import time
import logging
from typing import Optional

from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
import models
from auth import require_admin
from routes.contacts import _tag_filter

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


class SMSCampaign(BaseModel):
    tag: str = Field(..., min_length=1, max_length=64)
    message: str = Field(..., min_length=1, max_length=1600)  # {name}/{first_name} placeholder
    dry_run: bool = True                 # default safe: preview only, send nothing
    delay_seconds: float = Field(default=1.5, ge=1.0, le=5.0)


def _render(template: str, contact: models.Contact) -> str:
    name = (contact.first_name or "").strip() or "there"
    return template.replace("{name}", name).replace("{first_name}", name)


def _eligible_contacts(db: Session, tag: str):
    """Contacts with the tag that are reachable by SMS: not trashed, have a phone,
    and have not opted out."""
    return (
        db.query(models.Contact)
        .filter(models.Contact.deleted_at.is_(None))
        .filter(_tag_filter(tag))
        .filter(models.Contact.phone.isnot(None), models.Contact.phone != "")
        .filter((models.Contact.sms_opt_out.is_(False)) | (models.Contact.sms_opt_out.is_(None)))
        .all()
    )


def _send_campaign(campaign_tag: str, template: str, contact_ids: list, delay: float, sender_id: Optional[int]):
    """Background worker — sends one SMS per contact with a delay between each."""
    from_number = os.getenv("TWILIO_FROM_NUMBER")
    sid, token = os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN")
    if not (from_number and sid and token):
        log.error("[campaign] Twilio not configured — aborting send for tag=%s", campaign_tag)
        return

    from twilio.rest import Client
    client = Client(sid, token)
    db = SessionLocal()
    sent = failed = 0
    try:
        for cid in contact_ids:
            contact = db.query(models.Contact).filter(models.Contact.id == cid).first()
            # Re-check opt-out at send time (someone may have texted STOP mid-campaign)
            if not contact or not contact.phone or contact.sms_opt_out:
                continue
            body = _render(template, contact)
            try:
                client.messages.create(body=body, from_=from_number, to=contact.phone)
                db.add(models.ChatMessage(
                    contact_id=contact.id, sender_id=sender_id,
                    body=body, direction="outbound",
                ))
                db.commit()
                sent += 1
            except Exception as e:
                failed += 1
                log.warning("[campaign] send failed for contact %s: %s", cid, e)
            time.sleep(delay)
        log.info("[campaign] tag=%s done — sent=%d failed=%d", campaign_tag, sent, failed)
    finally:
        db.close()


@router.post("/sms")
def send_sms_campaign(
    payload: SMSCampaign,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Queue a templated SMS blast to a tagged segment. Defaults to dry_run=true
    (preview only). Set dry_run=false to actually queue the sends."""
    contacts = _eligible_contacts(db, payload.tag)

    # Counts for transparency
    total_tagged = db.query(models.Contact).filter(
        models.Contact.deleted_at.is_(None)
    ).filter(_tag_filter(payload.tag)).count()
    opted_out = db.query(models.Contact).filter(
        models.Contact.deleted_at.is_(None)
    ).filter(_tag_filter(payload.tag)).filter(models.Contact.sms_opt_out.is_(True)).count()

    eligible = len(contacts)
    preview = [
        {"contact_id": c.id, "phone": c.phone, "message": _render(payload.message, c)}
        for c in contacts[:5]
    ]

    if payload.dry_run:
        return {
            "dry_run": True,
            "tag": payload.tag,
            "tagged_total": total_tagged,
            "eligible": eligible,
            "opted_out": opted_out,
            "no_phone": total_tagged - eligible - opted_out,
            "preview": preview,
            "note": "No SMS sent. Re-POST with dry_run=false to queue the send.",
        }

    background.add_task(
        _send_campaign,
        payload.tag, payload.message, [c.id for c in contacts],
        payload.delay_seconds, None,
    )
    return {
        "dry_run": False,
        "tag": payload.tag,
        "queued": eligible,
        "opted_out": opted_out,
        "delay_seconds": payload.delay_seconds,
        "preview": preview,
    }
