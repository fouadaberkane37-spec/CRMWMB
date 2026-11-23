"""Service plans (recurring agreements) — admin routes + public signing page."""
from datetime import datetime, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from money import new_token

router = APIRouter(prefix="/api/service-plans", tags=["service-plans"])
public_router = APIRouter(prefix="/api/public/plans", tags=["service-plans-public"])

FREQS = ("per_visit", "monthly", "yearly")
STATUSES = ("draft", "sent", "active", "past_due", "cancelled", "expired")


class PlanIn(BaseModel):
    contact_id: Optional[int] = None
    property_id: Optional[int] = None
    name: Optional[str] = None
    status: Optional[str] = None
    included_services: Optional[str] = None
    visits_per_year: Optional[int] = None
    price_cents: Optional[int] = None
    billing_frequency: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    terms: Optional[str] = None


class SignIn(BaseModel):
    signature_name: str
    signature_data: Optional[str] = None


def arr_cents(p) -> int:
    price = p.price_cents or 0
    visits = p.visits_per_year or 1
    if p.billing_frequency == "monthly":
        return price * 12
    if p.billing_frequency == "per_visit":
        return price * visits
    return price


def per_visit_cents(p) -> int:
    return round(arr_cents(p) / max(p.visits_per_year or 1, 1))


def ser(p, db: Session) -> dict:
    c = p.contact
    prop = db.get(models.Property, p.property_id) if p.property_id else None
    return {
        "id": p.id, "contact_id": p.contact_id,
        "contact_name": (f"{c.first_name or ''} {c.last_name or ''}".strip() if c else None),
        "property_id": p.property_id,
        "property_label": (prop.label or prop.address) if prop else None,
        "name": p.name, "status": p.status, "included_services": p.included_services,
        "visits_per_year": p.visits_per_year, "price_cents": p.price_cents,
        "billing_frequency": p.billing_frequency,
        "start_date": p.start_date.isoformat() if p.start_date else None,
        "end_date": p.end_date.isoformat() if p.end_date else None,
        "terms": p.terms, "signature_name": p.signature_name,
        "signed_at": p.signed_at.isoformat() if p.signed_at else None,
        "token": p.token, "arr_cents": arr_cents(p),
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _get(db, plan_id) -> models.ServicePlan:
    p = db.get(models.ServicePlan, plan_id)
    if not p:
        raise HTTPException(404, "Plan not found")
    return p


def plan_jobs(db: Session, plan_id: int):
    return db.query(models.Deal).filter(models.Deal.notes.like(f"%[plan:{plan_id}]%")).all()


def visit_dates(start: datetime, n: int):
    """n dates spread evenly over the Apr 1 - Nov 30 season, not before `start`."""
    y = start.year
    s = max(start.date(), date(y, 4, 1))
    e = date(y, 11, 30)
    if s > e:
        y += 1
        s, e = date(y, 4, 1), date(y, 11, 30)
    span = (e - s).days
    n = max(n, 1)
    return [datetime.combine(s + timedelta(days=int((i + 0.5) * span / n)), datetime.min.time()).replace(hour=9)
            for i in range(n)]


def activate_plan(db: Session, p: models.ServicePlan, user_id=None) -> list:
    existing = plan_jobs(db, p.id)
    if p.status == "active" and existing:
        return [d.id for d in existing]
    if not p.start_date:
        p.start_date = datetime.utcnow()
    p.status = "active"
    ids = []
    value = per_visit_cents(p) / 100
    for dt in visit_dates(p.start_date, p.visits_per_year or 1):
        if p.end_date and dt > p.end_date:
            continue
        deal = models.Deal(
            title=f"Plan: {p.name}", value=value, contact_id=p.contact_id,
            expected_close_date=dt, job_status="todo", stage="won",
            notes=f"[plan:{p.id}]", created_by=user_id,
        )
        db.add(deal)
        db.flush()
        ids.append(deal.id)
    db.commit()
    return ids


def cancel_plan(db: Session, p: models.ServicePlan) -> int:
    now = datetime.utcnow()
    removed = 0
    for d in plan_jobs(db, p.id):
        if d.job_status == "todo" and d.expected_close_date and d.expected_close_date > now:
            db.query(models.DealTechnician).filter(models.DealTechnician.deal_id == d.id).delete()
            db.query(models.LineItem).filter(models.LineItem.parent_type == "job", models.LineItem.parent_id == d.id).delete()
            db.delete(d)
            removed += 1
    p.status = "cancelled"
    db.commit()
    return removed


@router.get("/")
def list_plans(status: Optional[str] = None, contact_id: Optional[int] = None,
               db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(models.ServicePlan)
    if contact_id:
        q = q.filter(models.ServicePlan.contact_id == contact_id)
    allp = q.order_by(models.ServicePlan.created_at.desc()).all()
    counts = {}
    for p in allp:
        counts[p.status] = counts.get(p.status, 0) + 1
    rows = [p for p in allp if not status or p.status == status]
    arr = sum(arr_cents(p) for p in allp if p.status == "active")
    return {"plans": [ser(p, db) for p in rows], "counts": counts, "total": len(allp), "arr_cents": arr}


@router.get("/{plan_id}")
def get_plan(plan_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = ser(_get(db, plan_id), db)
    d["job_ids"] = [j.id for j in plan_jobs(db, plan_id)]
    return d


@router.post("/")
def create_plan(body: PlanIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not body.contact_id or not db.get(models.Contact, body.contact_id):
        raise HTTPException(400, "Valid contact_id required")
    if not body.name:
        raise HTTPException(400, "name required")
    freq = body.billing_frequency or "yearly"
    if freq not in FREQS:
        raise HTTPException(400, "Invalid billing_frequency")
    p = models.ServicePlan(
        contact_id=body.contact_id, property_id=body.property_id, name=body.name, status="draft",
        included_services=body.included_services, visits_per_year=max(body.visits_per_year or 1, 1),
        price_cents=body.price_cents or 0, billing_frequency=freq,
        start_date=body.start_date, end_date=body.end_date, terms=body.terms, token=new_token(),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return ser(p, db)


@router.put("/{plan_id}")
def update_plan(plan_id: int, body: PlanIn, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = _get(db, plan_id)
    data = body.model_dump(exclude_unset=True) if hasattr(body, "model_dump") else body.dict(exclude_unset=True)
    if data.get("billing_frequency") and data["billing_frequency"] not in FREQS:
        raise HTTPException(400, "Invalid billing_frequency")
    if data.get("status") and data["status"] not in STATUSES:
        raise HTTPException(400, "Invalid status")
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return ser(p, db)


@router.delete("/{plan_id}")
def delete_plan(plan_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = _get(db, plan_id)
    if p.status != "draft":
        raise HTTPException(400, "Only draft plans can be deleted")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/{plan_id}/send")
def send_plan(plan_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = _get(db, plan_id)
    if p.status == "draft":
        p.status = "sent"
        db.commit()
    return ser(p, db)


@router.post("/{plan_id}/activate")
def activate(plan_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = _get(db, plan_id)
    if p.status == "cancelled":
        raise HTTPException(400, "Cancelled plan cannot be activated")
    ids = activate_plan(db, p, user.id)
    return {"plan": ser(p, db), "job_ids": ids}


@router.post("/{plan_id}/cancel")
def cancel(plan_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = _get(db, plan_id)
    removed = cancel_plan(db, p)
    return {"plan": ser(p, db), "removed_jobs": removed}


# -- Public ------------------------------------------------------------------

def _by_token(db, token) -> models.ServicePlan:
    p = db.query(models.ServicePlan).filter(models.ServicePlan.token == token).first()
    if not p or p.status == "draft":
        raise HTTPException(404, "Plan not found")
    return p


def _public(p, db):
    d = ser(p, db)
    for k in ("contact_id", "token", "property_id"):
        d.pop(k, None)
    d["company"] = "ZF Entretien"
    return d


@public_router.get("/{token}")
def public_get(token: str, db: Session = Depends(get_db)):
    return _public(_by_token(db, token), db)


@public_router.post("/{token}/sign")
def public_sign(token: str, body: SignIn, db: Session = Depends(get_db)):
    p = _by_token(db, token)
    if p.status not in ("sent", "active"):
        raise HTTPException(400, "Plan cannot be signed")
    if not body.signature_name.strip():
        raise HTTPException(400, "Signature name required")
    p.signature_name = body.signature_name.strip()
    p.signature_data = body.signature_data
    p.signed_at = datetime.utcnow()
    db.commit()
    activate_plan(db, p)
    return _public(p, db)
