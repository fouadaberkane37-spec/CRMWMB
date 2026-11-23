"""Customer hub (Blue work "Customers"): lifecycle list, overview, properties."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db

router = APIRouter(prefix="/api/customers", tags=["customers"])

LIFECYCLES = ("new", "upcoming", "active_plan", "past")


class PropertyIn(BaseModel):
    label: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    notes: Optional[str] = None
    is_primary: Optional[bool] = None


def _dump(body, **kw):
    return body.model_dump(**kw) if hasattr(body, "model_dump") else body.dict(**kw)


def _name(c) -> str:
    return f"{c.first_name or ''} {c.last_name or ''}".strip()


def _iso(d):
    return d.isoformat() if d else None


def _city_from(addr: Optional[str]) -> Optional[str]:
    if not addr:
        return None
    parts = [p.strip() for p in addr.split(",") if p.strip()]
    return parts[1] if len(parts) >= 2 else None


def ser_property(p) -> dict:
    return {"id": p.id, "contact_id": p.contact_id, "label": p.label, "address": p.address,
            "city": p.city, "postal_code": p.postal_code, "lat": p.lat, "lng": p.lng,
            "notes": p.notes, "is_primary": bool(p.is_primary)}


def ensure_properties(db: Session, c: models.Contact):
    props = db.query(models.Property).filter(models.Property.contact_id == c.id).order_by(models.Property.id).all()
    if not props and c.address:
        p = models.Property(contact_id=c.id, label="Principale", address=c.address,
                            city=_city_from(c.address), lat=c.lat, lng=c.lng, is_primary=True)
        db.add(p)
        db.commit()
        db.refresh(p)
        props = [p]
    return props


def _contact(db, contact_id) -> models.Contact:
    c = db.query(models.Contact).filter(models.Contact.id == contact_id, models.Contact.deleted_at.is_(None)).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    return c


def lifecycle_of(has_jobs: bool, has_upcoming: bool, has_plan: bool) -> str:
    if has_plan:
        return "active_plan"
    if has_upcoming:
        return "upcoming"
    if not has_jobs:
        return "new"
    return "past"


def _stats_maps(db: Session):
    now = datetime.utcnow()
    jobs = {}
    for d in db.query(models.Deal).filter(models.Deal.contact_id.isnot(None)).all():
        if d.job_status == "cancelled":
            continue
        j = jobs.setdefault(d.contact_id, {"count": 0, "upcoming": [], "past": [], "done": {}})
        j["count"] += 1
        dt = d.expected_close_date
        if d.job_status != "done" and (dt is None or dt >= now):
            j["upcoming"].append(dt)
        elif dt:
            j["past"].append(dt)
        if d.job_status == "done":
            j["done"][d.id] = d.value or 0
    paid, inv_deals = {}, {}
    for i in db.query(models.Invoice).all():
        paid[i.contact_id] = paid.get(i.contact_id, 0) + (i.paid_cents or 0)
        if i.deal_id and i.paid_cents:
            inv_deals.setdefault(i.contact_id, set()).add(i.deal_id)
    plans = {r[0] for r in db.query(models.ServicePlan.contact_id).filter(models.ServicePlan.status == "active").all()}
    return jobs, paid, inv_deals, plans


@router.get("/")
def list_customers(lifecycle: Optional[str] = None, tag: Optional[str] = None, search: Optional[str] = None,
                   limit: int = 50, offset: int = 0,
                   db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(models.Contact).filter(models.Contact.deleted_at.is_(None))
    if search:
        s = f"%{search}%"
        q = q.filter(or_(models.Contact.first_name.ilike(s), models.Contact.last_name.ilike(s),
                         models.Contact.phone.ilike(s), models.Contact.email.ilike(s), models.Contact.address.ilike(s)))
    contacts = q.order_by(models.Contact.first_name, models.Contact.last_name).all()
    if tag:
        t = tag.strip().lower()
        contacts = [c for c in contacts if t in [x.strip().lower() for x in (c.tags or "").split(",")]]
    jobs, paid, inv_deals, plans = _stats_maps(db)
    rows, counts = [], {k: 0 for k in LIFECYCLES}
    for c in contacts:
        j = jobs.get(c.id)
        lc = lifecycle_of(bool(j), bool(j and j["upcoming"]), c.id in plans)
        counts[lc] += 1
        ups = sorted(x for x in (j["upcoming"] if j else []) if x)
        past = sorted(j["past"]) if j else []
        done_val = sum(v for did, v in (j["done"] if j else {}).items() if did not in inv_deals.get(c.id, set()))
        rows.append({
            "id": c.id, "name": _name(c), "first_name": c.first_name, "last_name": c.last_name,
            "phone": c.phone, "email": c.email, "address": c.address, "city": _city_from(c.address),
            "tags": [x.strip() for x in (c.tags or "").split(",") if x.strip()],
            "status": c.status, "lifecycle": lc, "job_count": j["count"] if j else 0,
            "next_job": _iso(ups[0]) if ups else None, "last_job": _iso(past[-1]) if past else None,
            "total_spent": round(paid.get(c.id, 0) / 100 + done_val, 2),
        })
    total_all = len(rows)
    if lifecycle:
        rows = [r for r in rows if r["lifecycle"] == lifecycle]
    return {"customers": rows[offset:offset + limit], "total": len(rows), "total_all": total_all, "counts": counts}


@router.get("/{contact_id}/overview")
def overview(contact_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = _contact(db, contact_id)
    props = ensure_properties(db, c)
    deals = db.query(models.Deal).filter(models.Deal.contact_id == c.id).order_by(models.Deal.expected_close_date.desc()).all()
    quotes = db.query(models.Quote).filter(models.Quote.contact_id == c.id).order_by(models.Quote.created_at.desc()).all()
    invoices = db.query(models.Invoice).filter(models.Invoice.contact_id == c.id).order_by(models.Invoice.created_at.desc()).all()
    plans = db.query(models.ServicePlan).filter(models.ServicePlan.contact_id == c.id).order_by(models.ServicePlan.created_at.desc()).all()
    msgs = db.query(models.ChatMessage).filter(models.ChatMessage.contact_id == c.id).order_by(models.ChatMessage.created_at.desc()).limit(20).all()

    now = datetime.utcnow()
    live = [d for d in deals if d.job_status != "cancelled"]
    has_up = any(d.job_status != "done" and (d.expected_close_date is None or d.expected_close_date >= now) for d in live)
    has_plan = any(p.status == "active" for p in plans)
    inv_deal_ids = {i.deal_id for i in invoices if i.deal_id and i.paid_cents}
    ltv = sum(i.paid_cents or 0 for i in invoices) / 100 + sum(
        (d.value or 0) for d in live if d.job_status == "done" and d.id not in inv_deal_ids)
    balance = sum(max((i.total_cents or 0) - (i.paid_cents or 0), 0)
                  for i in invoices if i.status not in ("draft", "cancelled", "refunded"))

    contact = {k: getattr(c, k) for k in ("id", "first_name", "last_name", "email", "phone", "address", "status",
                                          "language", "notes", "source", "sms_opt_out", "lat", "lng")}
    contact["name"] = _name(c)
    contact["tags"] = [x.strip() for x in (c.tags or "").split(",") if x.strip()]
    return {
        "contact": contact,
        "lifecycle": lifecycle_of(bool(live), has_up, has_plan),
        "properties": [ser_property(p) for p in props],
        "jobs": [{"id": d.id, "title": d.title, "value": d.value, "job_status": d.job_status,
                  "date": _iso(d.expected_close_date), "estimated_minutes": d.estimated_minutes} for d in deals],
        "quotes": [{"id": q.id, "number": q.number, "status": q.status, "title": q.title,
                    "total_cents": q.total_cents, "created_at": _iso(q.created_at)} for q in quotes],
        "invoices": [{"id": i.id, "number": i.number, "status": i.status, "total_cents": i.total_cents,
                      "paid_cents": i.paid_cents, "due_date": _iso(i.due_date), "created_at": _iso(i.created_at)}
                     for i in invoices],
        "plans": [{"id": p.id, "name": p.name, "status": p.status, "visits_per_year": p.visits_per_year,
                   "price_cents": p.price_cents, "billing_frequency": p.billing_frequency,
                   "token": p.token} for p in plans],
        "messages": [{"id": m.id, "body": m.body, "direction": m.direction, "created_at": _iso(m.created_at)}
                     for m in reversed(msgs)],
        "stats": {"lifetime_value": round(ltv, 2), "balance_due_cents": balance, "job_count": len(live),
                  "quote_count": len(quotes), "invoice_count": len(invoices)},
    }


@router.get("/{contact_id}/properties")
def list_properties(contact_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return [ser_property(p) for p in ensure_properties(db, _contact(db, contact_id))]


@router.post("/{contact_id}/properties")
def create_property(contact_id: int, body: PropertyIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    c = _contact(db, contact_id)
    if not body.address:
        raise HTTPException(400, "address required")
    existing = ensure_properties(db, c)
    data = _dump(body)
    data["is_primary"] = bool(data.get("is_primary")) or not existing
    if data["is_primary"]:
        db.query(models.Property).filter(models.Property.contact_id == c.id).update({"is_primary": False})
    p = models.Property(contact_id=c.id, **data)
    db.add(p)
    db.commit()
    db.refresh(p)
    return ser_property(p)


@router.put("/properties/{property_id}")
def update_property(property_id: int, body: PropertyIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = db.get(models.Property, property_id)
    if not p:
        raise HTTPException(404, "Property not found")
    data = _dump(body, exclude_unset=True)
    if data.get("is_primary"):
        db.query(models.Property).filter(models.Property.contact_id == p.contact_id).update({"is_primary": False})
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return ser_property(p)


@router.delete("/properties/{property_id}")
def delete_property(property_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = db.get(models.Property, property_id)
    if not p:
        raise HTTPException(404, "Property not found")
    cid, was_primary = p.contact_id, p.is_primary
    db.delete(p)
    db.commit()
    if was_primary:
        nxt = db.query(models.Property).filter(models.Property.contact_id == cid).order_by(models.Property.id).first()
        if nxt:
            nxt.is_primary = True
            db.commit()
    return {"ok": True}
