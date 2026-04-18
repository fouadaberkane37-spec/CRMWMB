from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/", response_model=List[schemas.JobAssignment])
def list_jobs(
    assigned_to: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.JobAssignment).options(
        joinedload(models.JobAssignment.contact),
        joinedload(models.JobAssignment.assignee),
    )
    if assigned_to:
        q = q.filter(models.JobAssignment.assigned_to == assigned_to)
    if status:
        q = q.filter(models.JobAssignment.status == status)
    if priority:
        q = q.filter(models.JobAssignment.priority == priority)
    return q.order_by(models.JobAssignment.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{job_id}", response_model=schemas.JobAssignment)
def get_job(job_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    job = (
        db.query(models.JobAssignment)
        .options(joinedload(models.JobAssignment.contact), joinedload(models.JobAssignment.assignee))
        .filter(models.JobAssignment.id == job_id)
        .first()
    )
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
    return db_job


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
    db.refresh(db_job)
    return db_job


@router.patch("/{job_id}/status")
def update_status(
    job_id: int,
    status: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    valid = ["pending", "in_progress", "completed", "cancelled"]
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid}")
    db_job = db.query(models.JobAssignment).filter(models.JobAssignment.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    db_job.status = status
    if status == "completed":
        db_job.completed_at = datetime.utcnow()
    db.commit()
    return {"status": status}


@router.delete("/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    db_job = db.query(models.JobAssignment).filter(models.JobAssignment.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(db_job)
    db.commit()
    return {"message": "Deleted"}
