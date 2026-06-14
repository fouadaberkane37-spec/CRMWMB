import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from collections import defaultdict
from datetime import datetime
import csv, io
from database import get_db, SessionLocal
import models
import schemas
from auth import get_current_user, require_admin

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/contacts", tags=["contacts"])


def _own_contact(contact, user):
    """Return True if admin or owner."""
    return user.role in ("admin", "ceo") or contact.created_by == user.id


def geocode_address(address: str):
    """Geocode an address in the Greater Montreal / Laurentians area.

    Tries city-specific queries (Saint-Jérôme, Laval, Montreal) first,
    then falls back to a viewbox-biased broad search.
    Results are validated against the area bounding box.
    """
    import requests, time

    if not address or not address.strip():
        return None, None
    if len(address) > 500:
        return None, None  # Reject oversized input — prevent request amplification

    # Bounding box: Saint-Jérôme (N) → South Shore (S), Vaudreuil (W) → Repentigny (E)
    # lat 45.2–46.1, lon -74.7 to -73.3
    VIEWBOX = "-74.7,46.1,-73.3,45.2"   # Nominatim: left,top,right,bottom
    BBOX    = "-74.7,45.2,-73.3,46.1"   # Photon: minLon,minLat,maxLon,maxLat

    def _in_area(lat, lng):
        return 45.2 <= lat <= 46.1 and -74.7 <= lng <= -73.3

    addr = address.strip()
    for tail in [", canada", ", québec", ", quebec", ", qc", ", ontario", ", on"]:
        if addr.lower().endswith(tail):
            addr = addr[: -len(tail)].strip().rstrip(",").strip()
            break

    HEADERS = {"User-Agent": "CRMWMB/1.0 groupewmb@gmail.com"}

    # ── Nominatim — city-specific first, then broad ────────────────────────────
    city_suffixes = [
        "Saint-Jérôme, Quebec, Canada",
        "Saint-Jerome, Quebec, Canada",
        "Laval, Quebec, Canada",
        "Montreal, Quebec, Canada",
        "Quebec, Canada",           # broad — viewbox provides geographic bias
    ]
    for suffix in city_suffixes:
        query = f"{addr}, {suffix}"
        try:
            r = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": query,
                    "format": "json",
                    "limit": 3,
                    "countrycodes": "ca",
                    "viewbox": VIEWBOX,
                    # no bounded=1 so Nominatim isn't silently dropping valid results
                },
                headers=HEADERS,
                timeout=8,
            )
            if r.ok:
                for hit in r.json():
                    lat, lng = float(hit["lat"]), float(hit["lon"])
                    if _in_area(lat, lng):
                        return lat, lng
        except Exception:
            pass
        time.sleep(1)

    # ── Photon fallback ────────────────────────────────────────────────────────
    for city in ["Saint-Jérôme, Quebec", "Laval, Quebec", "Montreal, Quebec"]:
        try:
            r = requests.get(
                "https://photon.komoot.io/api/",
                params={"q": f"{addr}, {city}", "limit": 5, "lang": "fr",
                        "bbox": BBOX},
                headers=HEADERS,
                timeout=8,
            )
            if r.ok:
                for feat in r.json().get("features", []):
                    coords = feat["geometry"]["coordinates"]
                    lng2, lat2 = float(coords[0]), float(coords[1])
                    if _in_area(lat2, lng2):
                        return lat2, lng2
        except Exception:
            pass
        time.sleep(1)

    return None, None


@router.get("/", response_model=List[schemas.Contact])
def list_contacts(
    search: Optional[str] = None,
    status: Optional[str] = None,
    company_id: Optional[int] = None,
    trashed: bool = False,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(models.Contact).options(joinedload(models.Contact.company))
    # Filter by trash state — wrapped in try/except in case column not yet migrated
    try:
        if trashed:
            q = q.filter(models.Contact.deleted_at.isnot(None))
        else:
            q = q.filter(models.Contact.deleted_at.is_(None))
    except Exception:
        pass  # Column missing — return all contacts until migration runs
    # Admin sees all; others see only their own
    if current_user.role not in ("admin", "ceo"):
        q = q.filter(models.Contact.created_by == current_user.id)
    if search:
        if len(search) > 100:
            raise HTTPException(status_code=400, detail="Search query too long (max 100 characters)")
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
    if db_contact.deleted_at is not None:
        raise HTTPException(status_code=410, detail="Contact has been deleted")
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


class _LocationBody(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


@router.patch("/{contact_id}/location")
def update_contact_location(
    contact_id: int,
    body: _LocationBody,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Manually set lat/lng for a contact (drag-to-reposition on map)."""
    db_contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if not _own_contact(db_contact, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    db_contact.lat = body.lat
    db_contact.lng = body.lng
    db.commit()
    return {"lat": db_contact.lat, "lng": db_contact.lng}


@router.delete("/{contact_id}")
def delete_contact(contact_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Soft-delete: moves contact to trash."""
    db_contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if not _own_contact(db_contact, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    db_contact.deleted_at = datetime.utcnow()
    # Cascade: stage open deals to "lost" so they don't float without a contact
    db.query(models.Deal).filter(
        models.Deal.contact_id == db_contact.id,
        models.Deal.stage.notin_(["won", "lost"]),
    ).update({"stage": "lost"})
    db.commit()
    return {"message": "Moved to trash"}


@router.post("/{contact_id}/restore")
def restore_contact(contact_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Recover a trashed contact."""
    db_contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if not _own_contact(db_contact, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    db_contact.deleted_at = None
    db.commit()
    return {"message": "Restored"}


@router.delete("/{contact_id}/permanent")
def permanent_delete(contact_id: int, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    """Hard-delete: permanently removes contact and all associated data. Admin-only."""
    db_contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    # Cascade delete everything linked to this contact
    # 1. Get deal IDs so we can delete their activities too
    deal_ids = [d.id for d in db.query(models.Deal.id).filter(models.Deal.contact_id == contact_id).all()]
    # 2. Delete activities linked to those deals
    if deal_ids:
        db.query(models.Activity).filter(models.Activity.deal_id.in_(deal_ids)).delete(synchronize_session=False)
    # 3. Delete activities linked directly to contact
    db.query(models.Activity).filter(models.Activity.contact_id == contact_id).delete(synchronize_session=False)
    # 4. Delete chat messages
    db.query(models.ChatMessage).filter(models.ChatMessage.contact_id == contact_id).delete(synchronize_session=False)
    # 5. Delete deals (removes from calendar)
    db.query(models.Deal).filter(models.Deal.contact_id == contact_id).delete(synchronize_session=False)
    # 6. Unlink knock pins (keep the pin, remove contact association)
    db.query(models.Knock).filter(models.Knock.contact_id == contact_id).update({"contact_id": None}, synchronize_session=False)
    # 7. Delete contact
    db.delete(db_contact)
    db.commit()
    log.warning("[AUDIT] Permanent delete contact_id=%s by admin_id=%s", contact_id, current_user.id)
    return {"message": "Permanently deleted"}


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
    if current_user.role not in ("admin", "ceo"):
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
    MAX_CSV_BYTES = 5 * 1024 * 1024  # 5 MB
    if file.content_type and file.content_type not in ("text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(status_code=400, detail="CSV file too large (max 5 MB)")
    try:
        csv_text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV file must be valid UTF-8")
    try:
        reader = csv.DictReader(io.StringIO(csv_text))
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


def _run_geocode_all(contact_ids: list):
    """Background worker — geocodes contacts one by one, writes each result immediately."""
    import time
    db = SessionLocal()
    try:
        for cid in contact_ids:
            c = db.query(models.Contact).filter(models.Contact.id == cid).first()
            if not c or not c.address:
                continue
            lat, lng = geocode_address(c.address)
            if lat and lng:
                c.lat = lat
                c.lng = lng
                db.commit()
            time.sleep(1)  # Nominatim rate limit: 1 req/s
    except Exception as e:
        print(f"[ERR] background geocode: {e}")
        db.rollback()
    finally:
        db.close()


@router.post("/geocode-all")
def geocode_all_contacts(
    background_tasks: BackgroundTasks,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """Start background geocoding. Returns immediately; pins appear on map as they resolve."""
    q = db.query(models.Contact).filter(
        models.Contact.address.isnot(None),
        models.Contact.address != "",
    )
    if not force:
        q = q.filter(
            (models.Contact.lat == None) | (models.Contact.lng == None)
        )
    contact_ids = [c.id for c in q.all()]
    if not contact_ids:
        return {"status": "nothing_to_geocode", "total": 0}
    background_tasks.add_task(_run_geocode_all, contact_ids)
    return {"status": "started", "total": len(contact_ids)}


# ── Bulk service update from external list ────────────────────────────────────

_SERVICE_MAP = {
    "window - ext":       "window-ext",
    "window - int":       "window-int",
    "window-ext":         "window-ext",
    "window-int":         "window-int",
    "gutters":            "gutters",
    "pressure washing":   "pressure-washing",
    "pressure-washing":   "pressure-washing",
}

def _digits(phone: str) -> str:
    """Strip everything except digits."""
    return "".join(c for c in (phone or "") if c.isdigit())

def _norm_services(raw: str) -> str:
    """'window - ext, gutters' → 'window-ext,gutters'"""
    parts = [p.strip().lower() for p in raw.split(",")]
    mapped = [_SERVICE_MAP.get(p, p) for p in parts if p]
    return ",".join(dict.fromkeys(mapped))  # deduplicate, preserve order

def _find_contact(db: Session, phone: str, name: str, address: str):
    """Try phone first, then name+address fuzzy match."""
    digits = _digits(phone)
    if digits:
        all_c = db.query(models.Contact).filter(models.Contact.deleted_at == None).all()
        for c in all_c:
            if _digits(c.phone) == digits:
                return c
        # Try last 10 digits (strip country code)
        short = digits[-10:]
        for c in all_c:
            if _digits(c.phone or "")[-10:] == short:
                return c

    # Fallback: name match
    parts = name.lower().split()
    all_c = db.query(models.Contact).filter(models.Contact.deleted_at == None).all()
    for c in all_c:
        full = f"{c.first_name or ''} {c.last_name or ''}".lower()
        if all(p in full for p in parts):
            return c

    return None


@router.post("/bulk-update-services")
def bulk_update_services(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    """One-time: match and update services + price for the 26 booked clients."""
    CLIENTS = [
        {"name": "Jonathan Pinel",       "phone": "14383567334",  "address": "1184 Rue des Îles, St-Jérôme",      "services": "window - ext",                    "price": 350.00,  "notes": ""},
        {"name": "Marie-Claude Lemonde", "phone": "15149450536",  "address": "2400 du Passerin",                  "services": "window - ext",                    "price": 300.00,  "notes": ""},
        {"name": "Jean Lortie",          "phone": "15142321088",  "address": "2311 rue de Prague",                "services": "window - ext",                    "price": 315.00,  "notes": "lortiejj@gmail.com"},
        {"name": "Arman Puzantyan",      "phone": "15142368223",  "address": "5850 Boul des rossignoles",         "services": "window - ext",                    "price": 375.00,  "notes": ""},
        {"name": "David",                "phone": "18198205096",  "address": "8180 Rue des Bungalows, Laval",     "services": "window - ext",                    "price": 350.00,  "notes": ""},
        {"name": "Jean",                 "phone": "15149289227",  "address": "705 Rue la Bruyère, Laval",         "services": "window - ext",                    "price": 350.00,  "notes": ""},
        {"name": "Francois Giroux",      "phone": "15149104322",  "address": "590 rue bayard",                    "services": "window - ext",                    "price": 400.01,  "notes": ""},
        {"name": "Chrystian",            "phone": "15147545542",  "address": "525 rue bayard",                    "services": "window - ext, window - int",      "price": 350.00,  "notes": "installation de terrasse avec vitre — faire soumission"},
        {"name": "Sébastien Isabelle",   "phone": "14505126439",  "address": "479 rue des villa",                 "services": "window - ext, gutters",           "price": 500.00,  "notes": ""},
        {"name": "Bernard Chiasson",     "phone": "15147554876",  "address": "682 chenonsson",                    "services": "window - ext",                    "price": 299.00,  "notes": ""},
        {"name": "Marie-claude",         "phone": "15145317460",  "address": "10207 Fabre",                       "services": "window - ext, window - int",      "price": 350.00,  "notes": ""},
        {"name": "Dominic David",        "phone": "15142200127",  "address": "120 place Gravie",                  "services": "window - ext, window - int",      "price": 500.00,  "notes": ""},
        {"name": "Frederic Bergeron",    "phone": "15142675488",  "address": "100 rue saint-Pierre est, Saint-Sauveur", "services": "window - ext, window - int", "price": 350.00, "notes": ""},
        {"name": "Genevieve",            "phone": "15147955593",  "address": "378 chemin de l'heritage",          "services": "window - ext",                    "price": 350.00,  "notes": ""},
        {"name": "Vincent Bernier",      "phone": "14189978725",  "address": "17190 rue des orquide",             "services": "window - ext",                    "price": 340.00,  "notes": ""},
        {"name": "Louis Philipe Giguere","phone": "15149281455",  "address": "11630 rue du platine",              "services": "window - ext, gutters",           "price": 300.00,  "notes": ""},
        {"name": "Tammy Zacard",         "phone": "15149266953",  "address": "16805 rue des saphires",            "services": "window - ext",                    "price": 311.00,  "notes": ""},
        {"name": "Jimmy Argyriou",       "phone": "15148933929",  "address": "91 chem de la galène bleue",        "services": "window - ext, window - int",      "price": 300.00,  "notes": ""},
        {"name": "Diane Roy",            "phone": "15149421157",  "address": "1296 garden",                       "services": "window - ext, window - int",      "price": 450.00,  "notes": ""},
        {"name": "Magalie",              "phone": "14388718857",  "address": "45 terrasses d'auteuil",            "services": "window - ext",                    "price": 350.00,  "notes": ""},
        {"name": "Alain Poirier",        "phone": "15149680123",  "address": "11940 rue rubis",                   "services": "window - ext",                    "price": 350.00,  "notes": ""},
        {"name": "Marc Grégoire",        "phone": "5149092139",   "address": "380 place charmante",               "services": "window - ext, pressure washing",  "price": 510.00,  "notes": "réévaluation des travaux"},
        {"name": "José Drapeau",         "phone": "5142462401",   "address": "684 cornouille",                    "services": "window - ext",                    "price": 300.00,  "notes": ""},
        {"name": "Perry Kioussis",       "phone": "15148231191",  "address": "265 Montreuil",                     "services": "window - ext",                    "price": 300.00,  "notes": ""},
        {"name": "Vicky",                "phone": "15142394752",  "address": "7 Premier Avenue, Laval",           "services": "window - ext",                    "price": 250.00,  "notes": ""},
        {"name": "Raynald Langlois",     "phone": "15793683607",  "address": "16230 rue de l'esplanade",         "services": "window - ext, gutters",           "price": 500.00,  "notes": ""},
    ]

    updated, created, skipped = [], [], []

    for row in CLIENTS:
        services_str = _norm_services(row["services"])
        contact = _find_contact(db, row["phone"], row["name"], row["address"])

        if contact:
            contact.services = services_str
            if row["price"]:
                contact.price = row["price"]
            if row["notes"] and row["notes"] not in ("-", "—", ""):
                contact.notes = row["notes"]
            updated.append({"name": row["name"], "id": contact.id, "matched_by": "phone/name"})
        else:
            # Create as new contact
            name_parts = row["name"].split(" ", 1)
            c = models.Contact(
                first_name=name_parts[0],
                last_name=name_parts[1] if len(name_parts) > 1 else None,
                phone=row["phone"],
                address=row["address"],
                services=services_str,
                price=row["price"],
                notes=row["notes"] if row["notes"] not in ("-", "—", "") else None,
                status="customer",
                created_by=current_user.id,
            )
            db.add(c)
            created.append({"name": row["name"]})

    db.commit()
    log.warning("[AUDIT] bulk-update-services by admin_id=%s: updated=%d created=%d", current_user.id, len(updated), len(created))
    return {
        "ok": True,
        "updated": len(updated),
        "created": len(created),
        "details_updated": updated,
        "details_created": created,
    }
