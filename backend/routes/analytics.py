from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date as date_type, timedelta, datetime
from typing import Optional
from database import get_db
import models
from auth import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _iter_dates(start: date_type, end: date_type):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


def _to_str(val) -> str:
    """Normalise func.date() return: SQLite returns str, PostgreSQL returns date."""
    if val is None:
        return ""
    if isinstance(val, str):
        return val
    return val.isoformat()


@router.get("/sales")
def sales_analytics(
    start: str = Query(..., description="YYYY-MM-DD"),
    end:   str = Query(..., description="YYYY-MM-DD"),
    user_id: Optional[int] = Query(None, description="Admin only: view another user"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Resolve target user — admin can view any user, others see only themselves
    if user_id and current_user.role in ("admin", "ceo"):
        from fastapi import HTTPException as _HTTPException
        target_user = db.query(models.User).filter(models.User.id == user_id).first()
        if not target_user:
            raise _HTTPException(status_code=404, detail="User not found")
        target_id = target_user.id
    else:
        target_id = current_user.id

    try:
        start_dt = datetime.strptime(start, "%Y-%m-%d").date()
        end_dt   = datetime.strptime(end,   "%Y-%m-%d").date()
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Invalid date format, expected YYYY-MM-DD")

    if start_dt > end_dt:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="start must be <= end")

    # Cap range at 90 days for performance
    end_dt = min(end_dt, start_dt + timedelta(days=89))

    # ── Totals ────────────────────────────────────────────────────────────────
    # Contacts created (filter out soft-deleted if column exists)
    contacts_q = (
        db.query(func.count(models.Contact.id))
        .filter(
            models.Contact.created_by == target_id,
            func.date(models.Contact.created_at) >= start_dt,
            func.date(models.Contact.created_at) <= end_dt,
        )
    )
    try:
        contacts_q = contacts_q.filter(models.Contact.deleted_at.is_(None))
    except Exception:
        pass
    contacts_total = contacts_q.scalar() or 0

    appointments_total = (
        db.query(func.count(models.Deal.id))
        .filter(
            models.Deal.created_by == target_id,
            func.date(models.Deal.created_at) >= start_dt,
            func.date(models.Deal.created_at) <= end_dt,
        )
        .scalar() or 0
    )

    pins_total = (
        db.query(func.count(models.Knock.id))
        .filter(
            models.Knock.created_by == target_id,
            func.date(models.Knock.created_at) >= start_dt,
            func.date(models.Knock.created_at) <= end_dt,
        )
        .scalar() or 0
    )

    # ── Daily breakdown (single GROUP BY query per metric) ────────────────────
    contact_rows = (
        db.query(
            func.date(models.Contact.created_at).label("day"),
            func.count(models.Contact.id).label("cnt"),
        )
        .filter(
            models.Contact.created_by == target_id,
            func.date(models.Contact.created_at) >= start_dt,
            func.date(models.Contact.created_at) <= end_dt,
        )
    )
    try:
        contact_rows = contact_rows.filter(models.Contact.deleted_at.is_(None))
    except Exception:
        pass
    contact_rows = contact_rows.group_by(func.date(models.Contact.created_at)).all()

    deal_rows = (
        db.query(
            func.date(models.Deal.created_at).label("day"),
            func.count(models.Deal.id).label("cnt"),
        )
        .filter(
            models.Deal.created_by == target_id,
            func.date(models.Deal.created_at) >= start_dt,
            func.date(models.Deal.created_at) <= end_dt,
        )
        .group_by(func.date(models.Deal.created_at))
        .all()
    )

    pin_rows = (
        db.query(
            func.date(models.Knock.created_at).label("day"),
            func.count(models.Knock.id).label("cnt"),
        )
        .filter(
            models.Knock.created_by == target_id,
            func.date(models.Knock.created_at) >= start_dt,
            func.date(models.Knock.created_at) <= end_dt,
        )
        .group_by(func.date(models.Knock.created_at))
        .all()
    )

    c_map = {_to_str(r.day): r.cnt for r in contact_rows}
    d_map = {_to_str(r.day): r.cnt for r in deal_rows}
    p_map = {_to_str(r.day): r.cnt for r in pin_rows}

    daily_breakdown = [
        {
            "date":         d.isoformat(),
            "contacts":     c_map.get(d.isoformat(), 0),
            "appointments": d_map.get(d.isoformat(), 0),
            "pins":         p_map.get(d.isoformat(), 0),
        }
        for d in _iter_dates(start_dt, end_dt)
    ]

    return {
        "contacts_created":    contacts_total,
        "appointments_booked": appointments_total,
        "pins_placed":         pins_total,
        "daily_breakdown":     daily_breakdown,
    }
