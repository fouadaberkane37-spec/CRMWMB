"""
Post-job review request automation.

When a deal's job_status flips to "done" (see routes/deals.py), the client
is immediately sent a thank-you MMS (with their invoice attached as an image,
plus a PDF link in the text as backup) asking for a Google review and
offering a MERCI20 discount on their next cleaning. Fires at most once per
deal. The scheduler job is kept as a safety net to catch any deal whose
immediate send failed (e.g. Twilio hiccup).

Note: the MMS attachment is a PNG, not a PDF. Most carriers — Canadian ones
in particular — don't reliably deliver non-image file attachments over MMS,
so an image is the only format that's guaranteed to actually arrive as a
real attachment on the client's phone.
"""

import os
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
import models
from auth import require_admin
from routes.reminders import _send_mms
from routes.invoices import invoice_pdf_url, invoice_image_url

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/review-requests", tags=["review-requests"])

REVIEW_LINK     = "https://share.google/VcubVLg5RaTFv5Wvi"
DISCOUNT_CODE   = "MERCI20"
DISCOUNT_AMOUNT = 20.0


def _message_fr(name: str, invoice_url: str) -> str:
    return (
        f"Bonjour {name}, merci d'avoir choisi Groupe WMB pour le nettoyage de votre "
        f"propriété. Voici votre facture : {invoice_url}. Si vous êtes satisfait du résultat, un avis Google nous aiderait "
        f"beaucoup : {REVIEW_LINK}. Pour vous remercier, profitez de 20 $ de rabais sur "
        f"votre prochain nettoyage (code {DISCOUNT_CODE}). Au plaisir de vous revoir! "
        f"— Équipe Groupe WMB"
    )


def _message_en(name: str, invoice_url: str) -> str:
    return (
        f"Hi {name}, thank you for choosing Groupe WMB for your property cleaning. "
        f"Here's your invoice: {invoice_url}. If you're happy with the results, a quick Google review would mean a lot: "
        f"{REVIEW_LINK}. As a thank-you, enjoy $20 off your next cleaning (code "
        f"{DISCOUNT_CODE}). We look forward to seeing you again! — The Groupe WMB Team"
    )


def _build_message(contact: models.Contact, invoice_url: str) -> str:
    name = (contact.first_name or "").strip() or "there"
    lang = (contact.language or "").strip().lower()
    if lang == "fr":
        return _message_fr(name, invoice_url)
    if lang == "en":
        return _message_en(name, invoice_url)
    # Unknown language — send both.
    return _message_fr(name, invoice_url) + "\n\n" + _message_en(name, invoice_url)


def send_for_deal(db: Session, deal: "models.Deal") -> bool:
    """Send the thank-you/review/MERCI20 MMS (with invoice PDF attached) for one deal.
    Fires once per deal — safe to call repeatedly, no-ops if already sent."""
    if deal.review_request_sent:
        return False
    if deal.contact_id and not deal.contact:
        deal.contact = db.query(models.Contact).filter(models.Contact.id == deal.contact_id).first()

    contact = deal.contact
    if not contact or not (contact.phone or "").strip():
        deal.review_request_sent = True   # no phone — skip silently, don't retry forever
        log.info(f"[review-requests] deal={deal.id} skipped — no client phone")
        return False

    pdf_url = invoice_pdf_url(deal.id)
    body = _build_message(contact, pdf_url)
    success, error = _send_mms(contact.phone.strip(), body, invoice_image_url(deal.id))

    if success:
        try:
            db.add(models.ChatMessage(
                contact_id=contact.id,
                sender_id=None,
                body=body + " [invoice image]",
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
        deal.invoice_sent = True
        log.info(f"[review-requests] Sent to {contact.first_name} ({contact.phone}) for deal {deal.id}")
        return True

    log.warning(f"[review-requests] Failed for deal {deal.id}: {error}")
    return False


def _send_review_requests(db: Session) -> int:
    """Safety-net sweep: catch any 'done' deal whose immediate send failed/never fired."""
    deals = (
        db.query(models.Deal)
        .filter(
            models.Deal.job_status == "done",
            models.Deal.review_request_sent == False,   # noqa: E712
            models.Deal.marked_done_at.isnot(None),
        )
        .all()
    )

    if not deals:
        return 0

    log.info(f"[review-requests] {len(deals)} completed job(s) missing their review/invoice MMS — retrying")
    sent_count = sum(1 for deal in deals if send_for_deal(db, deal))
    return sent_count


def run_review_requests():
    """Scheduler entry point (safety-net sweep, runs every 30 min)."""
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
    """Admin: send the review-request MMS for a specific deal right now, bypassing the flag."""
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    deal.review_request_sent = False
    sent = send_for_deal(db, deal)
    db.commit()
    return {"ok": sent}


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
