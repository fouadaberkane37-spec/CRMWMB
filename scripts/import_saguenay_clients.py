#!/usr/bin/env python3
"""
Import a batch of clients from a CSV into the WMB CRM `contacts` table and tag
them as a segment for Twilio SMS automation.

CSV columns (header row required):
    Name, Email Address, Phone Number, Home Address, Total Revenue

What it does:
  * Cleans data:
      - Phone -> E.164 (+1XXXXXXXXXX). Invalid/missing phones are FLAGGED in the
        report (not silently dropped); the client is still imported without a phone.
      - Addresses trimmed; names title-cased and split into first/last.
      - "Total Revenue" parsed to a number (handles CAD, $, thousands, and the
        Quebec "200,00" comma-decimal format).
  * Deduplicates against existing contacts by E.164 phone first, then by a
    *real* (non-placeholder) email. Existing matches are UPDATED (address /
    revenue / tag / source) instead of duplicated.
  * Tags every imported/updated client with --tag (default "Saguenay") and sets
    --source (default "import_saguenay_2026-07") for traceability.
  * Prints a summary: created / updated / skipped (+reasons) and all flags.

Dry-run by default. Pass --commit to write. Point at a specific DB with --db-url
(e.g. a throwaway SQLite file for a dev run, or the Railway Postgres URL for prod).

Examples:
    # Dev dry-run against a scratch SQLite DB
    python scripts/import_saguenay_clients.py \
        --csv data/Clients_Saguenay.csv --db-url sqlite:///./dev_import.db

    # Commit for real
    python scripts/import_saguenay_clients.py \
        --csv data/Clients_Saguenay.csv --db-url sqlite:///./dev_import.db --commit
"""
import argparse
import csv
import os
import re
import sys

BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, BACKEND)


# ── Cleaning helpers ──────────────────────────────────────────────────────────

def normalize_phone(raw: str):
    """Return (e164_or_None, error_or_None). Recovers common QC formats."""
    if not raw or not raw.strip():
        return None, "missing"
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits.startswith("1"):
        e164 = "+" + digits
    elif len(digits) == 10:
        e164 = "+1" + digits            # NANP number missing the country code
    else:
        return None, f"invalid ({raw.strip()!r})"
    # NANP sanity: area code and exchange must start 2-9
    if e164[2] in "01" or e164[5] in "01":
        return None, f"invalid ({raw.strip()!r})"
    return e164, None


_PLACEHOLDER_LOCALS = {"yes", "no", "none", "tes", "test", "yesnoemail"}


def clean_email(raw: str):
    """Return (email_or_None, is_placeholder, is_invalid)."""
    if not raw or not raw.strip():
        return None, False, False
    e = raw.strip()
    # A phone number wound up in the email column, etc.
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e):
        return None, False, True
    local, _, domain = e.lower().partition("@")
    placeholder = local in _PLACEHOLDER_LOCALS or domain in {"gmail.clm", "glail.com", "glail.vom", "gnail.com"}
    return e, placeholder, False


def parse_revenue(raw: str):
    if not raw or not raw.strip():
        return None
    s = raw.upper().replace("CAD", "").replace("$", "")
    s = s.replace(" ", " ").strip()
    s = s.replace(" ", "")
    if "," in s and "." in s:            # 1.505,35 -> 1505.35
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:                       # 200,00 -> 200.00
        s = s.replace(",", ".")
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def _cap(word: str) -> str:
    return (word[:1].upper() + word[1:].lower()) if word else word


def titlecase_name(s: str) -> str:
    out = []
    for part in re.split(r"(\s+)", s.strip()):
        if not part or part.isspace():
            out.append(part)
            continue
        tokens = re.split(r"([-'’])", part)
        out.append("".join(t if t in "-'’" else _cap(t) for t in tokens))
    return "".join(out)


def split_name(raw: str):
    n = " ".join((raw or "").split())
    if not n:
        return None, None
    n = titlecase_name(n)
    parts = n.split(" ")
    return parts[0], (" ".join(parts[1:]) or None)


# ── Import ────────────────────────────────────────────────────────────────────

def run(csv_path, tag, source, status, commit, db_url, merge_name_mismatch=False):
    if db_url:
        os.environ["DATABASE_URL"] = db_url

    from database import SessionLocal, engine, Base
    import models

    Base.metadata.create_all(bind=engine)  # ensure schema (fresh dev DBs)
    db = SessionLocal()

    # Preload existing contacts for dedup
    existing = db.query(models.Contact).filter(models.Contact.deleted_at.is_(None)).all()
    by_phone, by_email = {}, {}
    for c in existing:
        e164, err = normalize_phone(c.phone or "")
        if e164:
            by_phone.setdefault(e164, c)
        em, ph, inv = clean_email(c.email or "")
        if em and not ph:
            by_email.setdefault(em.lower(), c)

    created = updated = skipped = 0
    flags = {"no_phone": [], "invalid_phone": [], "bad_email": [],
             "placeholder_email": [], "no_revenue": [], "collision": []}
    skips = []

    def add_tag(contact):
        tags = [t.strip() for t in (contact.tags or "").split(",") if t.strip()]
        if tag not in tags:
            tags.append(tag)
        contact.tags = ",".join(tags)

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for i, row in enumerate(csv.DictReader(f), start=1):
            name_raw = (row.get("Name") or "").strip()
            first, last = split_name(name_raw)
            if not first:
                skipped += 1
                skips.append(f"row {i}: no name")
                continue

            label = name_raw
            e164, perr = normalize_phone(row.get("Phone Number") or "")
            if perr == "missing":
                flags["no_phone"].append(label)
            elif perr:
                flags["invalid_phone"].append(f"{label} — {perr}")

            email, is_ph, is_inv = clean_email(row.get("Email Address") or "")
            if is_inv:
                flags["bad_email"].append(f"{label} — {(row.get('Email Address') or '').strip()!r}")
            elif is_ph:
                flags["placeholder_email"].append(label)

            revenue = parse_revenue(row.get("Total Revenue") or "")
            if revenue is None:
                flags["no_revenue"].append(label)

            address = " ".join((row.get("Home Address") or "").split()) or None

            # Dedup: phone first, then real (non-placeholder) email.
            match = None
            phone_hit = by_phone.get(e164) if e164 else None
            if phone_hit is not None:
                same_name = (phone_hit.first_name or "").lower() == (first or "").lower()
                if same_name or merge_name_mismatch:
                    match = phone_hit
                    if not same_name:
                        flags["collision"].append(
                            f"{label} ({e164}) MERGED into existing '{phone_hit.first_name} {phone_hit.last_name or ''}'".strip()
                        )
                else:
                    # Same phone, different person — keep separate, don't merge.
                    flags["collision"].append(
                        f"{label} ({e164}) kept SEPARATE — shares phone with existing "
                        f"'{phone_hit.first_name} {phone_hit.last_name or ''}'".strip()
                    )
            elif email and not is_ph and email.lower() in by_email:
                match = by_email[email.lower()]

            if match:
                if address:
                    match.address = address
                if revenue is not None:
                    match.price = revenue
                if email and not match.email:
                    match.email = email
                add_tag(match)
                if not match.source:
                    match.source = source
                updated += 1
            else:
                c = models.Contact(
                    first_name=first, last_name=last,
                    email=email, phone=e164, address=address,
                    price=revenue, status=status,
                    tags=tag, source=source, created_by=None,
                )
                db.add(c)
                created += 1
                if e164:
                    by_phone.setdefault(e164, c)
                if email and not is_ph:
                    by_email.setdefault(email.lower(), c)

    if commit:
        db.commit()
    else:
        db.rollback()
    db.close()

    # ── Report ────────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"IMPORT {'(COMMITTED)' if commit else '(DRY-RUN — nothing written)'}")
    print(f"  file   : {csv_path}")
    print(f"  tag    : {tag}")
    print(f"  source : {source}")
    print(f"  status : {status}")
    print("-" * 60)
    print(f"  created : {created}")
    print(f"  updated : {updated}")
    print(f"  skipped : {skipped}")
    for reason in skips:
        print(f"      - {reason}")
    print("-" * 60)
    print("  FLAGS (imported, but need attention):")
    print(f"    missing phone (no SMS possible) : {len(flags['no_phone'])}")
    for x in flags["no_phone"]:
        print(f"        · {x}")
    print(f"    invalid phone                   : {len(flags['invalid_phone'])}")
    for x in flags["invalid_phone"]:
        print(f"        · {x}")
    print(f"    email in wrong format (dropped) : {len(flags['bad_email'])}")
    for x in flags["bad_email"]:
        print(f"        · {x}")
    print(f"    placeholder email (kept, not used for dedup) : {len(flags['placeholder_email'])}")
    print(f"    no/blank revenue                : {len(flags['no_revenue'])}")
    for x in flags["no_revenue"]:
        print(f"        · {x}")
    print(f"    !! phone collisions (same phone, different name) : {len(flags['collision'])}")
    for x in flags["collision"]:
        print(f"        · {x}")
    print("=" * 60 + "\n")
    return {"created": created, "updated": updated, "skipped": skipped, "flags": flags}


def main():
    p = argparse.ArgumentParser(description="Import + tag a client CSV into the CRM.")
    p.add_argument("--csv", default="data/Clients_Saguenay.csv")
    p.add_argument("--tag", default="Saguenay")
    p.add_argument("--source", default="import_saguenay_2026-07")
    p.add_argument("--status", default="customer",
                   choices=["lead", "prospect", "customer", "inactive"])
    p.add_argument("--commit", action="store_true", help="write to DB (default: dry-run)")
    p.add_argument("--db-url", default=None, help="override DATABASE_URL for this run")
    p.add_argument("--merge-name-mismatch", action="store_true",
                   help="merge when a phone matches but the name differs (default: keep separate)")
    args = p.parse_args()
    run(args.csv, args.tag, args.source, args.status, args.commit, args.db_url,
        merge_name_mismatch=args.merge_name_mismatch)


if __name__ == "__main__":
    main()
