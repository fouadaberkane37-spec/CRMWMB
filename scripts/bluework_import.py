#!/usr/bin/env python3
"""Import a Blue work CSV export into ZF CRM (idempotent; dry-run unless --commit).

  python scripts/bluework_import.py --entity customers --file customers.csv
  python scripts/bluework_import.py --entity jobs --file jobs.csv --mapping '{"customer_id":"Client ID"}' --commit

Recommended order: customers, leads, jobs, quotes, invoices, service_plans.
--mapping is a JSON {field: csv header}; unspecified fields are auto-guessed (EN/FR headers).
"""
import argparse
import json
import os
import sys

BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, BACKEND)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--entity", required=True,
                    choices=["customers", "leads", "jobs", "quotes", "invoices", "service_plans"])
    ap.add_argument("--file", required=True)
    ap.add_argument("--mapping", help="JSON {field: header} overriding the auto-guess")
    ap.add_argument("--commit", action="store_true", help="write to the database (default: dry-run)")
    ap.add_argument("--db-url", help="override DATABASE_URL")
    a = ap.parse_args()
    if a.db_url:
        os.environ["DATABASE_URL"] = a.db_url

    from database import SessionLocal, engine, Base
    import models  # noqa: F401
    from bridge import bluework as bw

    with open(a.file, "rb") as f:
        headers, rows = bw.read_csv(f.read())
    mapping = bw.guess_mapping(a.entity, headers)
    if a.mapping:
        mapping.update(json.loads(a.mapping))
    print("Mapping:", json.dumps(mapping, ensure_ascii=False))
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        rep = bw.run_import(db, a.entity, rows, mapping, dry_run=not a.commit)
    finally:
        db.close()
    print(f"{'COMMITTED' if a.commit else 'DRY RUN (nothing written; use --commit)'}: "
          f"created={rep['created']} updated={rep['updated']} skipped={rep['skipped']}")
    for k in ("errors", "warnings"):
        for e in rep[k][:50]:
            print(f"  {k[:-1]} row {e['row']}: {e['reason']}")
    sys.exit(1 if rep["errors"] and not (rep["created"] or rep["updated"]) else 0)


if __name__ == "__main__":
    main()
