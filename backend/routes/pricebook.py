"""Price book (catalogue of services) — /api/services."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user, require_admin
import models

router = APIRouter(prefix="/api/services", tags=["price-book"])

DEFAULT_SERVICES = [
    ("Lavage de vitres extérieur", "Exterior window cleaning", "windows"),
    ("Lavage de vitres intérieur", "Interior window cleaning", "windows"),
    ("Nettoyage de gouttières", "Gutter cleaning", "gutters"),
    ("Lavage à pression", "Pressure washing", "washing"),
    ("Lavage doux (soft wash)", "Soft wash", "washing"),
    ("Nettoyage de pavés-unis", "Paver cleaning", "pavers"),
    ("Rejointoiement de pavés", "Paver re-sanding", "pavers"),
]


def seed_default_services(db: Session) -> int:
    """Insert the default ZF services if the table is empty. Returns rows added."""
    if db.query(models.Service).count() > 0:
        return 0
    for pos, (name, name_en, cat) in enumerate(DEFAULT_SERVICES):
        db.add(models.Service(name=name, name_en=name_en, category=cat,
                              unit_price_cents=0, taxable=True, active=True, position=pos))
    db.commit()
    return len(DEFAULT_SERVICES)


class ServiceIn(BaseModel):
    name: str
    name_en: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit_price_cents: int = 0
    default_minutes: Optional[int] = None
    taxable: bool = True
    active: bool = True


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit_price_cents: Optional[int] = None
    default_minutes: Optional[int] = None
    taxable: Optional[bool] = None
    active: Optional[bool] = None


class ReorderIn(BaseModel):
    ids: List[int]


def _out(s: models.Service) -> dict:
    return {
        "id": s.id, "name": s.name, "name_en": s.name_en, "description": s.description,
        "category": s.category, "unit_price_cents": s.unit_price_cents or 0,
        "default_minutes": s.default_minutes, "taxable": bool(s.taxable),
        "active": bool(s.active), "position": s.position or 0,
    }


@router.get("")
def list_services(active: Optional[bool] = None, db: Session = Depends(get_db),
                  _user=Depends(get_current_user)):
    seed_default_services(db)  # first use: make the price book non-empty
    q = db.query(models.Service)
    if active is not None:
        q = q.filter(models.Service.active == active)
    return [_out(s) for s in q.order_by(models.Service.position, models.Service.id).all()]


@router.post("", status_code=201)
def create_service(body: ServiceIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    last = db.query(models.Service).order_by(models.Service.position.desc()).first()
    s = models.Service(**body.model_dump(), position=((last.position or 0) + 1) if last else 0)
    db.add(s)
    db.commit()
    db.refresh(s)
    return _out(s)


# Declared before "/{service_id}" routes so "reorder" is never parsed as an id.
@router.post("/reorder")
def reorder_services(body: ReorderIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    for pos, sid in enumerate(body.ids):
        s = db.query(models.Service).filter(models.Service.id == sid).first()
        if s:
            s.position = pos
    db.commit()
    return {"ok": True}


@router.put("/{service_id}")
def update_service(service_id: int, body: ServiceUpdate, db: Session = Depends(get_db),
                   _admin=Depends(require_admin)):
    s = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not s:
        raise HTTPException(404, "Service not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return _out(s)


@router.delete("/{service_id}")
def delete_service(service_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    s = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not s:
        raise HTTPException(404, "Service not found")
    s.active = False
    db.commit()
    return {"ok": True}
