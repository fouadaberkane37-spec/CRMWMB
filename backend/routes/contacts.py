from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
import csv, io
from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


@router.get("/", response_model=List[schemas.Contact])
def list_contacts(
    search: Optional[str] = None,
    status: Optional[str] = None,
    company_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    q = db.query(models.Contact).options(joinedload(models.Contact.company))
    if search:
        q = q.filter(
            models.Contact.first_name.ilike(f"%{search}%")
            | models.Contact.last_name.ilike(f"%{search}%")
            | models.Contact.email.ilike(f"%{search}%")
        )
    if status:
        q = q.filter(models.Contact.status == status)
    if company_id:
        q = q.filter(models.Contact.company_id == company_id)
    return q.order_by(models.Contact.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{contact_id}", response_model=schemas.Contact)
def get_contact(contact_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = db.query(models.Contact).options(joinedload(models.Contact.company)).filter(models.Contact.id == contact_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    return c


@router.post("/", response_model=schemas.Contact)
def create_contact(contact: schemas.ContactCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_contact = models.Contact(**contact.model_dump(), created_by=current_user.id)
    db.add(db_contact)
    db.commit()
    db.refresh(db_contact)
    return db_contact


@router.put("/{contact_id}", response_model=schemas.Contact)
def update_contact(contact_id: int, contact: schemas.ContactUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    db_contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    for k, v in contact.model_dump(exclude_unset=True).items():
        setattr(db_contact, k, v)
    db.commit()
    db.refresh(db_contact)
    return db_contact


@router.delete("/{contact_id}")
def delete_contact(contact_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    db_contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(db_contact)
    db.commit()
    return {"message": "Deleted"}


@router.get("/export/csv")
def export_contacts_csv(db: Session = Depends(get_db), _=Depends(get_current_user)):
    contacts = db.query(models.Contact).options(joinedload(models.Contact.company)).order_by(models.Contact.created_at.desc()).all()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["first_name", "last_name", "email", "phone", "title", "company", "status", "notes"])
    for c in contacts:
        w.writerow([
            c.first_name, c.last_name or "", c.email or "", c.phone or "",
            c.title or "", c.company.name if c.company else "", c.status, c.notes or "",
        ])
    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=contacts.csv"},
    )


@router.post("/import/csv")
async def import_contacts_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    content = await file.read()
    try:
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse CSV file")

    VALID_STATUSES = {"lead", "prospect", "customer", "inactive"}
    created = 0
    for row in reader:
        first = (row.get("first_name") or "").strip()
        if not first:
            continue
        status = (row.get("status") or "lead").strip().lower()
        if status not in VALID_STATUSES:
            status = "lead"
        db.add(models.Contact(
            first_name=first,
            last_name=(row.get("last_name") or "").strip() or None,
            email=(row.get("email") or "").strip() or None,
            phone=(row.get("phone") or "").strip() or None,
            title=(row.get("title") or "").strip() or None,
            status=status,
            notes=(row.get("notes") or "").strip() or None,
            created_by=current_user.id,
        ))
        created += 1

    db.commit()
    return {"imported": created}
