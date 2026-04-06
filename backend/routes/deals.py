from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List, Optional
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/deals", tags=["deals"])

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
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.Deal).options(
        joinedload(models.Deal.contact),
        joinedload(models.Deal.company),
    )
    # Non-admin (sales) can only see deals they own (assigned to or created by)
    if current_user.role != "admin":
        q = q.filter(
            or_(
                models.Deal.assigned_to == current_user.id,
                models.Deal.created_by == current_user.id,
            )
        )
    if stage:
        q = q.filter(models.Deal.stage == stage)
    if contact_id:
        q = q.filter(models.Deal.contact_id == contact_id)
    if company_id:
        q = q.filter(models.Deal.company_id == company_id)
    if search:
        q = q.filter(models.Deal.title.ilike(f"%{search}%"))
    return q.order_by(models.Deal.created_at.desc()).offset(skip).limit(limit).all()


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
    return deal


@router.post("/", response_model=schemas.Deal)
def create_deal(deal: schemas.DealCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_deal = models.Deal(**deal.model_dump(), created_by=current_user.id)
    db.add(db_deal)
    db.commit()
    db.refresh(db_deal)
    return db_deal


@router.put("/{deal_id}", response_model=schemas.Deal)
def update_deal(deal_id: int, deal: schemas.DealUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not db_deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if not _own_deal(db_deal, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    for k, v in deal.model_dump(exclude_unset=True).items():
        setattr(db_deal, k, v)
    db.commit()
    db.refresh(db_deal)
    return db_deal


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
