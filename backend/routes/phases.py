from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from database import get_db
import models, schemas
from auth import get_current_user

router = APIRouter(prefix="/api/phases", tags=["phases"])


def _enrich(phase: models.DealPhase) -> dict:
    techs = [
        {"id": a.user.id, "username": a.user.username, "full_name": a.user.full_name}
        for a in phase.assignments if a.user
    ]
    contact = None
    if phase.deal and phase.deal.contact:
        c = phase.deal.contact
        contact = {
            "id": c.id, "first_name": c.first_name, "last_name": c.last_name,
            "phone": c.phone, "address": c.address, "services": c.services,
        }
    return {
        "id": phase.id,
        "deal_id": phase.deal_id,
        "title": phase.title,
        "phase_date": phase.phase_date.isoformat() if phase.phase_date else None,
        "status": phase.status or "todo",
        "notes": phase.notes,
        "created_at": phase.created_at.isoformat() if phase.created_at else None,
        "techs": techs,
        "deal_title": phase.deal.title if phase.deal else None,
        "deal_value": phase.deal.value if phase.deal else None,
        "deal_job_status": phase.deal.job_status if phase.deal else None,
        "contact": contact,
    }


def _load(phase_id: int, db: Session) -> models.DealPhase:
    return (
        db.query(models.DealPhase)
        .options(
            joinedload(models.DealPhase.assignments).joinedload(models.PhaseAssignment.user),
            joinedload(models.DealPhase.deal).joinedload(models.Deal.contact),
        )
        .filter(models.DealPhase.id == phase_id)
        .first()
    )


@router.get("/")
def list_phases(
    deal_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.DealPhase).options(
        joinedload(models.DealPhase.assignments).joinedload(models.PhaseAssignment.user),
        joinedload(models.DealPhase.deal).joinedload(models.Deal.contact),
    )
    if deal_id:
        q = q.filter(models.DealPhase.deal_id == deal_id)

    if current_user.role == "technician":
        q = q.join(models.PhaseAssignment, models.PhaseAssignment.phase_id == models.DealPhase.id)\
             .filter(models.PhaseAssignment.user_id == current_user.id)
    elif current_user.role not in ("admin", "ceo"):
        q = q.join(models.Deal, models.Deal.id == models.DealPhase.deal_id).filter(
            (models.Deal.created_by == current_user.id) | (models.Deal.assigned_to == current_user.id)
        )

    phases = q.order_by(models.DealPhase.phase_date.asc().nullslast()).all()
    return [_enrich(p) for p in phases]


@router.post("/")
def create_phase(
    data: schemas.PhaseCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    deal = db.query(models.Deal).filter(models.Deal.id == data.deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if current_user.role not in ("admin", "ceo") and deal.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    phase = models.DealPhase(
        deal_id=data.deal_id,
        title=data.title,
        phase_date=data.phase_date,
        status=data.status,
        notes=data.notes,
    )
    db.add(phase)
    db.flush()
    for uid in data.tech_ids:
        db.add(models.PhaseAssignment(phase_id=phase.id, user_id=uid))
    db.commit()

    return _enrich(_load(phase.id, db))


@router.put("/{phase_id}")
def update_phase(
    phase_id: int,
    data: schemas.PhaseUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    phase = db.query(models.DealPhase).filter(models.DealPhase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    if current_user.role not in ("admin", "ceo"):
        raise HTTPException(status_code=403, detail="Admin only")

    if data.title is not None:
        phase.title = data.title
    if data.phase_date is not None:
        phase.phase_date = data.phase_date
    if data.status is not None:
        phase.status = data.status
    if data.notes is not None:
        phase.notes = data.notes
    if data.tech_ids is not None:
        db.query(models.PhaseAssignment).filter(models.PhaseAssignment.phase_id == phase_id).delete()
        for uid in data.tech_ids:
            db.add(models.PhaseAssignment(phase_id=phase_id, user_id=uid))
    db.commit()

    return _enrich(_load(phase_id, db))


@router.delete("/{phase_id}")
def delete_phase(
    phase_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    phase = db.query(models.DealPhase).filter(models.DealPhase.id == phase_id).first()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    if current_user.role not in ("admin", "ceo"):
        raise HTTPException(status_code=403, detail="Admin only")
    db.delete(phase)
    db.commit()
    return {"ok": True}
