from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from collections import defaultdict
import csv, io
from database import get_db
import models
import schemas
from auth import get_current_user, require_admin

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


def _own_contact(contact, user):
    """Return True if user owns this contact."""
    return contact.created_by == user.id


def geocode_address(address: str):
    """Return (lat, lng) for a given address, or (None, None) on failure.

    Tries progressively broader queries so partial Quebec addresses still resolve:
    1. Exact address as given
    2. Address + ", Quebec, Canada"
    3. Address + ", Québec, Canada"
    4. Address + ", Montreal, Quebec, Canada"
    """
    if not address or not address.strip():
        return None, None
    import time
    try:
        from geopy.geocoders import Nominatim
        geolocator = Nominatim(user_agent="crmwmb/1.0", timeout=8)

        # Already contains province/country info — try as-is first
        candidates = [address]

        addr_lower = address.lower()
        already_has_region = any(k in addr_lower for k in ["quebec", "québec", "qc", "ontario", "canada"])
        if not already_has_region:
            candidates += [
                f"{address}, Québec, Canada",
                f"{address}, Quebec, Canada",
                f"{address}, Montreal, Quebec, Canada",
            ]

        for query in candidates:
            try:
                location = geolocator.geocode(query, country_codes="ca")
                if location:
                    return location.latitude, location.longitude
                time.sleep(1)  # Nominatim rate limit between attempts
            except Exception:
                time.sleep(1)
    except Exception:
        pass
    return None, None


@router.get("/", response_model=List[schemas.Contact])
def list_contacts(
    search: Optional[str] = None,
    status: Optional[str] = None,
    company_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.Contact).options(joinedload(models.Contact.company))
    # Admin sees all contacts; everyone else only sees their own
    if current_user.role != "admin":
        q = q.filter(models.Contact.created_by == current_user.id)
    if search:
        q = q.filter(
            models.Contact.first_name.ilike(f"%{search}%")
            | models.Contact.last_name.ilike(f"%{search}%")
            | models.Contact.email.ilike(f"%{search}%")
            | models.Contact.phone.ilike(f"%{search}%")
            | models.Contact.address.ilike(f"%{search}%")
            | models.Contact.services.ilike(f"%{search}%")
        )
    if status:
        q = q.filter(models.Contact.status == status)
    if company_id:
        q = q.filter(models.Contact.company_id == company_id)
    return q.order_by(models.Contact.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/{contact_id}", response_model=schemas.Contact)
def get_contact(contact_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    c = db.query(models.Contact).options(joinedload(models.Contact.company)).filter(models.Contact.id == contact_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    if not _own_contact(c, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    return c


@router.post("/", response_model=schemas.Contact)
def create_contact(contact: schemas.ContactCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    lat, lng = geocode_address(contact.address)
    db_contact = models.Contact(
        **contact.model_dump(),
        lat=lat,
        lng=lng,
        created_by=current_user.id,
    )
    db.add(db_contact)
    db.commit()
    db.refresh(db_contact)
    return db_contact


@router.put("/{contact_id}", response_model=schemas.Contact)
def update_contact(contact_id: int, contact: schemas.ContactUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if not _own_contact(db_contact, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    data = contact.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(db_contact, k, v)
    # Re-geocode if address was updated
    if "address" in data:
        lat, lng = geocode_address(data["address"])
        db_contact.lat = lat
        db_contact.lng = lng
    db.commit()
    db.refresh(db_contact)
    return db_contact


@router.delete("/{contact_id}")
def delete_contact(contact_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if not _own_contact(db_contact, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(db_contact)
    db.commit()
    return {"message": "Deleted"}


@router.post("/mark-all-customer")
def mark_all_customer(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Admin-only: set every contact's status to 'customer' (Closed Customer)."""
    updated = (
        db.query(models.Contact)
        .filter(models.Contact.status != "customer")
        .update({"status": "customer"}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated, "message": f"{updated} contact(s) marked as Customer"}


@router.post("/deduplicate")
def deduplicate_contacts(    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Admin-only: delete duplicate contacts keeping the oldest (lowest id) per unique name."""
    all_contacts = db.query(models.Contact).order_by(models.Contact.id.asc()).all()

    # Group by normalized full name
    groups = defaultdict(list)
    for c in all_contacts:
        key = f"{(c.first_name or '').strip().lower()} {(c.last_name or '').strip().lower()}".strip()
        groups[key].append(c)

    deleted = 0
    for key, group in groups.items():
        if len(group) <= 1:
            continue
        # Keep first (lowest id), delete the rest
        for duplicate in group[1:]:
            db.delete(duplicate)
            deleted += 1

    db.commit()
    return {"deleted": deleted, "message": f"Removed {deleted} duplicate contact(s)"}


@router.get("/export/csv")
def export_contacts_csv(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    q = db.query(models.Contact).options(joinedload(models.Contact.company))
    if current_user.role != "admin":
        q = q.filter(models.Contact.created_by == current_user.id)
    contacts = q.order_by(models.Contact.created_at.desc()).all()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Name", "adresse", "Phone number", "services", "price", "note", "status"])
    for c in contacts:
        full_name = f"{c.first_name} {c.last_name or ''}".strip()
        w.writerow([
            full_name, c.address or "", c.phone or "",
            c.services or "", c.price if c.price is not None else "",
            c.notes or "", c.status,
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
        # Support both original column names and CSV export format
        name_raw = (row.get("Name") or row.get("name") or "").strip()
        first_raw = (row.get("first_name") or "").strip()

        if name_raw:
            parts = name_raw.split(" ", 1)
            first = parts[0]
            last = parts[1] if len(parts) > 1 else None
        elif first_raw:
            first = first_raw
            last = (row.get("last_name") or "").strip() or None
        else:
            continue  # skip rows with no name

        # Parse price — handles "$350,00" (French-Canadian) or "350.00"
        price_raw = (row.get("price") or row.get("Price") or "").strip()
        price = None
        if price_raw:
            try:
                price = float(price_raw.replace("$", "").replace(",", ".").strip())
            except ValueError:
                price = None

        status = (row.get("status") or "lead").strip().lower()
        if status not in VALID_STATUSES:
            status = "lead"

        address = (row.get("adresse") or row.get("address") or row.get("Address") or "").strip() or None

        # Geocode each address (best-effort — skipped on error)
        lat, lng = geocode_address(address)

        db.add(models.Contact(
            first_name=first,
            last_name=last,
            email=(row.get("email") or row.get("Email") or "").strip() or None,
            phone=(row.get("Phone number") or row.get("phone") or row.get("Phone") or "").strip() or None,
            address=address,
            services=(row.get("services") or row.get("Services") or "").strip() or None,
            price=price,
            lat=lat,
            lng=lng,
            notes=(row.get("note") or row.get("notes") or row.get("Notes") or "").strip() or None,
            status=status,
            created_by=current_user.id,
        ))
        created += 1

    db.commit()
    return {"imported": created}


@router.post("/geocode-all")
def geocode_all_contacts(
    force: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Geocode contacts with an address. Pass ?force=true to re-geocode all, including already geocoded ones."""
    q = db.query(models.Contact).filter(
        models.Contact.address.isnot(None),
        models.Contact.address != "",
    )
    if not force:
        q = q.filter(
            (models.Contact.lat == None) | (models.Contact.lng == None)
        )
    contacts = q.all()
    updated = 0
    for c in contacts:
        lat, lng = geocode_address(c.address)
        if lat and lng:
            c.lat = lat
            c.lng = lng
            updated += 1
        time.sleep(1)  # Nominatim rate-limit: 1 req/s
    db.commit()
    return {"geocoded": updated, "total": len(contacts)}
