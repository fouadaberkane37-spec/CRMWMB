"""
Post-job review request automation.

When a deal's job_status flips to "done" (see routes/deals.py, which stamps
Deal.marked_done_at), the scheduler waits a couple of hours and then sends
the client a thank-you SMS asking for a Google review and offering a
MERCI20 discount on their next cleaning. Fires at most once per deal.
"""

import os
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
import models
from auth import require_admin
from routes.reminders import _send_sms

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/review-requests", tags=["review-requests"])

REVIEW_LINK     = "https://share.google/VcubVLg5RaTFv5Wvi"
DISCOUNT_CODE   = "MERCI20"
DISCOUNT_AMOUNT = 20.0
SEND_DELAY      = timedelta(hours=2)


def _message_fr(name: str) -> str:
    return (
        f"Bonjour {name}, merci d'avoir choisi Groupe WMB pour le nettoyage de votre "
        f"propriété. Si vous êtes satisfait du résultat, un avis Google nous aiderait "
        f"beaucoup : {REVIEW_LINK}. Pour vous remercier, profitez de 20 $ de rabais sur "
        f"votre prochain nettoyage (code {DISCOUNT_CODE}). Au plaisir de vous revoir! "
        f"— Équipe Groupe WMB"
    )


def _message_en(name: str) -> str:
    return (
        f"Hi {name}, thank you for choosing Groupe WMB for your property cleaning. "
        f"If you're happy with the results, a quick Google review would mean a lot: "
        f"{REVIEW_LINK}. As a thank-you, enjoy $20 off your next cleaning (code "
        f"{DISCOUNT_CODE}). We look forward to seeing you again! — The Groupe WMB Team"
    )


def _build_message(contact: models.Contact) -> str:
    name = (contact.first_name or "").strip() or "there"
    lang = (contact.language or "").strip().lower()
    if lang == "fr":
        return _message_fr(name)
    if lang == "en":
        return _message_en(name)
    # Unknown language — send both.
    return _message_fr(name) + "\n\n" + _message_en(name)


def _send_review_requests(db: Session) -> int:
    """Send review-request SMS for jobs marked done >= SEND_DELAY ago. Returns count sent."""
    cutoff = datetime.utcnow() - SEND_DELAY

    deals = (
        db.query(models.Deal)
        .filter(
            models.Deal.job_status == "done",
            models.Deal.review_request_sent == False,   # noqa: E712
            models.Deal.marked_done_at.isnot(None),
            models.Deal.marked_done_at <= cutoff,
        )
        .all()
    )

    if not deals:
        return 0

    log.info(f"[review-requests] {len(deals)} completed job(s) ready for review SMS")
    sent_count = 0

    for deal in deals:
        if deal.contact_id and not deal.contact:
            deal.contact = db.query(models.Contact).filter(
                models.Contact.id == deal.contact_id
            ).first()

        contact = deal.contact
        if not contact or not (contact.phone or "").strip():
            deal.review_request_sent = True   # no phone — skip silently, don't retry forever
            log.info(f"[review-requests] deal={deal.id} skipped — no client phone")
            continue

        body = _build_message(contact)
        success, error = _send_sms(contact.phone.strip(), body)

        if success:
            try:
                db.add(models.ChatMessage(
                    contact_id=contact.id,
                    sender_id=None,
                    body=body,
                    direction="outbound",
                ))
                db.add(models.Discount(
                    contact_id=contact.id,
                    deal_id=deal.id,
                    code=DISCOUNT_CODE,
                    amount=DISCOUNT_AMOUNT,
                    reason="review_request",
                ))
            except Exception:
                pass
            deal.review_request_sent = True
            sent_count += 1
            log.info(f"[review-requests] Sent to {contact.first_name} ({contact.phone}) for deal {deal.id}")
        else:
            log.warning(f"[review-requests] Failed for deal {deal.id}: {error}")

    return sent_count


def run_review_requests():
    """Scheduler entry point."""
    db = SessionLocal()
    try:
        count = _send_review_requests(db)
        db.commit()
        if count:
            log.info(f"[review-requests] Sent {count} review request(s)")
    except Exception as e:
        db.rollback()
        log.error(f"[review-requests] Error: {e}")
    finally:
        db.close()


# ── Admin API endpoints ───────────────────────────────────────────────────────

@router.post("/trigger")
def trigger_review_requests(_=Depends(require_admin)):
    """Admin: manually fire the review-request job right now."""
    run_review_requests()
    return {"ok": True, "message": "Review request job completed"}


@router.post("/test/{deal_id}")
def test_review_request(deal_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Admin: send the review-request SMS for a specific deal right now, bypassing the delay/flag."""
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    if deal.contact_id and not deal.contact:
        deal.contact = db.query(models.Contact).filter(models.Contact.id == deal.contact_id).first()
    contact = deal.contact
    if not contact or not (contact.phone or "").strip():
        return {"ok": False, "message": "Contact has no phone number"}

    body = _build_message(contact)
    success, error = _send_sms(contact.phone.strip(), body)
    if success:
        db.add(models.ChatMessage(contact_id=contact.id, sender_id=None, body=body, direction="outbound"))
        db.add(models.Discount(contact_id=contact.id, deal_id=deal.id, code=DISCOUNT_CODE, amount=DISCOUNT_AMOUNT, reason="review_request"))
        deal.review_request_sent = True
        db.commit()
    return {"ok": success, "message": body, "error": error or None}


@router.get("/discounts")
def list_discounts(
    contact_id: int = None,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Admin: list granted discount codes, optionally filtered by contact."""
    q = db.query(models.Discount).order_by(models.Discount.created_at.desc())
    if contact_id:
        q = q.filter(models.Discount.contact_id == contact_id)
    rows = q.limit(500).all()
    return [
        {
            "id":         d.id,
            "contact_id": d.contact_id,
            "contact_name": f"{d.contact.first_name} {d.contact.last_name or ''}".strip() if d.contact else None,
            "deal_id":    d.deal_id,
            "code":       d.code,
            "amount":     d.amount,
            "reason":     d.reason,
            "used":       d.used,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in rows
    ]


@router.patch("/discounts/{discount_id}/use")
def mark_discount_used(discount_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Admin: mark a discount code as redeemed."""
    discount = db.query(models.Discount).filter(models.Discount.id == discount_id).first()
    if not discount:
        raise HTTPException(status_code=404, detail="Discount not found")
    discount.used = True
    db.commit()
    return {"ok": True}
