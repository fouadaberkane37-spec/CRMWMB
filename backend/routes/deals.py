from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from sqlalchemy import exists
from typing import List, Optional
import os
from database import get_db
import models
import schemas
from auth import get_current_user

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
    """Return True if user owns this deal or is admin."""
    return user.role == "admin" or deal.assigned_to == user.id or deal.created_by == user.id


@router.get("/", response_model=List[schemas.Deal])
def list_deals(
    stage: Optional[str] = None,
    contact_id: Optional[int] = None,
    company_id: Optional[int] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = Query(default=200, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.Deal).options(
        joinedload(models.Deal.contact),
        joinedload(models.Deal.company),
    )
    # Admin sees all. Technician sees only deals they are assigned to.
    # Sales/user sees only deals they created or are the legacy assignee of.
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
    elif current_user.role != "admin":
        q = q.filter(
            or_(
                models.Deal.assigned_to == current_user.id,
                models.Deal.created_by == current_user.id,
            )
        )
    if stage:
        if stage not in STAGES:
            raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {', '.join(STAGES)}")
        q = q.filter(models.Deal.stage == stage)
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
    if data.get("assigned_to") and current_user.role != "admin":
        data["assigned_to"] = None
    # Validate contact_id is accessible to this user
    if data.get("contact_id"):
        contact = db.query(models.Contact).filter(models.Contact.id == data["contact_id"]).first()
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        if current_user.role != "admin" and contact.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot create a deal for a contact you don't own")
    db_deal = models.Deal(**data, created_by=current_user.id)
    db.add(db_deal)
    db.commit()
    db.refresh(db_deal)

    # Auto-send booking confirmation SMS if contact has a phone
    if db_deal.contact_id and db_deal.expected_close_date:
        contact = db.query(models.Contact).filter(models.Contact.id == db_deal.contact_id).first()
        if contact and contact.phone:
            _send_booking_confirmation(db, db_deal, contact, current_user.id)

    return db_deal


def _send_booking_confirmation(db: Session, deal: models.Deal, contact: models.Contact, sender_id: int):
    """Build confirmation SMS, save as ChatMessage, and fire Twilio — best-effort."""
    from datetime import timezone

    dt = deal.expected_close_date
    try:
        date_str = dt.strftime("%A, %B %-d")
        time_str = dt.strftime("%-I:%M %p")
    except Exception:
        date_str = str(dt.date())
        time_str = str(dt.time())[:5]

    safe_name = (contact.first_name or "")[:30].replace("\r", "").replace("\n", "")
    lines = [f"Hi {safe_name}! Your appointment is confirmed ✅"]
    lines.append(f"📅 {date_str} at {time_str}")
    if contact.address:
        lines.append(f"📍 {contact.address[:80].replace(chr(0x202E), '')}")
    # Services from deal title (format: "Name — Services")
    if deal.title and " — " in deal.title:
        lines.append(f"🔧 {deal.title.split(' — ', 1)[1][:60]}")
    if deal.value and deal.value > 0:
        lines.append(f"💰 Estimate: ${deal.value:.2f}")
    if deal.notes:
        lines.append(f"📝 {deal.notes[:200]}")
    lines.append("\nReply anytime if you have questions. See you soon!")

    body = "\n".join(lines)
    if len(body) > 1500:
        body = body[:1497] + "..."

    # Save to chat thread
    try:
        msg = models.ChatMessage(
            contact_id=contact.id,
            sender_id=sender_id,
            body=body,
            direction="outbound",
        )
        db.add(msg)
        db.commit()
    except Exception:
        pass

    # Fire Twilio SMS
    sid   = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    frm   = os.getenv("TWILIO_FROM_NUMBER")
    if sid and token and frm:
        try:
            from twilio.rest import Client
            Client(sid, token).messages.create(body=body, from_=frm, to=contact.phone)
        except Exception:
            pass


@router.put("/{deal_id}", response_model=schemas.Deal)
def update_deal(deal_id: int, deal: schemas.DealUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not db_deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if not _own_deal(db_deal, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    updates = deal.model_dump(exclude_unset=True)
    if "assigned_to" in updates and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can reassign deals")
    for k, v in updates.items():
        setattr(db_deal, k, v)
    db.commit()
    db.refresh(db_deal)
    return _enrich(db_deal, db)


@router.post("/{deal_id}/techs/{user_id}")
def toggle_tech(deal_id: int, user_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Add or remove a technician from a deal (toggle)."""
    if current_user.role != "admin":
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
    db_deal.job_status = job_status
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
    db.delete(db_deal)
    db.commit()
    return {"message": "Deleted"}
