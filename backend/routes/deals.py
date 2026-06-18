from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from sqlalchemy import exists
from typing import List, Optional
import os
import logging
from database import get_db
import models
import schemas
from auth import get_current_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/deals", tags=["deals"])


def _enrich(deal: models.Deal, db: Session) -> dict:
    """Return a deal dict with assigned_techs list."""
    import logging as _log
    rows = db.query(models.DealTechnician).filter(
        models.DealTechnician.deal_id == deal.id
    ).all()
    techs = []
    for r in rows:
        if r.user:
            techs.append({"id": r.user.id, "username": r.user.username, "full_name": r.user.full_name})
        else:
            _log.warning("Ghost DealTechnician row id=%s deal_id=%s — user deleted", r.id, deal.id)
    d = schemas.Deal.model_validate(deal).model_dump()
    d["assigned_techs"] = techs
    return d

STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"]


def _own_deal(deal, user):
    """All non-technician users can view and update deals (calendar is shared)."""
    return user.role != "technician"


def _invoice_message_fr(name: str) -> str:
    return f"Bonjour {name}! Voici votre facture pour votre service. Merci d'avoir choisi Groupe WMB!"


def _invoice_message_en(name: str) -> str:
    return f"Hi {name}! Here's your invoice for your service. Thanks for choosing Groupe WMB!"


def _send_invoice_sms(db: Session, deal: "models.Deal"):
    """MMS the client a PDF of their invoice once a job is marked done. Fires once per deal."""
    if deal.invoice_sent:
        return
    if deal.contact_id and not deal.contact:
        deal.contact = db.query(models.Contact).filter(models.Contact.id == deal.contact_id).first()
    contact = deal.contact
    if not contact or not (contact.phone or "").strip():
        deal.invoice_sent = True   # no phone — skip silently, don't retry
        return

    from routes.invoices import invoice_pdf_url
    from routes.reminders import _send_mms

    name = (contact.first_name or "").strip() or "there"
    pdf_url = invoice_pdf_url(deal.id)
    lang = (contact.language or "").strip().lower()
    if lang == "fr":
        body = _invoice_message_fr(name)
    elif lang == "en":
        body = _invoice_message_en(name)
    else:
        body = _invoice_message_fr(name) + "\n\n" + _invoice_message_en(name)

    success, error = _send_mms(contact.phone.strip(), body, pdf_url)
    if success:
        try:
            db.add(models.ChatMessage(contact_id=contact.id, sender_id=None, body=body + " [invoice PDF]", direction="outbound"))
        except Exception:
            pass
        deal.invoice_sent = True
        log.info(f"[invoice] Sent PDF to {contact.first_name} ({contact.phone}) for deal {deal.id}")
    else:
        log.warning(f"[invoice] Failed for deal {deal.id}: {error}")


@router.get("/", response_model=List[schemas.Deal])
def list_deals(
    stage: Optional[str] = None,
    business_type: Optional[str] = None,
    contact_id: Optional[int] = None,
    company_id: Optional[int] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = Query(default=200, le=2000),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.Deal).options(
        joinedload(models.Deal.contact),
        joinedload(models.Deal.company),
    )
    # Admin and CEO see all deals.
    # Technicians see only deals they are assigned to.
    if current_user.role == "technician":
        assigned_via_table = exists().where(
            models.DealTechnician.deal_id == models.Deal.id,
            models.DealTechnician.user_id == current_user.id,
        )
        q = q.filter(
            or_(
                assigned_via_table,
                models.Deal.assigned_to == current_user.id,
            )
        )
    if stage:
        if stage not in STAGES:
            raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {', '.join(STAGES)}")
        q = q.filter(models.Deal.stage == stage)
    if business_type:
        q = q.filter(models.Deal.business_type == business_type)
    if contact_id:
        q = q.filter(models.Deal.contact_id == contact_id)
    if company_id:
        q = q.filter(models.Deal.company_id == company_id)
    if search:
        q = q.filter(models.Deal.title.ilike(f"%{search}%"))
    deals = q.order_by(models.Deal.created_at.desc()).offset(skip).limit(limit).all()
    return [_enrich(d, db) for d in deals]


@router.get("/{deal_id}", response_model=schemas.Deal)
def get_deal(deal_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    deal = (
        db.query(models.Deal)
        .options(joinedload(models.Deal.contact), joinedload(models.Deal.company))
        .filter(models.Deal.id == deal_id)
        .first()
    )
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if not _own_deal(deal, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    return _enrich(deal, db)


@router.post("/", response_model=schemas.Deal)
def create_deal(deal: schemas.DealCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    data = deal.model_dump()
    # Non-admins cannot pre-assign deals to other users
    if data.get("assigned_to") and current_user.role not in ("admin", "ceo"):
        data["assigned_to"] = None
    # Validate contact_id is accessible to this user
    if data.get("contact_id"):
        contact = db.query(models.Contact).filter(models.Contact.id == data["contact_id"]).first()
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
    db_deal = models.Deal(**data, created_by=current_user.id)
    db.add(db_deal)
    db.commit()
    db.refresh(db_deal)

    # Auto-send booking confirmation SMS if contact has a phone
    if db_deal.contact_id and db_deal.expected_close_date:
        contact = db.query(models.Contact).filter(models.Contact.id == db_deal.contact_id).first()
        if contact and contact.phone:
            _send_booking_confirmation(db, db_deal, contact, current_user.id)

    # If a technician has already claimed this appointment's day, auto-assign
    # them so the new booking lands on their calendar.
    if db_deal.expected_close_date:
        try:
            from routes.availability import day_owner, assign_tech_to_day
            date_str = db_deal.expected_close_date.strftime("%Y-%m-%d")
            owner = day_owner(db, date_str)
            if owner:
                assign_tech_to_day(db, owner.user_id, date_str)
        except Exception as e:
            log.warning("Auto-assign claimed-day tech failed for deal %s: %s", db_deal.id, e)

    return db_deal


def _send_booking_confirmation(db: Session, deal: models.Deal, contact: models.Contact, sender_id: int):
    """Build confirmation SMS, save as ChatMessage, and fire Twilio — best-effort."""
    dt = deal.expected_close_date
    try:
        import locale
        date_fr = dt.strftime("%A %-d %B")
        time_str = dt.strftime("%H:%M")
    except Exception:
        date_fr = str(dt.date())
        time_str = str(dt.time())[:5]

    try:
        date_en = dt.strftime("%A, %B %-d")
        time_en = dt.strftime("%-I:%M %p")
    except Exception:
        date_en = date_fr
        time_en = time_str

    safe_name = (contact.first_name or "")[:30].replace("\r", "").replace("\n", "")
    addr = contact.address[:80].replace(chr(0x202E), '') if contact.address else None
    svc = deal.title.split(' — ', 1)[1][:60] if deal.title and " — " in deal.title else None

    fr_lines = [f"Bonjour {safe_name}! Votre rendez-vous est confirmé ✅"]
    fr_lines.append(f"📅 {date_fr} à {time_str}")
    if addr:
        fr_lines.append(f"📍 {addr}")
    if svc:
        fr_lines.append(f"🔧 {svc}")
    if deal.value and deal.value > 0:
        fr_lines.append(f"💰 Estimation: ${deal.value:.2f}")
    # Note: internal notes are intentionally NOT sent to the client. They are
    # for the technician and live on the deal / calendar (Special Instructions).
    fr_lines.append("Répondez en tout temps si vous avez des questions. À bientôt!")

    en_lines = [f"\nHi {safe_name}! Your appointment is confirmed ✅"]
    en_lines.append(f"📅 {date_en} at {time_en}")
    if addr:
        en_lines.append(f"📍 {addr}")
    if svc:
        en_lines.append(f"🔧 {svc}")
    if deal.value and deal.value > 0:
        en_lines.append(f"💰 Estimate: ${deal.value:.2f}")
    en_lines.append("Reply anytime if you have questions. See you soon!")

    body = "\n".join(fr_lines) + "\n" + "\n".join(en_lines)
    if len(body) > 1500:
        body = body[:1497] + "..."

    try:
        db.add(models.ChatMessage(contact_id=contact.id, sender_id=sender_id, body=body, direction="outbound"))
        db.commit()
    except Exception:
        pass

    sid   = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    frm   = os.getenv("TWILIO_FROM_NUMBER")
    if not (sid and token and frm):
        log.warning("[booking SMS] Twilio not configured — skipping SMS for deal %s", deal.id)
        return
    try:
        from twilio.rest import Client
        msg = Client(sid, token).messages.create(body=body, from_=frm, to=contact.phone)
        log.info("[booking SMS] Sent to %s for deal %s (sid=%s)", contact.phone, deal.id, msg.sid)
    except Exception as e:
        log.error("[booking SMS] FAILED for deal %s to %s: %s", deal.id, contact.phone, e)


def _send_reschedule_sms(db: Session, deal: models.Deal, contact: models.Contact, sender_id: int):
    """Send a reschedule notification SMS — best-effort."""
    dt = deal.expected_close_date
    try:
        date_fr = dt.strftime("%A %-d %B")
        time_str = dt.strftime("%H:%M")
    except Exception:
        date_fr = str(dt.date())
        time_str = str(dt.time())[:5]

    try:
        date_en = dt.strftime("%A, %B %-d")
        time_en = dt.strftime("%-I:%M %p")
    except Exception:
        date_en = date_fr
        time_en = time_str

    safe_name = (contact.first_name or "")[:30].replace("\r", "").replace("\n", "")
    addr = contact.address[:80].replace(chr(0x202E), '') if contact.address else None
    svc = deal.title.split(' — ', 1)[1][:60] if deal.title and " — " in deal.title else None

    fr_lines = [f"Bonjour {safe_name}! Votre rendez-vous a été déplacé 🔄"]
    fr_lines.append(f"📅 Nouvelle date: {date_fr} à {time_str}")
    if addr:
        fr_lines.append(f"📍 {addr}")
    if svc:
        fr_lines.append(f"🔧 {svc}")
    fr_lines.append("Répondez en tout temps si vous avez des questions. À bientôt!")

    en_lines = [f"\nHi {safe_name}! Your appointment has been rescheduled 🔄"]
    en_lines.append(f"📅 New date: {date_en} at {time_en}")
    if addr:
        en_lines.append(f"📍 {addr}")
    if svc:
        en_lines.append(f"🔧 {svc}")
    en_lines.append("Reply anytime if you have questions. See you then!")

    body = "\n".join(fr_lines) + "\n" + "\n".join(en_lines)
    if len(body) > 1500:
        body = body[:1497] + "..."

    try:
        db.add(models.ChatMessage(contact_id=contact.id, sender_id=sender_id, body=body, direction="outbound"))
        db.commit()
    except Exception:
        pass

    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    frm = os.getenv("TWILIO_FROM_NUMBER")
    if not (sid and token and frm):
        log.warning("[reschedule SMS] Twilio not configured — skipping SMS for deal %s", deal.id)
        return
    try:
        from twilio.rest import Client
        msg = Client(sid, token).messages.create(body=body, from_=frm, to=contact.phone)
        log.info("[reschedule SMS] Sent to %s for deal %s (sid=%s)", contact.phone, deal.id, msg.sid)
    except Exception as e:
        log.error("[reschedule SMS] FAILED for deal %s to %s: %s", deal.id, contact.phone, e)


@router.put("/{deal_id}", response_model=schemas.Deal)
def update_deal(deal_id: int, deal: schemas.DealUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not db_deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if not _own_deal(db_deal, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    updates = deal.model_dump(exclude_unset=True)
    if "assigned_to" in updates and current_user.role not in ("admin", "ceo"):
        raise HTTPException(status_code=403, detail="Only admins can reassign deals")

    old_date = db_deal.expected_close_date
    was_done = db_deal.job_status == "done"
    for k, v in updates.items():
        setattr(db_deal, k, v)
    just_marked_done = "job_status" in updates and updates["job_status"] == "done" and not was_done
    if just_marked_done:
        import datetime as _dt
        db_deal.marked_done_at = _dt.datetime.utcnow()
    db.commit()
    db.refresh(db_deal)

    if just_marked_done:
        try:
            _send_invoice_sms(db, db_deal)
            db.commit()
        except Exception as e:
            log.warning("Invoice send failed for deal %s: %s", db_deal.id, e)

    # Send reschedule SMS if date changed and contact has a phone
    new_date = db_deal.expected_close_date
    if "expected_close_date" in updates and old_date != new_date and db_deal.contact_id and new_date:
        contact = db.query(models.Contact).filter(models.Contact.id == db_deal.contact_id).first()
        if contact and contact.phone:
            _send_reschedule_sms(db, db_deal, contact, current_user.id)

    # If rescheduled onto a day a technician has already claimed, auto-assign them.
    if "expected_close_date" in updates and old_date != new_date and new_date:
        try:
            from routes.availability import day_owner, assign_tech_to_day
            owner = day_owner(db, new_date.strftime("%Y-%m-%d"))
            if owner:
                assign_tech_to_day(db, owner.user_id, new_date.strftime("%Y-%m-%d"))
        except Exception as e:
            log.warning("Auto-assign claimed-day tech failed on reschedule for deal %s: %s", db_deal.id, e)

    return _enrich(db_deal, db)


@router.post("/{deal_id}/techs/{user_id}")
def toggle_tech(deal_id: int, user_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Add or remove a technician from a deal (toggle)."""
    if current_user.role not in ("admin", "ceo"):
        raise HTTPException(status_code=403, detail="Admin only")
    existing = db.query(models.DealTechnician).filter(
        models.DealTechnician.deal_id == deal_id,
        models.DealTechnician.user_id == user_id,
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"assigned": False}
    else:
        db.add(models.DealTechnician(deal_id=deal_id, user_id=user_id))
        db.commit()
        return {"assigned": True}


JOB_STATUSES = ["todo", "payment_pending", "done", "cancelled"]


@router.patch("/{deal_id}/job-status")
def update_job_status(deal_id: int, job_status: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if job_status not in JOB_STATUSES:
        raise HTTPException(status_code=400, detail=f"job_status must be one of {JOB_STATUSES}")
    db_deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not db_deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if not _own_deal(db_deal, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    was_done = db_deal.job_status == "done"
    db_deal.job_status = job_status
    if job_status == "done" and not was_done:
        import datetime as _dt
        db_deal.marked_done_at = _dt.datetime.utcnow()
        db.flush()
        try:
            _send_invoice_sms(db, db_deal)
        except Exception as e:
            log.warning("Invoice send failed for deal %s: %s", db_deal.id, e)
    db.commit()
    return {"job_status": job_status}


@router.patch("/{deal_id}/stage")
def move_stage(deal_id: int, stage: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if stage not in STAGES:
        raise HTTPException(status_code=400, detail=f"Stage must be one of {STAGES}")
    db_deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not db_deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if not _own_deal(db_deal, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    db_deal.stage = stage
    db.commit()
    return {"stage": stage}


@router.delete("/{deal_id}")
def delete_deal(deal_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not db_deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if not _own_deal(db_deal, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    # Remove FK-constrained child rows before deleting
    db.query(models.DealTechnician).filter(models.DealTechnician.deal_id == deal_id).delete()
    db.query(models.ReminderLog).filter(models.ReminderLog.deal_id == deal_id).delete()
    db.query(models.Activity).filter(models.Activity.deal_id == deal_id).update({"deal_id": None})
    db.query(models.TimeClock).filter(models.TimeClock.deal_id == deal_id).update({"deal_id": None})
    db.delete(db_deal)
    db.commit()
    return {"message": "Deleted"}
