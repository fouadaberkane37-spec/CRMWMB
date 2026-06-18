"""
24-hour job reminder system.

Scheduler runs every hour. For each deal whose expected_close_date falls
between now+23h and now+25h (i.e. roughly 24 hours away) that hasn't already
been reminded, it sends a French-language SMS to every assigned technician
who has a phone number on file.
"""

import os
import logging
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
import models
from auth import require_admin, get_current_user

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reminders", tags=["reminders"])


# ── SMS helper ────────────────────────────────────────────────────────────────

def _send_sms(to: str, body: str) -> tuple[bool, str]:
    """Send via Twilio. Returns (success, error_or_empty)."""
    sid      = os.getenv("TWILIO_ACCOUNT_SID")
    token    = os.getenv("TWILIO_AUTH_TOKEN")
    from_num = os.getenv("TWILIO_FROM_NUMBER")
    if not (sid and token and from_num):
        return False, "Twilio not configured"
    try:
        from twilio.rest import Client
        Client(sid, token).messages.create(body=body, from_=from_num, to=to)
        return True, ""
    except Exception as e:
        return False, str(e)


def _build_message(deal: models.Deal, hours: int = 24) -> str:
    time_str = deal.expected_close_date.strftime("%H:%M") if deal.expected_close_date else "?"
    contact  = deal.contact
    raw_name = f"{contact.first_name} {contact.last_name or ''}".strip() if contact else (deal.title or "")
    name     = raw_name[:50].replace("\r", "").replace("\n", " ")
    raw_addr = contact.address if (contact and contact.address) else "adresse inconnue"
    address  = raw_addr[:80].replace("\r", "").replace("\n", " ")
    service  = (deal.title or "service")[:80].replace("\r", "").replace("\n", " ")
    when     = "demain" if hours == 24 else "après-demain"
    return (
        f"Rappel Groupe WMB: Vous avez un rendez-vous {when} à {time_str} — "
        f"{service} chez {name}, {address}. "
        f"Contactez le bureau si besoin."
    )


def _send_reminders_for_window(db, window_lo, window_hi, hours: int):
    """Send reminders for deals whose close date falls in [window_lo, window_hi].
    hours=24 updates reminder_sent; hours=48 updates reminder_sent_48h."""
    sent_field = "reminder_sent" if hours == 24 else "reminder_sent_48h"
    filter_col = models.Deal.reminder_sent if hours == 24 else models.Deal.reminder_sent_48h

    deals = (
        db.query(models.Deal)
        .filter(
            models.Deal.expected_close_date >= window_lo,
            models.Deal.expected_close_date <= window_hi,
            filter_col == False,                   # noqa: E712
            models.Deal.job_status != "cancelled",
        )
        .all()
    )

    if not deals:
        return 0

    log.info(f"[reminders] {len(deals)} deal(s) in {hours}h window")

    for deal in deals:
        if deal.contact_id and not deal.contact:
            deal.contact = db.query(models.Contact).filter(
                models.Contact.id == deal.contact_id
            ).first()

        rows  = db.query(models.DealTechnician).filter(models.DealTechnician.deal_id == deal.id).all()
        techs = [r.user for r in rows if r.user]
        if deal.assigned_to:
            legacy = db.query(models.User).filter(models.User.id == deal.assigned_to).first()
            if legacy and legacy.id not in {t.id for t in techs}:
                techs.append(legacy)

        any_sent = False
        for tech in techs:
            phone = (tech.phone or "").strip()
            if not phone:
                db.add(models.ReminderLog(
                    deal_id=deal.id, user_id=tech.id,
                    phone_number=None, status="no_phone",
                ))
                continue

            msg            = _build_message(deal, hours=hours)
            success, error = _send_sms(phone, msg)
            db.add(models.ReminderLog(
                deal_id=deal.id, user_id=tech.id,
                phone_number=phone,
                status="sent" if success else "failed",
                error=error or None,
            ))
            if success:
                any_sent = True
                log.info(f"[reminders/{hours}h] Sent to {tech.username} for deal {deal.id}")
            else:
                log.warning(f"[reminders/{hours}h] Failed for {tech.username}: {error}")

        if any_sent or not techs:
            setattr(deal, sent_field, True)

    return len(deals)


# ── Client reminder ───────────────────────────────────────────────────────────

def _build_client_message(deal: models.Deal) -> str:
    dt      = deal.expected_close_date
    contact = deal.contact
    name    = contact.first_name if contact else "there"
    try:
        date_str = dt.strftime("%A, %B %-d")
        time_str = dt.strftime("%-I:%M %p")
    except Exception:
        date_str = str(dt.date())
        time_str = str(dt.time())[:5]

    lines = [f"Hi {name}! Just a reminder — your appointment is tomorrow 📅"]
    lines.append(f"🗓 {date_str} at {time_str}")
    if contact and contact.address:
        lines.append(f"📍 {contact.address}")
    if deal.title and " — " in deal.title:
        lines.append(f"🔧 {deal.title.split(' — ', 1)[1]}")
    elif deal.title:
        lines.append(f"🔧 {deal.title}")
    lines.append("\nSee you soon! Reply if you have any questions.")
    return "\n".join(lines)


def _send_client_reminders(db, window_lo, window_hi):
    """Send 24h reminder SMS to the client (contact) for each upcoming deal."""
    deals = (
        db.query(models.Deal)
        .filter(
            models.Deal.expected_close_date >= window_lo,
            models.Deal.expected_close_date <= window_hi,
            models.Deal.client_reminder_sent == False,   # noqa: E712
            models.Deal.job_status != "cancelled",
        )
        .all()
    )

    if not deals:
        return

    log.info(f"[reminders/client] {len(deals)} deal(s) needing client reminder")

    for deal in deals:
        if deal.contact_id and not deal.contact:
            deal.contact = db.query(models.Contact).filter(
                models.Contact.id == deal.contact_id
            ).first()

        contact = deal.contact
        if not contact or not (contact.phone or "").strip():
            deal.client_reminder_sent = True   # no phone — skip silently
            log.info(f"[reminders/client] deal={deal.id} skipped — no client phone")
            continue

        body = _build_client_message(deal)
        success, error = _send_sms(contact.phone.strip(), body)

        if success:
            # Save to chat thread so it appears in Chats tab
            try:
                db.add(models.ChatMessage(
                    contact_id=contact.id,
                    sender_id=None,
                    body=body,
                    direction="outbound",
                ))
            except Exception:
                pass
            deal.client_reminder_sent = True
            log.info(f"[reminders/client] Sent to {contact.first_name} ({contact.phone}) for deal {deal.id}")
        else:
            log.warning(f"[reminders/client] Failed for deal {deal.id}: {error}")


# ── Core reminder job ─────────────────────────────────────────────────────────

def run_reminders():
    """Query upcoming deals and fire reminders. Called by scheduler every hour."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()

        # Tech 24h window: 23–25h from now
        _send_reminders_for_window(db, now + timedelta(hours=23), now + timedelta(hours=25), hours=24)

        # Tech 48h window: 47–49h from now
        _send_reminders_for_window(db, now + timedelta(hours=47), now + timedelta(hours=49), hours=48)

        # Client 24h reminder
        _send_client_reminders(db, now + timedelta(hours=23), now + timedelta(hours=25))

        db.commit()
        log.info("[reminders] Done")

    except Exception as e:
        db.rollback()
        log.error(f"[reminders] Error: {e}")
    finally:
        db.close()


# ── Scheduler startup ─────────────────────────────────────────────────────────

def _cleanup_otp_sessions():
    """Purge expired OTPSession rows to keep the table small."""
    try:
        from database import SessionLocal as _SL
        import models as _m
        db = _SL()
        deleted = db.query(_m.OTPSession).filter(_m.OTPSession.expires_at < datetime.utcnow()).delete()
        db.commit()
        if deleted:
            log.info(f"[otp-cleanup] Removed {deleted} expired OTP sessions")
    except Exception as e:
        log.warning(f"[otp-cleanup] Failed: {e}")
    finally:
        try:
            db.close()
        except Exception:
            pass


def start_scheduler():
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from routes.review_requests import run_review_requests
        scheduler = BackgroundScheduler(timezone="UTC")
        scheduler.add_job(run_reminders, "interval", hours=1, id="job_reminders",
                          next_run_time=datetime.utcnow() + timedelta(minutes=2))
        scheduler.add_job(_cleanup_otp_sessions, "interval", hours=6, id="job_otp_cleanup",
                          next_run_time=datetime.utcnow() + timedelta(minutes=5))
        scheduler.add_job(run_review_requests, "interval", minutes=30, id="job_review_requests",
                          next_run_time=datetime.utcnow() + timedelta(minutes=3))
        scheduler.start()
        log.info("[reminders] Scheduler started — runs every hour")
        return scheduler
    except Exception as e:
        log.error(f"[reminders] Failed to start scheduler: {e}")
        return None


# ── Admin API endpoints ───────────────────────────────────────────────────────

@router.post("/trigger")
def trigger_reminders(_=Depends(require_admin)):
    """Admin: manually fire the reminder job right now."""
    run_reminders()
    return {"ok": True, "message": "Reminder job completed"}


@router.post("/test/{deal_id}")
def test_reminder(deal_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Admin: send reminder SMS for a specific deal right now, bypassing the 24h window."""
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Deal not found")

    # Load contact
    if deal.contact_id and not deal.contact:
        deal.contact = db.query(models.Contact).filter(models.Contact.id == deal.contact_id).first()

    # Collect assigned techs
    rows = db.query(models.DealTechnician).filter(models.DealTechnician.deal_id == deal.id).all()
    techs = [r.user for r in rows if r.user]
    if deal.assigned_to:
        legacy = db.query(models.User).filter(models.User.id == deal.assigned_to).first()
        if legacy and legacy.id not in {t.id for t in techs}:
            techs.append(legacy)

    if not techs:
        return {"ok": False, "message": "No technicians assigned to this deal", "results": []}

    results = []
    for hours in [48, 24]:
        for tech in techs:
            phone = (tech.phone or "").strip()
            if not phone:
                if hours == 24:  # log no_phone once
                    results.append({"hours": hours, "tech": tech.full_name or tech.username, "phone": None, "status": "no_phone"})
                continue
            msg = _build_message(deal, hours=hours)
            success, error = _send_sms(phone, msg)
            masked_phone = ("***" + phone[-4:]) if len(phone) >= 4 else "***"
            results.append({
                "hours":   hours,
                "tech":    tech.full_name or tech.username,
                "phone":   masked_phone,
                "status":  "sent" if success else "failed",
                "error":   error or None,
                "message": msg,
            })
            log.info(f"[reminders/test/{hours}h] deal={deal_id} tech={tech.username} -> {'OK' if success else error}")

    db.commit()
    return {"ok": True, "deal_id": deal_id, "results": results}


@router.get("/logs")
def get_reminder_logs(
    deal_id: int = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Admin: fetch reminder logs, optionally filtered by deal."""
    q = db.query(models.ReminderLog).order_by(models.ReminderLog.sent_at.desc())
    if deal_id:
        q = q.filter(models.ReminderLog.deal_id == deal_id)
    rows = q.offset(offset).limit(limit).all()
    return [
        {
            "id":           r.id,
            "deal_id":      r.deal_id,
            "user_id":      r.user_id,
            "tech_name":    r.user.full_name or r.user.username if r.user else None,
            "phone_number": r.phone_number,
            "status":       r.status,
            "error":        r.error,
            "sent_at":      r.sent_at.isoformat(),
        }
        for r in rows
    ]
