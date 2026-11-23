"""Offline sync: the phone queues actions while offline and replays them here.

Every action carries a client_ref (uuid made on the phone). Each step stores a
SyncReceipt, so if the connection drops mid-way and the phone retries, nothing
is created twice. The normal route functions are reused, so side effects
(booking confirmation SMS, geocoding, tech auto-assign) behave exactly the same.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db
from routes import contacts as contacts_routes
from routes import deals as deals_routes
from routes import knocks as knocks_routes
from routes import job_items as job_items_routes

router = APIRouter(prefix="/api/sync", tags=["sync"])


def receipt(db: Session, ref: str) -> Optional[models.SyncReceipt]:
    return db.query(models.SyncReceipt).filter(models.SyncReceipt.client_ref == ref).first()


def remember(db: Session, ref: str, kind: str, object_id: int, user) -> None:
    db.add(models.SyncReceipt(client_ref=ref, kind=kind, object_id=object_id, user_id=user.id))
    db.commit()


def resolve_ref(db: Session, ref: str) -> Optional[int]:
    """Object id created for an offline client_ref (e.g. 'abc:deal'), if synced already."""
    r = receipt(db, ref)
    return r.object_id if r else None


# ── Knocks (map pins) ────────────────────────────────────────────────────────

class KnockSync(schemas.KnockCreate):
    client_ref: str = Field(..., min_length=8, max_length=80)


@router.post("/knock")
def sync_knock(data: KnockSync, db: Session = Depends(get_db), user=Depends(get_current_user)):
    ref = f"{data.client_ref}:knock"
    done = receipt(db, ref)
    if done:
        return {"knock_id": done.object_id, "duplicate": True}
    payload = schemas.KnockCreate(**data.model_dump(exclude={"client_ref"}))
    knock = knocks_routes.create_knock(payload, db=db, current_user=user)
    remember(db, ref, "knock", knock.id, user)
    return {"knock_id": knock.id, "duplicate": False}


class KnockStatusSync(BaseModel):
    client_ref: str = Field(..., min_length=8, max_length=80)
    knock_id: Optional[int] = None
    knock_client_ref: Optional[str] = None      # pin created offline
    status: schemas.KnockStatus


@router.post("/knock-status")
def sync_knock_status(data: KnockStatusSync, db: Session = Depends(get_db), user=Depends(get_current_user)):
    ref = f"{data.client_ref}:knock-status"
    if receipt(db, ref):
        return {"ok": True, "duplicate": True}
    knock_id = data.knock_id or (resolve_ref(db, f"{data.knock_client_ref}:knock") if data.knock_client_ref else None)
    if not knock_id:
        raise HTTPException(status_code=409, detail="Pin not synced yet")
    knocks_routes.update_knock(knock_id, schemas.KnockUpdate(status=data.status), db=db, current_user=user)
    remember(db, ref, "knock-status", knock_id, user)
    return {"ok": True, "duplicate": False}


# ── Bookings (customer + job + line items) ──────────────────────────────────

class NewCustomer(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=40)
    address: Optional[str] = Field(default=None, max_length=300)
    services: Optional[str] = Field(default=None, max_length=512)
    price: Optional[float] = None


class BookingSync(BaseModel):
    client_ref: str = Field(..., min_length=8, max_length=80)
    contact_id: Optional[int] = None
    new_contact: Optional[NewCustomer] = None
    deal: schemas.DealCreate
    items: List[job_items_routes.JobItemIn] = []


@router.post("/booking")
def sync_booking(data: BookingSync, db: Session = Depends(get_db), user=Depends(get_current_user)):
    base = data.client_ref

    # 1. customer
    contact_id = data.contact_id or resolve_ref(db, f"{base}:contact")
    if not contact_id:
        if not data.new_contact:
            raise HTTPException(status_code=422, detail="contact_id or new_contact required")
        nc = data.new_contact
        c = contacts_routes.create_contact(
            schemas.ContactCreate(first_name=nc.first_name, last_name=nc.last_name, phone=nc.phone,
                                  address=nc.address, services=nc.services, price=nc.price, status="prospect"),
            db=db, current_user=user)
        contact_id = c.id
        remember(db, f"{base}:contact", "contact", contact_id, user)

    # 2. job
    deal_id = resolve_ref(db, f"{base}:deal")
    duplicate = deal_id is not None
    if not deal_id:
        d = data.deal.model_copy(update={"contact_id": contact_id})
        deal = deals_routes.create_deal(d, db=db, current_user=user)
        deal_id = deal.id
        remember(db, f"{base}:deal", "deal", deal_id, user)

    # 3. line items (replace is idempotent by nature)
    if data.items and not receipt(db, f"{base}:items"):
        job_items_routes.replace_job_items(deal_id, data.items, db=db, user=user)
        remember(db, f"{base}:items", "items", deal_id, user)

    return {"contact_id": contact_id, "deal_id": deal_id, "duplicate": duplicate}
