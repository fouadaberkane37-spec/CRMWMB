#!/usr/bin/env python3
"""
Import past, paid Blue work clients ("client payé") into ZF CRM `contacts`.

CSV columns: name, phone, email, address, status, tags, created_at, blueworks_id
(UTF-8 with BOM is fine — read as utf-8-sig).

Contacts only: no jobs, invoices, messages or properties are created, so none of
the deal-based automations (24h/48h reminders, review requests, invoice SMS) can
fire. Nothing here sends SMS or email.

Per row:
  * name / address trimmed (address kept as written — no geocoding, no city fix)
  * phone -> E.164 (+1XXXXXXXXXX); empty phone is still imported (phone = NULL)
  * empty email -> NULL
  * status "customer", tag "Client payé", source "import_blueworks_2026-11-27"
  * blueworks_id -> contacts.external_ref as "bw:c:<id>" (same format as the bridge)
  * created_at = CSV date
  * notes = IMPORT_NOTE

Skipped (with the reason) when a contact already exists with:
  the same Blue work id (external_ref, or the id written in notes),
  the same normalized phone, or the same name + address (case-insensitive, trimmed).
Soft-deleted contacts count as existing (so a deleted client is not re-created).

Dry-run by default. --commit writes everything in ONE transaction.

  python scripts/import_blueworks_closed_clients.py --csv clients.csv --db-url "$DATABASE_URL"
  python scripts/import_blueworks_closed_clients.py --csv clients.csv --db-url "$DATABASE_URL" --commit
"""
import argparse
import csv
import os
import re
import sys
from datetime import datetime

BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, BACKEND)

TAG = "Client payé"
SOURCE = "import_blueworks_2026-11-27"
STATUS = "customer"  # contacts.status allows lead|prospect|customer|inactive
IMPORT_NOTE = "Imported from Blueworks, 2026-11-27. Do not contact until campaign approved."
REQUIRED_COLS = {"name", "phone", "email", "address", "status", "tags", "created_at", "blueworks_id"}
DANGEROUS_ENV = ("WIPE_DATA", "STARTUP_DEDUP_CONTACTS", "STARTUP_DEAL_CLEANUP")


# ── Cleaning ──────────────────────────────────────────────────────────────────

def clean(s):
    return (s or "").strip()


def normalize_phone(raw):
    """-> (e164 | None, error | None). Empty -> (None, None)."""
    raw = clean(raw)
    if not raw:
        return None, None
    d = re.sub(r"\D", "", raw)
    if len(d) == 10:
        d = "1" + d
    if len(d) != 11 or not d.startswith("1") or d[1] in "01" or d[4] in "01":
        return None, "invalid phone"
    return "+" + d, None


def split_name(full):
    parts = " ".join(full.split()).split(" ", 1)
    return parts[0], (parts[1] if len(parts) > 1 else None)


def key_name_addr(name, address):
    norm = lambda s: " ".join((s or "").split()).casefold()
    return (norm(name), norm(address))


def mask(phone):
    return f"…{phone[-4:]}" if phone else "no phone"


def parse_date(raw):
    raw = clean(raw)
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    raise ValueError(f"bad created_at {raw!r}")


def ref_of(bw_id):
    return f"bw:c:{bw_id}"


# ── Import ────────────────────────────────────────────────────────────────────

def read_rows(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        missing = REQUIRED_COLS - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"CSV is missing columns: {sorted(missing)}")
        return list(reader)


def build_indexes(db, models):
    by_phone, by_name_addr, by_bw = {}, {}, {}
    uuid_re = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
    for c in db.query(models.Contact).all():  # includes soft-deleted on purpose
        label = f"contact #{c.id}" + (" (soft-deleted)" if c.deleted_at else "")
        e164, _ = normalize_phone(c.phone)
        if e164:
            by_phone.setdefault(e164, label)
        name = f"{c.first_name or ''} {c.last_name or ''}"
        if clean(name) and clean(c.address):
            by_name_addr.setdefault(key_name_addr(name, c.address), label)
        ext = clean(c.external_ref)
        if ext:
            by_bw.setdefault(ext.split(":")[-1].lower(), label)
        for u in uuid_re.findall(c.notes or ""):
            by_bw.setdefault(u.lower(), label)
    return by_phone, by_name_addr, by_bw


def plan(rows, by_phone, by_name_addr, by_bw):
    """-> (to_insert: list[dict], skipped: list[(row_no, name, reason)])"""
    to_insert, skipped = [], []
    for i, r in enumerate(rows, start=2):  # row 1 is the header
        name, address, bw_id = clean(r["name"]), clean(r["address"]) or None, clean(r["blueworks_id"])
        if not name:
            skipped.append((i, "?", "no name"))
            continue
        phone, perr = normalize_phone(r["phone"])
        if perr:
            skipped.append((i, name, perr))
            continue
        try:
            created = parse_date(r["created_at"])
        except ValueError as e:
            skipped.append((i, name, str(e)))
            continue

        reason = None
        if bw_id and bw_id.lower() in by_bw:
            reason = f"same blueworks_id as {by_bw[bw_id.lower()]}"
        elif phone and phone in by_phone:
            reason = f"same phone ({mask(phone)}) as {by_phone[phone]}"
        elif address and key_name_addr(name, address) in by_name_addr:
            reason = f"same name+address as {by_name_addr[key_name_addr(name, address)]}"
        if reason:
            skipped.append((i, name, reason))
            continue

        first, last = split_name(name)
        to_insert.append(dict(
            first_name=first, last_name=last, phone=phone,
            email=clean(r["email"]) or None, address=address,
            status=STATUS, tags=TAG, source=SOURCE, notes=IMPORT_NOTE,
            external_ref=ref_of(bw_id) if bw_id else None,
            created_at=created or datetime.utcnow(), updated_at=datetime.utcnow(),
            created_by=None,
        ))
        # in-file duplicates are caught against what we're about to insert
        label = f"CSV row {i}"
        if bw_id:
            by_bw[bw_id.lower()] = label
        if phone:
            by_phone[phone] = label
        if address:
            by_name_addr[key_name_addr(name, address)] = label
    return to_insert, skipped


def run(csv_path, db_url, commit):
    os.environ["DATABASE_URL"] = db_url
    from sqlalchemy import inspect
    from database import SessionLocal, engine
    import models

    for k in DANGEROUS_ENV:
        if os.getenv(k) == "1":
            raise SystemExit(f"ABORT: {k}=1 is set in this environment.")

    cols = {c["name"] for c in inspect(engine).get_columns("contacts")}
    need = {"external_ref", "tags", "source", "notes", "deleted_at", "created_at"}
    if need - cols:
        raise SystemExit(f"ABORT: contacts table lacks columns {sorted(need - cols)}")

    rows = read_rows(csv_path)
    db = SessionLocal()
    try:
        to_insert, skipped = plan(rows, *build_indexes(db, models))

        print("=" * 60)
        print("COMMIT" if commit else "DRY RUN — nothing written")
        print(f"  rows read     : {len(rows)}")
        print(f"  {'inserted' if commit else 'would insert'}  : {len(to_insert)}"
              f"  (no phone: {sum(1 for x in to_insert if not x['phone'])})")
        print(f"  {'skipped' if commit else 'would skip'}    : {len(skipped)}")
        for row_no, name, reason in skipped:
            print(f"      row {row_no}: {name} — {reason}")

        if not commit:
            db.rollback()
            return {"read": len(rows), "insert": len(to_insert), "skip": len(skipped)}

        before = db.query(models.Contact).count()
        new = [models.Contact(**x) for x in to_insert]
        try:
            db.add_all(new)
            db.flush()
            after = db.query(models.Contact).count()
            if after - before != len(new):
                raise RuntimeError(f"count check failed: {before} -> {after}, expected +{len(new)}")
            db.commit()
        except Exception:
            db.rollback()
            print("ROLLED BACK — nothing written")
            raise

        total = db.query(models.Contact).filter(models.Contact.source == SOURCE).count()
        print(f"  contacts before/after : {before} -> {after}")
        print(f"  contacts with source {SOURCE}: {total}")
        print("-" * 60 + "\n  5 sample records:")
        for c in new[:5]:
            db.refresh(c)
            print(f"    #{c.id} {c.first_name} {c.last_name or ''} | {c.phone} | {c.address} | "
                  f"status={c.status} tags={c.tags} ext={c.external_ref} created={c.created_at:%Y-%m-%d}")
            print(f"        notes: {c.notes}")
        return {"read": len(rows), "insert": len(new), "skip": len(skipped)}
    finally:
        db.close()
        print("=" * 60)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", required=True)
    p.add_argument("--db-url", default=os.getenv("DATABASE_URL"),
                   help="target DB (default: $DATABASE_URL). Required — no silent SQLite fallback.")
    p.add_argument("--commit", action="store_true", help="write (default: dry-run)")
    a = p.parse_args()
    if not a.db_url:
        raise SystemExit("Set --db-url or DATABASE_URL.")
    run(a.csv, a.db_url, a.commit)


if __name__ == "__main__":
    main()
