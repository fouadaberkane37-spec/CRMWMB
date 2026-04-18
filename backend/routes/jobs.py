from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from typing import List, Optional
from datetime import datetime, date
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

VALID_STATUSES = ["scheduled", "confirmed", "in_progress", "completed", "cancelled"]


def _load_job(db, job_id):
    return (
        db.query(models.JobAssignment)
        .options(
            joinedload(models.JobAssignment.contact),
            joinedload(models.JobAssignment.assignee),
            joinedload(models.JobAssignment.technicians).joinedload(models.JobTechnician.technician),
        )
        .filter(models.JobAssignment.id == job_id)
        .first()
    )


@router.get("/", response_model=List[schemas.JobAssignment])
def list_jobs(
    assigned_to: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(models.JobAssignment).options(
        joinedload(models.JobAssignment.contact),
        joinedload(models.JobAssignment.assignee),
        joinedload(models.JobAssignment.technicians).joinedload(models.JobTechnician.technician),
    )
    if assigned_to:
        q = q.filter(models.JobAssignment.assigned_to == assigned_to)
    if status:
        q = q.filter(models.JobAssignment.status == status)
    if priority:
        q = q.filter(models.JobAssignment.priority == priority)
    return q.order_by(models.JobAssignment.scheduled_at.asc()).offset(skip).limit(limit).all()


@router.get("/by-date/{date_str}", response_model=List[schemas.JobAssignment])
def jobs_by_date(date_str: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Return jobs scheduled on a specific YYYY-MM-DD date."""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    start = datetime(d.year, d.month, d.day, 0, 0, 0)
    end = datetime(d.year, d.month, d.day, 23, 59, 59)
    return (
        db.query(models.JobAssignment)
        .options(
            joinedload(models.JobAssignment.contact),
            joinedload(models.JobAssignment.assignee),
            joinedload(models.JobAssignment.technicians).joinedload(models.JobTechnician.technician),
        )
        .filter(
            models.JobAssignment.scheduled_at >= start,
            models.JobAssignment.scheduled_at <= end,
        )
        .order_by(models.JobAssignment.scheduled_at.asc())
        .all()
    )


@router.get("/{job_id}", response_model=schemas.JobAssignment)
def get_job(job_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    job = _load_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/", response_model=schemas.JobAssignment)
def create_job(
    job: schemas.JobAssignmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_job = models.JobAssignment(**job.model_dump(), created_by=current_user.id)
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return _load_job(db, db_job.id)


@router.put("/{job_id}", response_model=schemas.JobAssignment)
def update_job(
    job_id: int,
    job: schemas.JobAssignmentUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    db_job = db.query(models.JobAssignment).filter(models.JobAssignment.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    for k, v in job.model_dump(exclude_unset=True).items():
        setattr(db_job, k, v)
    db.commit()
    return _load_job(db, job_id)


@router.patch("/{job_id}/status")
def update_status(
    job_id: int,
    status: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of {VALID_STATUSES}")
    db_job = db.query(models.JobAssignment).filter(models.JobAssignment.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    db_job.status = status
    if status == "completed":
        db_job.completed_at = datetime.utcnow()
    db.commit()
    return {"status": status}


@router.post("/{job_id}/technicians/{tech_id}", response_model=schemas.JobAssignment)
def assign_technician(
    job_id: int,
    tech_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    job = db.query(models.JobAssignment).filter(models.JobAssignment.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    tech = db.query(models.User).filter(models.User.id == tech_id).first()
    if not tech:
        raise HTTPException(status_code=404, detail="Technician not found")
    existing = db.query(models.JobTechnician).filter(
        models.JobTechnician.job_id == job_id,
        models.JobTechnician.technician_id == tech_id,
    ).first()
    if not existing:
        db.add(models.JobTechnician(job_id=job_id, technician_id=tech_id))
        db.commit()
    return _load_job(db, job_id)


@router.delete("/{job_id}/technicians/{tech_id}", response_model=schemas.JobAssignment)
def unassign_technician(
    job_id: int,
    tech_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = db.query(models.JobTechnician).filter(
        models.JobTechnician.job_id == job_id,
        models.JobTechnician.technician_id == tech_id,
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return _load_job(db, job_id)


@router.delete("/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    db_job = db.query(models.JobAssignment).filter(models.JobAssignment.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(db_job)
    db.commit()
    return {"message": "Deleted"}


# ── Shifts ────────────────────────────────────────────────────────────────────

@router.get("/shifts/{date_str}", response_model=List[schemas.TechnicianShiftOut])
def get_shifts(date_str: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return (
        db.query(models.TechnicianShift)
        .options(joinedload(models.TechnicianShift.user))
        .filter(models.TechnicianShift.date == date_str)
        .all()
    )


@router.post("/shifts", response_model=schemas.TechnicianShiftOut)
def set_shift(
    payload: schemas.TechnicianShiftCreate,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    existing = db.query(models.TechnicianShift).filter(
        models.TechnicianShift.user_id == payload.user_id,
        models.TechnicianShift.date == payload.date,
    ).first()
    if existing:
        existing.status = payload.status
        db.commit()
        db.refresh(existing)
        return existing
    shift = models.TechnicianShift(**payload.model_dump())
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.delete("/shifts/{shift_id}")
def delete_shift(shift_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    shift = db.query(models.TechnicianShift).filter(models.TechnicianShift.id == shift_id).first()
    if shift:
        db.delete(shift)
        db.commit()
    return {"message": "Deleted"}
