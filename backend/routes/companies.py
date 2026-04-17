from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/companies", tags=["companies"])

COMPANY_STAGES = {"lead", "prospect", "customer", "inactive"}


def _own_company(co: models.Company, user: models.User) -> bool:
    return user.role == "admin" or co.created_by == user.id


@router.get("/", response_model=List[schemas.Company])
def list_companies(
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if search and len(search) > 100:
        raise HTTPException(status_code=400, detail="Search query too long (max 100 characters)")
    q = db.query(models.Company)
    if current_user.role != "admin":
        q = q.filter(models.Company.created_by == current_user.id)
    if search:
        q = q.filter(models.Company.name.ilike(f"%{search}%"))
    return q.order_by(models.Company.name).offset(skip).limit(limit).all()


@router.get("/{company_id}", response_model=schemas.Company)
def get_company(company_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    c = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Company not found")
    if not _own_company(c, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    return c


@router.post("/", response_model=schemas.Company)
def create_company(company: schemas.CompanyCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_company = models.Company(**company.model_dump(), created_by=current_user.id)
    db.add(db_company)
    db.commit()
    db.refresh(db_company)
    return db_company


@router.put("/{company_id}", response_model=schemas.Company)
def update_company(company_id: int, company: schemas.CompanyUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not db_company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not _own_company(db_company, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    for k, v in company.model_dump(exclude_unset=True).items():
        setattr(db_company, k, v)
    db.commit()
    db.refresh(db_company)
    return db_company


@router.delete("/{company_id}")
def delete_company(company_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not db_company:
        raise HTTPException(status_code=404, detail="Company not found")
    if not _own_company(db_company, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(db_company)
    db.commit()
    return {"message": "Deleted"}
