import os
import hmac
import hashlib
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from database import get_db
import models
from auth import get_current_user, SECRET_KEY

log = logging.getLogger("invoices")

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

COMPANY_NAME    = os.getenv("COMPANY_NAME",    "WMB Window & Maintenance")
COMPANY_PHONE   = os.getenv("COMPANY_PHONE",   "(514) 559-7007")
COMPANY_EMAIL   = os.getenv("COMPANY_EMAIL",   "")
COMPANY_ADDRESS = os.getenv("COMPANY_ADDRESS", "575 Robert-Élie, Laval, QC H7N 0E8")

SERVICE_LABELS = {
    "window-ext": "Windows (Exterior)",
    "window-int": "Windows (Interior)",
    "gutters":    "Gutter Cleaning",
    "pressure":   "Pressure Washing",
    "roof":       "Roof Cleaning",
    "screens":    "Screen Cleaning",
    "solar":      "Solar Panels",
    "lawn-mowing":  "Lawn Mowing",
    "hedge-trim":   "Hedge Trimming",
    "landscaping":  "Landscaping",
    "snow-removal": "Snow Removal",
    "mulching":     "Mulching",
    "aeration":     "Aeration",
}

STATUS_LABEL = {
    "todo":            "Due",
    "payment_pending": "Payment Pending",
    "done":            "Paid",
    "cancelled":       "Cancelled",
}


def _invoice_context(deal: models.Deal) -> dict:
    """Shared data prep used by both the in-app (flex) and PDF (table) invoice templates."""
    contact = deal.contact
    client_name = ""
    client_address = ""
    client_phone = ""

    if contact:
        client_name = f"{contact.first_name or ''} {contact.last_name or ''}".strip()
        client_address = contact.address or ""
        client_phone = contact.phone or ""

    if not client_name:
        client_name = deal.title or f"Deal #{deal.id}"

    # Invoice number: INV-YYYYMM-{id:04d}
    now = datetime.utcnow()
    inv_number = f"INV-{now.strftime('%Y%m')}-{deal.id:04d}"
    inv_date   = now.strftime("%B %d, %Y")

    svc_date = ""
    if deal.expected_close_date:
        svc_date = deal.expected_close_date.strftime("%B %d, %Y")

    # Build service rows
    svc_keys = [s.strip() for s in (contact.services if contact and contact.services else "").split(",") if s.strip()]
    if svc_keys:
        rows_html = ""
        for key in svc_keys:
            label = SERVICE_LABELS.get(key, key.replace("-", " ").title())
            rows_html += f"""
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">{label}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">1</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">—</td>
            </tr>"""
        # Total row
        rows_html += f"""
            <tr style="background:#f9fafb;">
              <td colspan="2" style="padding:12px;font-weight:700;text-align:right;">TOTAL</td>
              <td style="padding:12px;font-weight:700;text-align:right;font-size:18px;">${deal.value:,.2f}</td>
            </tr>"""
    else:
        rows_html = f"""
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">Services rendered</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">1</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${deal.value:,.2f}</td>
            </tr>
            <tr style="background:#f9fafb;">
              <td colspan="2" style="padding:12px;font-weight:700;text-align:right;">TOTAL</td>
              <td style="padding:12px;font-weight:700;text-align:right;font-size:18px;">${deal.value:,.2f}</td>
            </tr>"""

    status_lbl  = STATUS_LABEL.get(deal.job_status, deal.job_status.replace("_", " ").title())
    status_color = "#10b981" if deal.job_status == "done" else "#f59e0b" if deal.job_status == "payment_pending" else "#6366f1"

    company_email_line = f'<div>{COMPANY_EMAIL}</div>' if COMPANY_EMAIL else ''

    return dict(
        client_name=client_name, client_address=client_address, client_phone=client_phone,
        inv_number=inv_number, inv_date=inv_date, svc_date=svc_date, rows_html=rows_html,
        status_lbl=status_lbl, status_color=status_color, company_email_line=company_email_line,
    )


def _invoice_html(deal: models.Deal) -> str:
    ctx = _invoice_context(deal)
    client_name = ctx["client_name"]; client_address = ctx["client_address"]; client_phone = ctx["client_phone"]
    inv_number = ctx["inv_number"]; inv_date = ctx["inv_date"]; svc_date = ctx["svc_date"]
    rows_html = ctx["rows_html"]; status_lbl = ctx["status_lbl"]; status_color = ctx["status_color"]
    company_email_line = ctx["company_email_line"]

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice {inv_number}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: #fff; }}
    .page {{ max-width: 720px; margin: 0 auto; padding: 48px 40px; }}
    .header {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; }}
    .logo {{ font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #111827; }}
    .logo span {{ color: #6366f1; }}
    .company-info {{ text-align: right; font-size: 13px; color: #6b7280; line-height: 1.7; }}
    .invoice-meta {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }}
    .invoice-title {{ font-size: 32px; font-weight: 800; color: #111827; letter-spacing: -1px; }}
    .invoice-number {{ font-size: 14px; color: #9ca3af; margin-top: 4px; }}
    .status-badge {{
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #fff;
      background: {status_color};
      margin-top: 10px;
    }}
    .bill-section {{ display: flex; gap: 48px; margin-bottom: 40px; }}
    .bill-block {{ flex: 1; }}
    .bill-label {{ font-size: 10px; font-weight: 700; letter-spacing: 1.2px; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px; }}
    .bill-name {{ font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 4px; }}
    .bill-detail {{ font-size: 13px; color: #6b7280; line-height: 1.6; }}
    .date-row {{ display: flex; gap: 40px; }}
    .date-block {{ }}
    table {{ width: 100%; border-collapse: collapse; margin-bottom: 32px; }}
    thead tr {{ background: #111827; color: #fff; }}
    thead th {{ padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; }}
    thead th:nth-child(2) {{ text-align: center; }}
    thead th:nth-child(3) {{ text-align: right; }}
    tbody tr:nth-child(even) {{ background: #f9fafb; }}
    .footer {{ border-top: 1px solid #e5e7eb; padding-top: 24px; display: flex; justify-content: space-between; align-items: center; }}
    .footer-note {{ font-size: 12px; color: #9ca3af; }}
    .total-big {{ font-size: 28px; font-weight: 800; color: #111827; }}
    @media print {{
      body {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
      .no-print {{ display: none; }}
      .page {{ padding: 24px; }}
    }}
    .print-btn {{
      display: block; width: 100%; margin-bottom: 24px;
      padding: 14px; background: #6366f1; color: #fff;
      border: none; border-radius: 12px; font-size: 15px; font-weight: 700;
      cursor: pointer; letter-spacing: 0.3px;
    }}
    .print-btn:hover {{ background: #4f46e5; }}
  </style>
</head>
<body>
<div class="page">
  <button class="print-btn no-print" onclick="window.print()">⬇ Save / Print PDF</button>

  <!-- Header -->
  <div class="header">
    <div>
      <div class="logo">WMB<span>.</span></div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Window &amp; Maintenance</div>
    </div>
    <div class="company-info">
      <div style="font-weight:700;color:#111827;">{COMPANY_NAME}</div>
      <div>{COMPANY_ADDRESS}</div>
      <div>{COMPANY_PHONE}</div>
      {company_email_line}
    </div>
  </div>

  <!-- Invoice title + status -->
  <div class="invoice-meta">
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-number">{inv_number}</div>
      <div><span class="status-badge">{status_lbl.upper()}</span></div>
    </div>
    <div class="date-row">
      <div class="date-block">
        <div class="bill-label">Invoice Date</div>
        <div style="font-size:14px;font-weight:600;">{inv_date}</div>
      </div>
      {"<div class='date-block'><div class='bill-label'>Service Date</div><div style='font-size:14px;font-weight:600;'>" + svc_date + "</div></div>" if svc_date else ""}
    </div>
  </div>

  <!-- Bill to -->
  <div class="bill-section">
    <div class="bill-block">
      <div class="bill-label">Bill To</div>
      <div class="bill-name">{client_name}</div>
      <div class="bill-detail">
        {("<div>" + client_address + "</div>") if client_address else ""}
        {("<div>" + client_phone + "</div>") if client_phone else ""}
      </div>
    </div>
    <div class="bill-block">
      <div class="bill-label">From</div>
      <div class="bill-name">{COMPANY_NAME}</div>
      <div class="bill-detail">
        <div>{COMPANY_ADDRESS}</div>
        <div>{COMPANY_PHONE}</div>
      </div>
    </div>
  </div>

  <!-- Services table -->
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-note">Thank you for your business!</div>
    <div>
      <div style="font-size:11px;color:#9ca3af;text-align:right;margin-bottom:4px;">TOTAL DUE</div>
      <div class="total-big">${deal.value:,.2f}</div>
    </div>
  </div>
</div>
</body>
</html>"""


@router.get("/{deal_id}", response_class=HTMLResponse)
def get_invoice(deal_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    deal = (
        db.query(models.Deal)
        .filter(models.Deal.id == deal_id)
        .first()
    )
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Load contact eagerly
    if deal.contact_id:
        deal.contact = db.query(models.Contact).filter(models.Contact.id == deal.contact_id).first()

    return HTMLResponse(content=_invoice_html(deal))


# ── Public (unauthenticated) invoice link — sent to clients via SMS ───────────

def _invoice_token(deal_id: int) -> str:
    """Short, deterministic, unguessable token — no DB storage needed."""
    return hmac.new(SECRET_KEY.encode(), f"invoice:{deal_id}".encode(), hashlib.sha256).hexdigest()[:24]


def invoice_public_url(deal_id: int) -> str:
    base_url = os.getenv("APP_URL", "https://crmwmb-production.up.railway.app")
    return f"{base_url}/api/invoices/public/{deal_id}?t={_invoice_token(deal_id)}"


def invoice_pdf_url(deal_id: int) -> str:
    base_url = os.getenv("APP_URL", "https://crmwmb-production.up.railway.app")
    return f"{base_url}/api/invoices/public/{deal_id}/pdf?t={_invoice_token(deal_id)}"


@router.get("/{deal_id}/links")
def get_invoice_links(deal_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Logged-in preview helper: the same public links/PDF that get MMS'd to the client, for testing."""
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return {"html_url": invoice_public_url(deal_id), "pdf_url": invoice_pdf_url(deal_id)}


@router.get("/public/{deal_id}", response_class=HTMLResponse)
def get_invoice_public(deal_id: int, t: str = Query(...), db: Session = Depends(get_db)):
    if not hmac.compare_digest(t, _invoice_token(deal_id)):
        raise HTTPException(status_code=403, detail="Invalid link")

    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    if deal.contact_id:
        deal.contact = db.query(models.Contact).filter(models.Contact.id == deal.contact_id).first()

    return HTMLResponse(content=_invoice_html(deal))


# ── PDF rendering ──────────────────────────────────────────────────────────────
# wkhtmltopdf (used via pdfkit) is an older WebKit build with no flexbox support,
# so the PDF template uses plain block/table layout instead of the .header/.bill-section
# flex rules from the in-app HTML invoice above.

def _invoice_html_pdf(deal: models.Deal) -> str:
    ctx = _invoice_context(deal)
    client_name = ctx["client_name"]; client_address = ctx["client_address"]; client_phone = ctx["client_phone"]
    inv_number = ctx["inv_number"]; inv_date = ctx["inv_date"]; svc_date = ctx["svc_date"]
    rows_html = ctx["rows_html"]; status_lbl = ctx["status_lbl"]; status_color = ctx["status_color"]
    company_email_line = ctx["company_email_line"]

    svc_date_cell = (
        f'<td style="padding-left:40px;"><div style="font-size:10px;font-weight:700;letter-spacing:1.2px;'
        f'color:#9ca3af;text-transform:uppercase;margin-bottom:4px;">Service Date</div>'
        f'<div style="font-size:14px;font-weight:600;">{svc_date}</div></td>' if svc_date else ""
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice {inv_number}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: Helvetica, Arial, sans-serif; color: #111827; background: #fff; }}
    .page {{ padding: 32px 40px; }}
    table.layout {{ width: 100%; border-collapse: collapse; }}
    .logo {{ font-size: 26px; font-weight: 800; color: #111827; }}
    .logo span {{ color: #6366f1; }}
    .company-info {{ text-align: right; font-size: 13px; color: #6b7280; line-height: 1.7; }}
    .invoice-title {{ font-size: 32px; font-weight: 800; color: #111827; }}
    .invoice-number {{ font-size: 14px; color: #9ca3af; margin-top: 4px; }}
    .status-badge {{
      display: inline-block; padding: 4px 12px; border-radius: 999px;
      font-size: 12px; font-weight: 700; letter-spacing: 0.5px;
      color: #fff; background: {status_color}; margin-top: 10px;
    }}
    .bill-label {{ font-size: 10px; font-weight: 700; letter-spacing: 1.2px; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px; }}
    .bill-name {{ font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 4px; }}
    .bill-detail {{ font-size: 13px; color: #6b7280; line-height: 1.6; }}
    table.items {{ width: 100%; border-collapse: collapse; margin: 32px 0; }}
    table.items thead tr {{ background: #111827; color: #fff; }}
    table.items thead th {{ padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; }}
    table.items thead th:nth-child(2) {{ text-align: center; }}
    table.items thead th:nth-child(3) {{ text-align: right; }}
    .footer-note {{ font-size: 12px; color: #9ca3af; }}
    .total-big {{ font-size: 28px; font-weight: 800; color: #111827; text-align: right; }}
  </style>
</head>
<body>
<div class="page">

  <table class="layout"><tr>
    <td style="vertical-align:top;">
      <div class="logo">WMB<span>.</span></div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Window &amp; Maintenance</div>
    </td>
    <td class="company-info" style="vertical-align:top;">
      <div style="font-weight:700;color:#111827;">{COMPANY_NAME}</div>
      <div>{COMPANY_ADDRESS}</div>
      <div>{COMPANY_PHONE}</div>
      {company_email_line}
    </td>
  </tr></table>

  <table class="layout" style="margin-top:40px;"><tr>
    <td style="vertical-align:top;">
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-number">{inv_number}</div>
      <div><span class="status-badge">{status_lbl.upper()}</span></div>
    </td>
    <td style="vertical-align:top;text-align:right;">
      <table style="margin-left:auto;"><tr>
        <td><div class="bill-label">Invoice Date</div><div style="font-size:14px;font-weight:600;">{inv_date}</div></td>
        {svc_date_cell}
      </tr></table>
    </td>
  </tr></table>

  <table class="layout" style="margin-top:40px;"><tr>
    <td style="vertical-align:top;width:50%;">
      <div class="bill-label">Bill To</div>
      <div class="bill-name">{client_name}</div>
      <div class="bill-detail">
        {("<div>" + client_address + "</div>") if client_address else ""}
        {("<div>" + client_phone + "</div>") if client_phone else ""}
      </div>
    </td>
    <td style="vertical-align:top;width:50%;">
      <div class="bill-label">From</div>
      <div class="bill-name">{COMPANY_NAME}</div>
      <div class="bill-detail">
        <div>{COMPANY_ADDRESS}</div>
        <div>{COMPANY_PHONE}</div>
      </div>
    </td>
  </tr></table>

  <table class="items">
    <thead>
      <tr><th>Description</th><th>Qty</th><th>Amount</th></tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>

  <table class="layout" style="border-top:1px solid #e5e7eb;padding-top:24px;"><tr>
    <td style="vertical-align:middle;padding-top:24px;"><span class="footer-note">Thank you for your business!</span></td>
    <td style="vertical-align:middle;padding-top:24px;text-align:right;">
      <div style="font-size:11px;color:#9ca3af;text-align:right;margin-bottom:4px;">TOTAL DUE</div>
      <div class="total-big">${deal.value:,.2f}</div>
    </td>
  </tr></table>

</div>
</body>
</html>"""


def invoice_pdf_bytes(deal: models.Deal) -> bytes:
    import pdfkit
    html = _invoice_html_pdf(deal)
    options = {"quiet": "", "page-size": "Letter", "margin-top": "0", "margin-bottom": "0", "margin-left": "0", "margin-right": "0"}
    return pdfkit.from_string(html, False, options=options)


@router.get("/public/{deal_id}/pdf")
def get_invoice_public_pdf(deal_id: int, t: str = Query(...), db: Session = Depends(get_db)):
    from fastapi import Response
    if not hmac.compare_digest(t, _invoice_token(deal_id)):
        raise HTTPException(status_code=403, detail="Invalid link")

    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    if deal.contact_id:
        deal.contact = db.query(models.Contact).filter(models.Contact.id == deal.contact_id).first()

    try:
        pdf_bytes = invoice_pdf_bytes(deal)
    except Exception as e:
        log.warning(f"PDF generation failed for deal {deal_id}: {e}")
        raise HTTPException(status_code=503, detail="PDF generation is temporarily unavailable")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="invoice-{deal_id}.pdf"'},
    )
