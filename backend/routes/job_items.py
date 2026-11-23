"""Line items on a job (Deal) — Blue work–style custom services on bookings.

Items are stored in `line_items` with parent_type="job". Invoices created from a job
(/api/billing/invoices/from-job/{deal_id}) copy these lines automatically.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from money import compute_totals

router = APIRouter(prefix="/api/deals", tags=["job-items"])


class JobItemIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    qty: float = Field(default=1, gt=0, le=100000)
    unit_price_cents: int = Field(default=0, ge=0, le=100_000_000)
    taxable: bool = True
    service_id: Optional[int] = None


def _serialize(items):
    return [
        {
            "id": i.id, "name": i.name, "description": i.description, "qty": i.qty,
            "unit_price_cents": i.unit_price_cents, "taxable": i.taxable,
            "service_id": i.service_id, "position": i.position,
        }
        for i in items
    ]


def _get_deal(db: Session, deal_id: int) -> models.Deal:
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Job not found")
    return deal


@router.get("/{deal_id}/line-items")
def list_job_items(deal_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    _get_deal(db, deal_id)
    items = (db.query(models.LineItem)
             .filter(models.LineItem.parent_type == "job", models.LineItem.parent_id == deal_id)
             .order_by(models.LineItem.position, models.LineItem.id).all())
    return {"items": _serialize(items), "totals": compute_totals(items)}


@router.put("/{deal_id}/line-items")
def replace_job_items(deal_id: int, items: List[JobItemIn], db: Session = Depends(get_db),
                      user=Depends(get_current_user)):
    """Replace all line items of a job. Also sets deal.value = pre-tax subtotal (after nothing)."""
    deal = _get_deal(db, deal_id)
    db.query(models.LineItem).filter(
        models.LineItem.parent_type == "job", models.LineItem.parent_id == deal_id
    ).delete(synchronize_session=False)
    rows = []
    for pos, it in enumerate(items):
        row = models.LineItem(
            parent_type="job", parent_id=deal_id, service_id=it.service_id,
            name=it.name.strip(), description=(it.description or None),
            qty=it.qty, unit_price_cents=it.unit_price_cents, taxable=it.taxable, position=pos,
        )
        db.add(row)
        rows.append(row)
    totals = compute_totals(rows)
    if rows:
        deal.value = round(totals["subtotal_cents"] / 100, 2)
    db.commit()
    for r in rows:
        db.refresh(r)
    return {"items": _serialize(rows), "totals": totals}
