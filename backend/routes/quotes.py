"""Quotes (Blue work flow): CRUD, send, accept/decline, convert to job, public customer page."""
import logging
import os
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from money import compute_totals, new_token, next_number

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/quotes", tags=["quotes"])
public_router = APIRouter(prefix="/api/public/quotes", tags=["quotes-public"])

EDITABLE = ("draft", "sent", "viewed")
MAX_SIGNATURE_CHARS = 700_000  # ~500 KB PNG data URL


# ── Schemas ─────────────────────────────────────────────────────────────────
class ItemIn(BaseModel):
    service_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    qty: float = 1
    unit_price_cents: int = 0
    taxable: bool = True


class QuoteCreate(BaseModel):
    contact_id: int
    property_id: Optional[int] = None
    title: Optional[str] = None
    message: Optional[str] = None
    items: List[ItemIn] = []
    discount_type: Optional[Literal["percent", "fixed"]] = None
    discount_value: float = 0
    require_signature: bool = True


class QuoteUpdate(BaseModel):
    contact_id: Optional[int] = None
    property_id: Optional[int] = None
    title: Optional[str] = None
    message: Optional[str] = None
    items: Optional[List[ItemIn]] = None
    discount_type: Optional[Literal["percent", "fixed"]] = None
    discount_value: Optional[float] = None
    require_signature: Optional[bool] = None


class SendIn(BaseModel):
    channel: Literal["sms", "link"] = "link"


class MarkIn(BaseModel):
    status: Literal["accepted", "declined"]


class ConvertIn(BaseModel):
    expected_close_date: Optional[datetime] = None


class AcceptIn(BaseModel):
    signature_name: Optional[str] = None
    signature_data: Optional[str] = None


# ── Helpers ─────────────────────────────────────────────────────────────────
def _app_url() -> str:
    return os.getenv("APP_URL", "https://crm.zfentretien.ca").rstrip("/")


def _public_link(q: models.Quote) -> str:
    return f"{_app_url()}/q/{q.token}"


def _iso(d):
    return d.isoformat() if d else None


def _contact_name(c) -> str:
    if not c:
        return ""
    return f"{c.first_name or ''} {c.last_name or ''}".strip()


def _items(db: Session, parent_type: str, parent_id: int):
    return (db.query(models.LineItem)
            .filter(models.LineItem.parent_type == parent_type, models.LineItem.parent_id == parent_id)
            .order_by(models.LineItem.position, models.LineItem.id).all())


def _item_out(i: models.LineItem) -> dict:
    return {"id": i.id, "service_id": i.service_id, "name": i.name, "description": i.description,
            "qty": i.qty, "unit_price_cents": i.unit_price_cents or 0,
            "taxable": bool(i.taxable), "position": i.position or 0}


def _quote_out(q: models.Quote, items=None) -> dict:
    d = {
        "id": q.id, "number": q.number, "contact_id": q.contact_id,
        "contact_name": _contact_name(q.contact), "contact_phone": q.contact.phone if q.contact else None,
        "property_id": q.property_id, "deal_id": q.deal_id, "status": q.status,
        "title": q.title, "message": q.message,
        "discount_type": q.discount_type, "discount_value": q.discount_value or 0,
        "subtotal_cents": q.subtotal_cents or 0, "discount_cents": q.discount_cents or 0,
        "tps_cents": q.tps_cents or 0, "tvq_cents": q.tvq_cents or 0, "total_cents": q.total_cents or 0,
        "require_signature": bool(q.require_signature), "signature_name": q.signature_name,
        "token": q.token, "public_url": _public_link(q),
        "sent_at": _iso(q.sent_at), "viewed_at": _iso(q.viewed_at),
        "accepted_at": _iso(q.accepted_at), "declined_at": _iso(q.declined_at),
        "expires_at": _iso(q.expires_at), "created_at": _iso(q.created_at),
    }
    if items is not None:
        d["items"] = [_item_out(i) for i in items]
    return d


def _get_quote(db: Session, quote_id: int) -> models.Quote:
    q = db.query(models.Quote).filter(models.Quote.id == quote_id).first()
    if not q:
        raise HTTPException(404, "Quote not found")
    return q


def _check_contact(db: Session, contact_id: int) -> models.Contact:
    c = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not c:
        raise HTTPException(404, "Contact not found")
    return c


def _replace_items(db: Session, q: models.Quote, items: List[ItemIn]):
    db.query(models.LineItem).filter(
        models.LineItem.parent_type == "quote", models.LineItem.parent_id == q.id
    ).delete(synchronize_session=False)
    for pos, it in enumerate(items):
        db.add(models.LineItem(parent_type="quote", parent_id=q.id, service_id=it.service_id,
                               name=it.name, description=it.description, qty=it.qty,
                               unit_price_cents=it.unit_price_cents, taxable=it.taxable, position=pos))
    db.flush()


def _recompute(db: Session, q: models.Quote):
    t = compute_totals(_items(db, "quote", q.id), q.discount_type, q.discount_value or 0)
    q.subtotal_cents = t["subtotal_cents"]
    q.discount_cents = t["discount_cents"]
    q.tps_cents = t["tps_cents"]
    q.tvq_cents = t["tvq_cents"]
    q.total_cents = t["total_cents"]


def _convert_to_job(db: Session, q: models.Quote, expected_close_date=None, user_id=None) -> models.Deal:
    """Create an (unscheduled) won Deal job from the quote and copy its line items."""
    deal = models.Deal(
        title=q.title or f"Soumission {q.number}",
        value=round((q.total_cents or 0) / 100, 2),
        stage="won", job_status="todo", contact_id=q.contact_id,
        expected_close_date=expected_close_date,
        notes=f"Créé depuis la soumission {q.number}",
        created_by=user_id,
    )
    db.add(deal)
    db.flush()
    for i in _items(db, "quote", q.id):
        db.add(models.LineItem(parent_type="job", parent_id=deal.id, service_id=i.service_id,
                               name=i.name, description=i.description, qty=i.qty,
                               unit_price_cents=i.unit_price_cents, taxable=i.taxable,
                               position=i.position))
    q.deal_id = deal.id
    return deal


def _send_sms(db: Session, contact: models.Contact, body: str, user_id=None):
    """Same Twilio pattern as routes/sms.py; also logs to the chat thread."""
    from routes.sms import _twilio_client
    from_number = os.getenv("TWILIO_FROM_NUMBER")
    if not from_number:
        raise HTTPException(500, "TWILIO_FROM_NUMBER not configured")
    client = _twilio_client()
    try:
        client.messages.create(body=body, from_=from_number, to=contact.phone)
    except Exception:
        log.exception("Quote SMS failed")
        raise HTTPException(500, "SMS delivery failed. Please try again.")
    db.add(models.ChatMessage(contact_id=contact.id, sender_id=user_id, body=body, direction="outbound"))


# ── Authenticated routes ────────────────────────────────────────────────────
@router.get("")
def list_quotes(status: Optional[str] = None, contact_id: Optional[int] = None,
                search: Optional[str] = None, db: Session = Depends(get_db),
                _user=Depends(get_current_user)):
    qry = db.query(models.Quote).join(models.Contact, models.Contact.id == models.Quote.contact_id)
    if status:
        qry = qry.filter(models.Quote.status == status)
    if contact_id:
        qry = qry.filter(models.Quote.contact_id == contact_id)
    if search:
        like = f"%{search.strip()}%"
        qry = qry.filter(or_(models.Quote.number.ilike(like), models.Quote.title.ilike(like),
                             models.Contact.first_name.ilike(like), models.Contact.last_name.ilike(like)))
    rows = qry.order_by(models.Quote.created_at.desc(), models.Quote.id.desc()).all()
    return [_quote_out(q) for q in rows]


@router.post("", status_code=201)
def create_quote(body: QuoteCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _check_contact(db, body.contact_id)
    q = models.Quote(
        number=next_number(db, models.Quote, "Q"), contact_id=body.contact_id,
        property_id=body.property_id, status="draft", title=body.title, message=body.message,
        discount_type=body.discount_type, discount_value=body.discount_value,
        require_signature=body.require_signature, token=new_token(), created_by=user.id,
    )
    db.add(q)
    db.flush()
    _replace_items(db, q, body.items)
    _recompute(db, q)
    db.commit()
    db.refresh(q)
    return _quote_out(q, _items(db, "quote", q.id))


@router.get("/{quote_id}")
def get_quote(quote_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    q = _get_quote(db, quote_id)
    return _quote_out(q, _items(db, "quote", q.id))


@router.put("/{quote_id}")
def update_quote(quote_id: int, body: QuoteUpdate, db: Session = Depends(get_db),
                 _user=Depends(get_current_user)):
    q = _get_quote(db, quote_id)
    if q.status not in EDITABLE:
        raise HTTPException(400, "Only draft, sent or viewed quotes can be edited")
    data = body.model_dump(exclude_unset=True)
    items = body.items
    data.pop("items", None)
    if "contact_id" in data:
        _check_contact(db, data["contact_id"])
    for k, v in data.items():
        setattr(q, k, v)
    if items is not None:
        _replace_items(db, q, items)
    _recompute(db, q)
    db.commit()
    db.refresh(q)
    return _quote_out(q, _items(db, "quote", q.id))


@router.delete("/{quote_id}")
def delete_quote(quote_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    q = _get_quote(db, quote_id)
    if q.status != "draft":
        raise HTTPException(400, "Only draft quotes can be deleted")
    db.query(models.LineItem).filter(
        models.LineItem.parent_type == "quote", models.LineItem.parent_id == q.id
    ).delete(synchronize_session=False)
    db.delete(q)
    db.commit()
    return {"ok": True}


@router.post("/{quote_id}/send")
def send_quote(quote_id: int, body: SendIn, db: Session = Depends(get_db),
               user=Depends(get_current_user)):
    q = _get_quote(db, quote_id)
    if q.status not in EDITABLE:
        raise HTTPException(400, "This quote can no longer be sent")
    if not _items(db, "quote", q.id):
        raise HTTPException(400, "Add at least one line item before sending")
    link = _public_link(q)
    if body.channel == "sms":
        c = q.contact
        if not c.phone:
            raise HTTPException(400, "This contact has no phone number")
        if c.sms_opt_out:
            raise HTTPException(400, "This contact opted out of SMS")
        first = c.first_name or ""
        text = (f"Bonjour {first}, voici votre soumission {q.number} de ZF Entretien : {link}\n"
                f"Hello {first}, here is your ZF Entretien quote {q.number}: {link}")
        _send_sms(db, c, text, user.id)
    q.status = "sent" if q.status == "draft" else q.status
    q.sent_at = datetime.utcnow()
    db.commit()
    db.refresh(q)
    out = _quote_out(q)
    out["link"] = link
    return out


@router.post("/{quote_id}/mark")
def mark_quote(quote_id: int, body: MarkIn, db: Session = Depends(get_db),
               _user=Depends(get_current_user)):
    q = _get_quote(db, quote_id)
    if q.status in ("accepted", "declined"):
        raise HTTPException(400, f"Quote already {q.status}")
    q.status = body.status
    if body.status == "accepted":
        q.accepted_at = datetime.utcnow()
    else:
        q.declined_at = datetime.utcnow()
    db.commit()
    db.refresh(q)
    return _quote_out(q)


@router.post("/{quote_id}/convert")
def convert_quote(quote_id: int, body: Optional[ConvertIn] = None, db: Session = Depends(get_db),
                  user=Depends(get_current_user)):
    q = _get_quote(db, quote_id)
    if q.deal_id:
        raise HTTPException(409, "Quote already converted to a job")
    if q.status == "declined":
        raise HTTPException(400, "A declined quote cannot be converted")
    deal = _convert_to_job(db, q, body.expected_close_date if body else None, user.id)
    db.commit()
    return {"deal_id": deal.id, "quote": _quote_out(q)}


# ── Public (no auth) ────────────────────────────────────────────────────────
def _setting(db: Session, key: str, default: str = "") -> str:
    row = db.query(models.AppSetting).filter(models.AppSetting.key == key).first()
    return row.value if row and row.value else default


def _public_quote(db: Session, token: str) -> models.Quote:
    q = db.query(models.Quote).filter(models.Quote.token == token).first()
    # Drafts were never sent to the customer: treat as not found.
    if not q or q.status == "draft":
        raise HTTPException(404, "Quote not found")
    return q


def _public_out(db: Session, q: models.Quote) -> dict:
    c = q.contact
    return {
        "number": q.number, "status": q.status, "title": q.title, "message": q.message,
        "customer_name": _contact_name(c), "language": c.language if c else None,
        "items": [{"name": i.name, "description": i.description, "qty": i.qty,
                   "unit_price_cents": i.unit_price_cents or 0, "taxable": bool(i.taxable)}
                  for i in _items(db, "quote", q.id)],
        "subtotal_cents": q.subtotal_cents or 0, "discount_cents": q.discount_cents or 0,
        "tps_cents": q.tps_cents or 0, "tvq_cents": q.tvq_cents or 0, "total_cents": q.total_cents or 0,
        "require_signature": bool(q.require_signature), "signature_name": q.signature_name,
        "accepted_at": _iso(q.accepted_at), "declined_at": _iso(q.declined_at),
        "expires_at": _iso(q.expires_at), "created_at": _iso(q.created_at),
        "company": {
            "name": _setting(db, "company_name", "ZF Entretien"),
            "phone": _setting(db, "company_phone", "438-905-0602"),
            "email": _setting(db, "company_email", ""),
            "website": _setting(db, "company_website", "zfentretien.ca"),
            "tps_number": _setting(db, "tps_number", ""),
            "tvq_number": _setting(db, "tvq_number", ""),
        },
    }


@public_router.get("/{token}")
def public_get_quote(token: str, db: Session = Depends(get_db)):
    q = _public_quote(db, token)
    if q.status == "sent":
        q.status = "viewed"
    if not q.viewed_at:
        q.viewed_at = datetime.utcnow()
    db.commit()
    return _public_out(db, q)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


@public_router.post("/{token}/accept")
def public_accept(token: str, body: AcceptIn, request: Request, db: Session = Depends(get_db)):
    q = _public_quote(db, token)
    if q.status == "accepted":
        return _public_out(db, q)
    if q.status not in ("sent", "viewed"):
        raise HTTPException(400, f"Quote is {q.status}")
    if q.expires_at and q.expires_at < datetime.utcnow():
        raise HTTPException(400, "Quote has expired")
    name = (body.signature_name or "").strip()
    data = body.signature_data or ""
    if q.require_signature:
        if not name or not data:
            raise HTTPException(400, "Signature and name are required")
    if data:
        if not data.startswith("data:image/png;base64,") or len(data) > MAX_SIGNATURE_CHARS:
            raise HTTPException(400, "Invalid signature image")
    q.signature_name = name or None
    q.signature_data = data or None
    q.signed_ip = _client_ip(request)
    q.status = "accepted"
    q.accepted_at = datetime.utcnow()
    if not q.deal_id:
        _convert_to_job(db, q)
    db.commit()
    return _public_out(db, q)


@public_router.post("/{token}/decline")
def public_decline(token: str, db: Session = Depends(get_db)):
    q = _public_quote(db, token)
    if q.status == "declined":
        return _public_out(db, q)
    if q.status not in ("sent", "viewed"):
        raise HTTPException(400, f"Quote is {q.status}")
    q.status = "declined"
    q.declined_at = datetime.utcnow()
    db.commit()
    return _public_out(db, q)
