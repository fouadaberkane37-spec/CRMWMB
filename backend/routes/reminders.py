from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta
from database import get_db
import models
import schemas
from auth import get_current_user
import os

router = APIRouter(prefix="/api/reminders", tags=["reminders"])

OWN_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "+10000000000")

REMINDER_WINDOWS = {
    "7day": (7 * 24 * 60 - 30, 7 * 24 * 60 + 23 * 60),  # 6d23.5h → 7d23h from now
    "48h":  (47 * 60 + 30, 49 * 60),
    "24h":  (23 * 60 + 30, 25 * 60),
}

TEMPLATES = {
    "7day": "Hi {name}, just a heads-up — you have an appointment in 7 days on {date} at {time}{address_part}. See you soon!",
    "48h":  "Hi {name}, reminder: your appointment is in 2 days on {date} at {time}{address_part}. See you then!",
    "24h":  "Hi {name}, your appointment is tomorrow at {time}{address_part}. We look forward to seeing you!",
}


def _build_message(reminder_type: str, name: str, scheduled_at: datetime, address: str | None) -> str:
    date_str = scheduled_at.strftime("%A, %b %-d")
    time_str = scheduled_at.strftime("%-I:%M %p")
    address_part = f" at {address}" if address else ""
    return TEMPLATES[reminder_type].format(
        name=name, date=date_str, time=time_str, address_part=address_part
    )


def _already_sent(db: Session, job_id: int, reminder_type: str) -> bool:
    return db.query(models.AppointmentReminder).filter(
        models.AppointmentReminder.job_id == job_id,
        models.AppointmentReminder.reminder_type == reminder_type,
        models.AppointmentReminder.status == "sent",
    ).first() is not None


def _run_campaign(
    db: Session,
    reminder_type: str,
    target_date: datetime | None = None,
) -> schemas.CampaignResult:
    """
    Find all jobs that fall inside the reminder window for reminder_type
    (or exactly on target_date if provided) and send SMS.
    """
    now = datetime.utcnow()
    details = []
    sent = skipped = failed = 0

    if target_date:
        # Treat target_date as the appointment date — send regardless of window
        start = datetime(target_date.year, target_date.month, target_date.day, 0, 0, 0)
        end = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59)
    else:
        min_min, max_min = REMINDER_WINDOWS[reminder_type]
        start = now + timedelta(minutes=min_min)
        end = now + timedelta(minutes=max_min)

    jobs = (
        db.query(models.JobAssignment)
        .options(joinedload(models.JobAssignment.contact))
        .filter(
            models.JobAssignment.scheduled_at >= start,
            models.JobAssignment.scheduled_at <= end,
            models.JobAssignment.status.notin_(["cancelled", "completed"]),
        )
        .all()
    )

    for job in jobs:
        contact = job.contact
        if not contact or not contact.phone:
            # Log skipped — no phone
            r = models.AppointmentReminder(
                job_id=job.id,
                contact_id=contact.id if contact else None,
                reminder_type=reminder_type,
                phone_number="",
                message_body=None,
                status="skipped",
            )
            db.add(r)
            skipped += 1
            continue

        if _already_sent(db, job.id, reminder_type):
            skipped += 1
            continue

        name = f"{contact.first_name}"
        address = job.address or (contact.notes and None)  # keep address from job
        body = _build_message(reminder_type, name, job.scheduled_at, job.address)

        # Create outbound SMS chat message
        sms = models.ChatMessage(
            direction="outbound",
            from_number=OWN_NUMBER,
            to_number=contact.phone,
            body=body,
            is_read=True,
            contact_id=contact.id,
        )
        db.add(sms)

        reminder = models.AppointmentReminder(
            job_id=job.id,
            contact_id=contact.id,
            reminder_type=reminder_type,
            phone_number=contact.phone,
            message_body=body,
            status="sent",
        )
        db.add(reminder)
        db.flush()
        db.refresh(reminder)
        details.append(schemas.ReminderOut.model_validate(reminder))
        sent += 1

    db.commit()

    return schemas.CampaignResult(sent=sent, skipped=skipped, failed=failed, details=details)


@router.post("/run", response_model=schemas.CampaignResult)
def run_campaign(
    reminder_type: str = Query(..., description="7day | 48h | 24h"),
    target_date: Optional[str] = Query(None, description="YYYY-MM-DD — override window, send for this specific date"),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    if reminder_type not in REMINDER_WINDOWS:
        raise HTTPException(status_code=400, detail=f"reminder_type must be one of {list(REMINDER_WINDOWS)}")

    td = None
    if target_date:
        try:
            td = datetime.strptime(target_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="target_date must be YYYY-MM-DD")

    return _run_campaign(db, reminder_type, target_date=td)


@router.get("/pending")
def preview_pending(
    reminder_type: str = Query(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    """Preview which jobs would receive reminders without sending."""
    now = datetime.utcnow()
    if reminder_type not in REMINDER_WINDOWS:
        raise HTTPException(status_code=400, detail=f"reminder_type must be one of {list(REMINDER_WINDOWS)}")
    min_min, max_min = REMINDER_WINDOWS[reminder_type]
    start = now + timedelta(minutes=min_min)
    end = now + timedelta(minutes=max_min)

    jobs = (
        db.query(models.JobAssignment)
        .options(joinedload(models.JobAssignment.contact))
        .filter(
            models.JobAssignment.scheduled_at >= start,
            models.JobAssignment.scheduled_at <= end,
            models.JobAssignment.status.notin_(["cancelled", "completed"]),
        )
        .all()
    )
    return [
        {
            "job_id": j.id,
            "title": j.title,
            "scheduled_at": j.scheduled_at,
            "contact": f"{j.contact.first_name} {j.contact.last_name or ''}" if j.contact else None,
            "phone": j.contact.phone if j.contact else None,
            "already_sent": _already_sent(db, j.id, reminder_type),
        }
        for j in jobs
    ]


@router.get("/", response_model=List[schemas.ReminderOut])
def list_reminders(
    reminder_type: Optional[str] = None,
    job_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(models.AppointmentReminder).options(
        joinedload(models.AppointmentReminder.contact)
    )
    if reminder_type:
        q = q.filter(models.AppointmentReminder.reminder_type == reminder_type)
    if job_id:
        q = q.filter(models.AppointmentReminder.job_id == job_id)
    return q.order_by(models.AppointmentReminder.sent_at.desc()).offset(skip).limit(limit).all()


@router.get("/by-job/{job_id}", response_model=List[schemas.ReminderOut])
def reminders_for_job(job_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return (
        db.query(models.AppointmentReminder)
        .filter(
            models.AppointmentReminder.job_id == job_id,
            models.AppointmentReminder.status == "sent",
        )
        .all()
    )


@router.get("/by-date/{date_str}")
def reminders_by_date(date_str: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Return sent reminders grouped by job_id for all jobs scheduled on date_str (YYYY-MM-DD)."""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    start = datetime(d.year, d.month, d.day, 0, 0, 0)
    end = datetime(d.year, d.month, d.day, 23, 59, 59)
    jobs = db.query(models.JobAssignment.id).filter(
        models.JobAssignment.scheduled_at >= start,
        models.JobAssignment.scheduled_at <= end,
    ).all()
    job_ids = [j.id for j in jobs]
    if not job_ids:
        return {}
    rows = db.query(models.AppointmentReminder).filter(
        models.AppointmentReminder.job_id.in_(job_ids),
        models.AppointmentReminder.status == "sent",
    ).all()
    result: dict = {}
    for r in rows:
        result.setdefault(r.job_id, [])
        result[r.job_id].append(r.reminder_type)
    return result
