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

from fastapi import APIRouter, Depends
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


def _build_message(deal: models.Deal) -> str:
    time_str = deal.expected_close_date.strftime("%H:%M") if deal.expected_close_date else "?"
    contact  = deal.contact
    name     = f"{contact.first_name} {contact.last_name or ''}".strip() if contact else deal.title
    address  = contact.address if (contact and contact.address) else "adresse inconnue"
    service  = deal.title or "service"
    return (
        f"Rappel Groupe WMB: Vous avez un rendez-vous demain à {time_str} — "
        f"{service} chez {name}, {address}. "
        f"Contactez le bureau si besoin."
    )


# ── Core reminder job ─────────────────────────────────────────────────────────

def run_reminders():
    """Query upcoming deals and fire reminders. Called by scheduler every hour."""
    db = SessionLocal()
    try:
        now        = datetime.utcnow()
        window_lo  = now + timedelta(hours=23)
        window_hi  = now + timedelta(hours=25)

        deals = (
            db.query(models.Deal)
            .filter(
                models.Deal.expected_close_date >= window_lo,
                models.Deal.expected_close_date <= window_hi,
                models.Deal.reminder_sent == False,          # noqa: E712
                models.Deal.job_status != "cancelled",
            )
            .all()
        )

        if not deals:
            return

        log.info(f"[reminders] {len(deals)} deal(s) in 24h window")

        for deal in deals:
            # Load contact for message building
            if deal.contact_id and not deal.contact:
                deal.contact = db.query(models.Contact).filter(
                    models.Contact.id == deal.contact_id
                ).first()

            # Get assigned technicians from deal_technicians table
            rows = db.query(models.DealTechnician).filter(
                models.DealTechnician.deal_id == deal.id
            ).all()
            techs = [r.user for r in rows if r.user]

            # Also include legacy assigned_to if set and not already in list
            if deal.assigned_to:
                legacy = db.query(models.User).filter(
                    models.User.id == deal.assigned_to
                ).first()
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

                msg            = _build_message(deal)
                success, error = _send_sms(phone, msg)
                db.add(models.ReminderLog(
                    deal_id=deal.id, user_id=tech.id,
                    phone_number=phone,
                    status="sent" if success else "failed",
                    error=error or None,
                ))
                if success:
                    any_sent = True
                    log.info(f"[reminders] Sent to {tech.username} for deal {deal.id}")
                else:
                    log.warning(f"[reminders] Failed for {tech.username}: {error}")

            if any_sent or not techs:
                deal.reminder_sent = True

        db.commit()
        log.info("[reminders] Done")

    except Exception as e:
        db.rollback()
        log.error(f"[reminders] Error: {e}")
    finally:
        db.close()


# ── Scheduler startup ─────────────────────────────────────────────────────────

def start_scheduler():
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler(timezone="UTC")
        scheduler.add_job(run_reminders, "interval", hours=1, id="job_reminders",
                          next_run_time=datetime.utcnow() + timedelta(minutes=2))
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


@router.get("/logs")
def get_reminder_logs(
    deal_id: int = None,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Admin: fetch reminder logs, optionally filtered by deal."""
    q = db.query(models.ReminderLog).order_by(models.ReminderLog.sent_at.desc())
    if deal_id:
        q = q.filter(models.ReminderLog.deal_id == deal_id)
    rows = q.limit(200).all()
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
