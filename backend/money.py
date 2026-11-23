"""Money helpers shared by quotes, invoices and plans (Québec taxes, integer cents)."""
import secrets

TPS_RATE = 0.05      # GST
TVQ_RATE = 0.09975   # QST


def new_token() -> str:
    return secrets.token_urlsafe(24)


def compute_totals(items, discount_type=None, discount_value=0, tip_cents=0):
    """items: iterables of objects/dicts with qty, unit_price_cents, taxable.
    Discount is applied before taxes, spread proportionally over taxable lines.
    Returns dict of *_cents ints."""
    def g(i, k, d=None):
        return i.get(k, d) if isinstance(i, dict) else getattr(i, k, d)

    subtotal = 0
    taxable = 0
    for i in items:
        line = round((g(i, "qty", 1) or 0) * (g(i, "unit_price_cents", 0) or 0))
        subtotal += line
        if g(i, "taxable", True):
            taxable += line

    if discount_type == "percent":
        discount = round(subtotal * min(max(discount_value or 0, 0), 100) / 100)
    elif discount_type == "fixed":
        discount = min(int(discount_value or 0), subtotal)
    else:
        discount = 0

    taxable_after = taxable - (round(discount * taxable / subtotal) if subtotal else 0)
    tps = round(taxable_after * TPS_RATE)
    tvq = round(taxable_after * TVQ_RATE)
    total = subtotal - discount + tps + tvq + (tip_cents or 0)
    return {
        "subtotal_cents": subtotal,
        "discount_cents": discount,
        "tps_cents": tps,
        "tvq_cents": tvq,
        "total_cents": total,
    }


def next_number(db, model, prefix: str, start: int = 1001) -> str:
    """Next sequential document number like Q-1001 / F-1001."""
    last = db.query(model.number).filter(model.number.like(f"{prefix}-%")).all()
    nums = [int(n[0].split("-", 1)[1]) for n in last if n[0] and n[0].split("-", 1)[1].isdigit()]
    return f"{prefix}-{(max(nums) + 1) if nums else start}"
