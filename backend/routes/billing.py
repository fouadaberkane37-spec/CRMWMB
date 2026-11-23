"""Invoices + payments (Blue work style). Money is stored in integer cents."""
import logging
import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from money import compute_totals, new_token, next_number

log = logging.getLogger("billing")

router = APIRouter(prefix="/api/billing", tags=["billing"])
public_router = APIRouter(prefix="/api/public/invoices", tags=["billing-public"])

APP_URL = os.getenv("APP_URL", "https://crm.zfentretien.ca").rstrip("/")
COMPANY_NAME = os.getenv("COMPANY_NAME", "ZF ENTRETIEN")
COMPANY_PHONE = os.getenv("COMPANY_PHONE", "(514) 559-7007")
COMPANY_EMAIL = os.getenv("COMPANY_EMAIL", "")
COMPANY_ADDRESS = os.getenv("COMPANY_ADDRESS", "575 Robert-Élie, Laval, QC H7N 0E8")
REVIEW_LINK = "https://share.google/VcubVLg5RaTFv5Wvi"

EDITABLE = ("draft", "sent", "viewed")
METHODS = ("interac", "cash", "cheque", "card", "stripe", "other")


# ── schemas ──────────────────────────────────────────────────────────────────
class ItemIn(BaseModel):
    name: str
    description: Optional[str] = None
    qty: float = 1
    unit_price_cents: int = 0
    taxable: bool = True
    service_id: Optional[int] = None


class InvoiceIn(BaseModel):
    contact_id: int
    deal_id: Optional[int] = None
    items: List[ItemIn] = []
    discount_type: Optional[str] = None      # percent | fixed | None
    discount_value: float = 0                # percent, or cents when fixed
    tip_cents: int = 0
    due_date: Optional[datetime] = None
    notes: Optional[str] = None


class InvoiceUpdate(BaseModel):
    contact_id: Optional[int] = None
    items: Optional[List[ItemIn]] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    tip_cents: Optional[int] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None


class SendIn(BaseModel):
    channel: str = "sms"  # sms | link


class PaymentIn(BaseModel):
    method: str = "interac"
    amount_cents: int
    reference: Optional[str] = None
    paid_at: Optional[datetime] = None
    notes: Optional[str] = None


# ── helpers ──────────────────────────────────────────────────────────────────
def _iso(d):
    return d.isoformat() if d else None


def _balance(inv):
    return max((inv.total_cents or 0) - (inv.paid_cents or 0), 0)


def _is_overdue(inv, now=None):
    now = now or datetime.utcnow()
    return (
        inv.status in ("sent", "viewed", "partial")
        and inv.due_date is not None
        and inv.due_date.date() < now.date()
        and _balance(inv) > 0
    )


def _contact_name(c):
    if not c:
        return None
    return f"{c.first_name or ''} {c.last_name or ''}".strip()


def _item_out(i):
    return {
        "id": i.id, "service_id": i.service_id, "name": i.name, "description": i.description,
        "qty": i.qty, "unit_price_cents": i.unit_price_cents, "taxable": bool(i.taxable),
        "line_total_cents": round((i.qty or 0) * (i.unit_price_cents or 0)), "position": i.position,
    }


def _payment_out(p):
    return {
        "id": p.id, "method": p.method, "amount_cents": p.amount_cents,
        "refunded_cents": p.refunded_cents or 0, "reference": p.reference,
        "paid_at": _iso(p.paid_at), "notes": p.notes,
    }


def _invoice_out(inv):
    return {
        "id": inv.id, "number": inv.number, "contact_id": inv.contact_id,
        "contact_name": _contact_name(inv.contact), "deal_id": inv.deal_id, "quote_id": inv.quote_id,
        "status": inv.status, "overdue": _is_overdue(inv),
        "issue_date": _iso(inv.issue_date), "due_date": _iso(inv.due_date),
        "discount_type": inv.discount_type, "discount_value": inv.discount_value,
        "subtotal_cents": inv.subtotal_cents, "discount_cents": inv.discount_cents,
        "tps_cents": inv.tps_cents, "tvq_cents": inv.tvq_cents, "tip_cents": inv.tip_cents,
        "total_cents": inv.total_cents, "paid_cents": inv.paid_cents, "balance_cents": _balance(inv),
        "notes": inv.notes, "token": inv.token, "url": f"{APP_URL}/i/{inv.token}",
        "sent_at": _iso(inv.sent_at), "viewed_at": _iso(inv.viewed_at), "paid_at": _iso(inv.paid_at),
        "created_at": _iso(inv.created_at),
    }


def _items(db, inv_id):
    return (db.query(models.LineItem)
            .filter(models.LineItem.parent_type == "invoice", models.LineItem.parent_id == inv_id)
            .order_by(models.LineItem.position, models.LineItem.id).all())


def _detail(db, inv):
    out = _invoice_out(inv)
    out["items"] = [_item_out(i) for i in _items(db, inv.id)]
    out["payments"] = [_payment_out(p) for p in sorted(inv.payments, key=lambda p: (p.paid_at or datetime.min, p.id))]
    return out


def _write_items(db, inv, items):
    db.query(models.LineItem).filter(
        models.LineItem.parent_type == "invoice", models.LineItem.parent_id == inv.id
    ).delete()
    for pos, it in enumerate(items):
        db.add(models.LineItem(
            parent_type="invoice", parent_id=inv.id, service_id=it.service_id, name=it.name,
            description=it.description, qty=it.qty, unit_price_cents=it.unit_price_cents,
            taxable=it.taxable, position=pos,
        ))


def _recompute(db, inv):
    db.flush()
    t = compute_totals(_items(db, inv.id), inv.discount_type, inv.discount_value, inv.tip_cents or 0)
    inv.subtotal_cents = t["subtotal_cents"]
    inv.discount_cents = t["discount_cents"]
    inv.tps_cents = t["tps_cents"]
    inv.tvq_cents = t["tvq_cents"]
    inv.total_cents = t["total_cents"]
    _sync_status(inv)


def _sync_status(inv):
    """Re-derive paid/partial from paid_cents (never touches cancelled/refunded)."""
    if inv.status in ("cancelled", "refunded"):
        return
    paid = inv.paid_cents or 0
    if paid > 0 and paid >= (inv.total_cents or 0):
        inv.status = "paid"
        inv.paid_at = inv.paid_at or datetime.utcnow()
    elif paid > 0:
        inv.status = "partial"
        inv.paid_at = None
    elif inv.status in ("paid", "partial"):
        inv.paid_at = None
        inv.status = "viewed" if inv.viewed_at else ("sent" if inv.sent_at else "draft")


def _get(db, inv_id) -> models.Invoice:
    inv = db.query(models.Invoice).filter(models.Invoice.id == inv_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv


def _check_contact(db, contact_id):
    c = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not c:
        raise HTTPException(400, "Contact not found")
    return c


def _validate_items(items):
    for it in items:
        if not (it.name or "").strip():
            raise HTTPException(400, "Each line item needs a name")
        if it.qty < 0 or it.unit_price_cents < 0:
            raise HTTPException(400, "Negative quantity/price not allowed")


def _make_invoice(db, user, contact_id, items, deal_id=None, **kw) -> models.Invoice:
    inv = models.Invoice(
        number=next_number(db, models.Invoice, "F"), contact_id=contact_id, deal_id=deal_id,
        status="draft", issue_date=datetime.utcnow(), token=new_token(), created_by=user.id,
        due_date=kw.get("due_date") or datetime.utcnow(),  # default: due on receipt
        notes=kw.get("notes"),
        discount_type=kw.get("discount_type"), discount_value=kw.get("discount_value") or 0,
        tip_cents=kw.get("tip_cents") or 0,
    )
    db.add(inv)
    db.flush()
    _write_items(db, inv, items)
    _recompute(db, inv)
    db.commit()
    db.refresh(inv)
    return inv


# ── routes ───────────────────────────────────────────────────────────────────
@router.get("/summary")
def summary(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    invs = db.query(models.Invoice).all()
    counts, amounts = {}, {}
    outstanding = overdue = overdue_count = 0
    for i in invs:
        counts[i.status] = counts.get(i.status, 0) + 1
        amounts[i.status] = amounts.get(i.status, 0) + (i.total_cents or 0)
        if i.status in ("sent", "viewed", "partial"):
            outstanding += _balance(i)
            if _is_overdue(i, now):
                overdue += _balance(i)
                overdue_count += 1
    paid_month = sum(
        (p.amount_cents or 0) - (p.refunded_cents or 0)
        for p in db.query(models.Payment).filter(models.Payment.paid_at >= month_start).all()
    )
    counts["overdue"] = overdue_count
    counts["all"] = len(invs)
    return {
        "counts": counts, "amount_cents_by_status": amounts,
        "outstanding_cents": outstanding, "overdue_cents": overdue,
        "paid_this_month_cents": paid_month,
    }


@router.get("/invoices")
def list_invoices(
    status: Optional[str] = None, contact_id: Optional[int] = None, search: Optional[str] = None,
    limit: int = 500, db: Session = Depends(get_db), user: models.User = Depends(get_current_user),
):
    q = db.query(models.Invoice).join(models.Contact, models.Contact.id == models.Invoice.contact_id)
    if contact_id:
        q = q.filter(models.Invoice.contact_id == contact_id)
    if status and status not in ("all", "overdue"):
        q = q.filter(models.Invoice.status == status)
    if search:
        s = f"%{search.strip()[:100]}%"
        q = q.filter(or_(models.Invoice.number.ilike(s), models.Contact.first_name.ilike(s),
                         models.Contact.last_name.ilike(s)))
    rows = q.order_by(models.Invoice.id.desc()).limit(min(limit, 2000)).all()
    if status == "overdue":
        rows = [r for r in rows if _is_overdue(r)]
    return [_invoice_out(r) for r in rows]


@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return _detail(db, _get(db, invoice_id))


@router.post("/invoices")
def create_invoice(body: InvoiceIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _check_contact(db, body.contact_id)
    _validate_items(body.items)
    inv = _make_invoice(
        db, user, body.contact_id, body.items, deal_id=body.deal_id, due_date=body.due_date,
        notes=body.notes, discount_type=body.discount_type, discount_value=body.discount_value,
        tip_cents=body.tip_cents,
    )
    return _detail(db, inv)


@router.post("/invoices/from-job/{deal_id}")
def invoice_from_job(deal_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(404, "Job not found")
    if not deal.contact_id:
        raise HTTPException(400, "Job has no customer")
    lines = (db.query(models.LineItem)
             .filter(models.LineItem.parent_type == "job", models.LineItem.parent_id == deal_id)
             .order_by(models.LineItem.position, models.LineItem.id).all())
    if lines:
        items = [ItemIn(name=l.name, description=l.description, qty=l.qty or 1,
                        unit_price_cents=l.unit_price_cents or 0, taxable=bool(l.taxable),
                        service_id=l.service_id) for l in lines]
    else:
        # deal.value is a pre-tax amount in dollars
        items = [ItemIn(name=deal.title or "Service", qty=1,
                        unit_price_cents=round((deal.value or 0) * 100), taxable=True)]
    inv = _make_invoice(db, user, deal.contact_id, items, deal_id=deal.id)
    return _detail(db, inv)


@router.put("/invoices/{invoice_id}")
def update_invoice(invoice_id: int, body: InvoiceUpdate, db: Session = Depends(get_db),
                   user: models.User = Depends(get_current_user)):
    inv = _get(db, invoice_id)
    if inv.status not in EDITABLE:
        raise HTTPException(400, f"Cannot edit an invoice that is {inv.status}")
    data = body.model_dump(exclude_unset=True) if hasattr(body, "model_dump") else body.dict(exclude_unset=True)
    if data.get("contact_id"):
        _check_contact(db, data["contact_id"])
        inv.contact_id = data["contact_id"]
    for k in ("discount_type", "due_date", "notes"):
        if k in data:
            setattr(inv, k, data[k])
    for k in ("discount_value", "tip_cents"):
        if k in data:
            setattr(inv, k, data[k] or 0)
    if body.items is not None:
        _validate_items(body.items)
        _write_items(db, inv, body.items)
    _recompute(db, inv)
    db.commit()
    db.refresh(inv)
    return _detail(db, inv)


@router.delete("/invoices/{invoice_id}")
def delete_invoice(invoice_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    inv = _get(db, invoice_id)
    if inv.status != "draft":
        raise HTTPException(400, "Only draft invoices can be deleted (cancel it instead)")
    db.query(models.LineItem).filter(
        models.LineItem.parent_type == "invoice", models.LineItem.parent_id == inv.id).delete()
    db.delete(inv)
    db.commit()
    return {"ok": True}


def _sms_body(inv, contact, url):
    name = (contact.first_name or "").strip()[:30].replace("\r", "").replace("\n", "")
    bal = f"{_balance(inv) / 100:.2f}"
    fr = (f"Bonjour {name}! Voici votre facture {inv.number} de ZF Entretien: ${bal} à payer.\n{url}\n"
          "Merci de votre confiance!")
    en = (f"Hi {name}! Here is your ZF Entretien invoice {inv.number}: ${bal} due.\n{url}\n"
          "Thank you for your business!")
    return fr + "\n\n" + en


def _twilio_send(to, body):
    sid, tok, frm = os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"), os.getenv("TWILIO_FROM_NUMBER")
    if not (sid and tok and frm):
        log.warning("[invoice SMS] Twilio not configured — skipping")
        return False
    try:
        from twilio.rest import Client
        Client(sid, tok).messages.create(body=body, from_=frm, to=to)
        return True
    except Exception as e:
        log.error("[invoice SMS] FAILED to %s: %s", to, e)
        return False


@router.post("/invoices/{invoice_id}/send")
def send_invoice(invoice_id: int, body: SendIn = SendIn(), db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_user)):
    inv = _get(db, invoice_id)
    if inv.status in ("cancelled", "refunded"):
        raise HTTPException(400, f"Cannot send an invoice that is {inv.status}")
    if body.channel not in ("sms", "link"):
        raise HTTPException(400, "channel must be sms or link")
    url = f"{APP_URL}/i/{inv.token}"
    sms_sent = False
    if body.channel == "sms":
        c = inv.contact
        if c.sms_opt_out:
            raise HTTPException(400, "Customer opted out of SMS")
        if not c.phone:
            raise HTTPException(400, "Customer has no phone number")
        text = _sms_body(inv, c, url)
        try:
            db.add(models.ChatMessage(contact_id=c.id, sender_id=user.id, body=text, direction="outbound"))
            db.commit()
        except Exception:
            db.rollback()
        sms_sent = _twilio_send(c.phone, text)
    inv.sent_at = datetime.utcnow()
    if inv.status == "draft":
        inv.status = "sent"
    if inv.deal_id:
        deal = db.query(models.Deal).filter(models.Deal.id == inv.deal_id).first()
        if deal:
            deal.invoice_sent = True
    db.commit()
    return {"url": url, "channel": body.channel, "sms_sent": sms_sent, "status": inv.status}


@router.post("/invoices/{invoice_id}/payments")
def add_payment(invoice_id: int, body: PaymentIn, db: Session = Depends(get_db),
                user: models.User = Depends(get_current_user)):
    inv = _get(db, invoice_id)
    if inv.status in ("cancelled", "refunded"):
        raise HTTPException(400, f"Cannot take payment on a {inv.status} invoice")
    if body.amount_cents <= 0:
        raise HTTPException(400, "Amount must be positive")
    method = body.method if body.method in METHODS else "other"
    db.add(models.Payment(invoice_id=inv.id, method=method, amount_cents=body.amount_cents,
                          reference=body.reference, notes=body.notes,
                          paid_at=body.paid_at or datetime.utcnow(), created_by=user.id))
    db.flush()
    db.refresh(inv)
    inv.paid_cents = sum((p.amount_cents or 0) - (p.refunded_cents or 0) for p in inv.payments)
    if inv.status == "draft":
        inv.status = "sent"
        inv.sent_at = inv.sent_at or datetime.utcnow()
    _sync_status(inv)
    if inv.status == "paid" and inv.deal_id:
        deal = db.query(models.Deal).filter(models.Deal.id == inv.deal_id).first()
        if deal and deal.job_status == "payment_pending":
            deal.job_status = "done"
    db.commit()
    db.refresh(inv)
    return _detail(db, inv)


@router.delete("/payments/{payment_id}")
def delete_payment(payment_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not p:
        raise HTTPException(404, "Payment not found")
    inv = _get(db, p.invoice_id)
    db.delete(p)
    db.flush()
    db.refresh(inv)
    inv.paid_cents = sum((x.amount_cents or 0) - (x.refunded_cents or 0) for x in inv.payments)
    _sync_status(inv)
    db.commit()
    db.refresh(inv)
    return _detail(db, inv)


@router.post("/invoices/{invoice_id}/cancel")
def cancel_invoice(invoice_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    inv = _get(db, invoice_id)
    if inv.status == "paid":
        raise HTTPException(400, "Cannot cancel a paid invoice")
    inv.status = "cancelled"
    db.commit()
    db.refresh(inv)
    return _detail(db, inv)


# ── public ───────────────────────────────────────────────────────────────────
@public_router.get("/{token}")
def public_invoice(token: str, db: Session = Depends(get_db)):
    inv = db.query(models.Invoice).filter(models.Invoice.token == token).first()
    if not inv or inv.status == "draft":
        raise HTTPException(404, "Invoice not found")
    if not inv.viewed_at:
        inv.viewed_at = datetime.utcnow()
        if inv.status == "sent":
            inv.status = "viewed"
        db.commit()
        db.refresh(inv)
    settings = {s.key: s.value for s in db.query(models.AppSetting).filter(
        models.AppSetting.key.in_(["interac_email", "tps_number", "tvq_number"])).all()}
    c = inv.contact
    return {
        "number": inv.number, "status": inv.status, "overdue": _is_overdue(inv),
        "issue_date": _iso(inv.issue_date), "due_date": _iso(inv.due_date), "paid_at": _iso(inv.paid_at),
        "customer": {"name": _contact_name(c), "address": c.address if c else None},
        "items": [_item_out(i) for i in _items(db, inv.id)],
        "subtotal_cents": inv.subtotal_cents, "discount_cents": inv.discount_cents,
        "tps_cents": inv.tps_cents, "tvq_cents": inv.tvq_cents, "tip_cents": inv.tip_cents,
        "total_cents": inv.total_cents, "paid_cents": inv.paid_cents, "balance_cents": _balance(inv),
        "notes": inv.notes,
        "payments": [{"method": p.method, "amount_cents": p.amount_cents, "paid_at": _iso(p.paid_at)}
                     for p in inv.payments],
        "company": {"name": COMPANY_NAME, "phone": COMPANY_PHONE, "email": COMPANY_EMAIL,
                    "address": COMPANY_ADDRESS, "review_link": REVIEW_LINK,
                    "tps_number": settings.get("tps_number") or None,
                    "tvq_number": settings.get("tvq_number") or None},
        "interac_email": settings.get("interac_email") or None,
    }
