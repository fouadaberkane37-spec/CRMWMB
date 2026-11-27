"""scripts/import_blueworks_closed_clients.py: dedup rules, idempotency, no side effects."""
import os
import subprocess
import sys
import tempfile
import textwrap

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SCRIPT = os.path.join(ROOT, "scripts", "import_blueworks_closed_clients.py")
BACKEND = os.path.join(ROOT, "backend")

CSV = "﻿" + textwrap.dedent("""\
    name,phone,email,address,status,tags,created_at,blueworks_id
    Alice Tremblay,+15145550101,,"1 rue A, QC, Canada",past,Client payé,2026-11-10,aaaaaaaa-0000-0000-0000-000000000001
    Bob Roy,+15145550102,,"2 rue B, QC, Canada",past,Client payé,2026-11-10,aaaaaaaa-0000-0000-0000-000000000002
    Chloé Gagnon,,,"3 rue C, QC, Canada",past,Client payé,2026-11-10,aaaaaaaa-0000-0000-0000-000000000003
    Dan Côté,+15145550104,,"4 rue D, QC, Canada",past,Client payé,2026-11-10,aaaaaaaa-0000-0000-0000-000000000004
    Eve Lavoie,+15145550105,,"5 rue E, QC, Canada",past,Client payé,2026-11-10,aaaaaaaa-0000-0000-0000-000000000005
    Ibrahim,,,"  59 Chemin Belvédère, QC, Canada ",past,,2026-07-23,aaaaaaaa-0000-0000-0000-000000000006
    """)

SEED = """
import models
from database import Base, engine, SessionLocal
Base.metadata.create_all(bind=engine)
db = SessionLocal()
db.add_all([
    models.Contact(first_name="Robert", phone="(514) 555-0102"),                         # phone dup of Bob
    models.Contact(first_name="CHLOÉ", last_name="gagnon", address=" 3 rue c,  QC, Canada"),  # name+addr dup
    models.Contact(first_name="Daniel", external_ref="bw:c:aaaaaaaa-0000-0000-0000-000000000004"),
    models.Contact(first_name="Evelyne", notes="old id aaaaaaaa-0000-0000-0000-000000000005"),
])
db.commit()
"""

CHECK = """
import models
from database import SessionLocal
db = SessionLocal()
n = db.query(models.Contact).filter(models.Contact.source == "import_blueworks_2026-11-27").all()
print(len(n), db.query(models.Deal).count(), db.query(models.ChatMessage).count(),
      db.query(models.Property).count(), sorted((c.first_name, c.phone or "-", c.email or "-", c.address,
      c.status, c.tags, c.external_ref, c.created_at.strftime("%Y-%m-%d"), c.notes) for c in n))
"""


def _py(code, db_url):
    r = subprocess.run([sys.executable, "-c", textwrap.dedent(code)], cwd=BACKEND,
                       env={**os.environ, "DATABASE_URL": db_url}, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout


def _script(csv_path, db_url, *extra):
    r = subprocess.run([sys.executable, SCRIPT, "--csv", csv_path, "--db-url", db_url, *extra],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout


def test_import_flow():
    d = tempfile.mkdtemp()
    db_url = f"sqlite:///{d}/t.db"
    csv_path = os.path.join(d, "c.csv")
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write(CSV)
    _py(SEED, db_url)

    out = _script(csv_path, db_url)
    assert "rows read     : 6" in out and "would insert  : 2" in out and "would skip    : 4" in out
    assert "row 3: Bob Roy — same phone" in out
    assert "row 4: Chloé Gagnon — same name+address" in out
    assert "row 5: Dan Côté — same blueworks_id" in out
    assert "row 6: Eve Lavoie — same blueworks_id" in out
    assert "5145550102" not in out  # phones masked
    assert _py(CHECK, db_url).startswith("0 0 0 0")  # dry run wrote nothing

    out = _script(csv_path, db_url, "--commit")
    assert "inserted  : 2" in out
    res = _py(CHECK, db_url)
    assert res.startswith("2 0 0 0 ")  # 2 contacts, no deals / messages / properties
    note = "Imported from Blueworks, 2026-11-27. Do not contact until campaign approved."
    assert ("'Alice', '+15145550101', '-', '1 rue A, QC, Canada', 'customer', 'Client payé', "
            f"'bw:c:aaaaaaaa-0000-0000-0000-000000000001', '2026-11-10', '{note}'") in res
    assert ("'Ibrahim', '-', '-', '59 Chemin Belvédère, QC, Canada', 'customer', 'Client payé', "
            "'bw:c:aaaaaaaa-0000-0000-0000-000000000006', '2026-07-23'") in res

    out = _script(csv_path, db_url, "--commit")  # idempotent
    assert "inserted  : 0" in out and "skipped    : 6" in out
    assert _py(CHECK, db_url).startswith("2 0 0 0 ")


def test_refuses_when_wipe_flags_set():
    d = tempfile.mkdtemp()
    db_url = f"sqlite:///{d}/t.db"
    csv_path = os.path.join(d, "c.csv")
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write(CSV)
    _py(SEED, db_url)
    r = subprocess.run([sys.executable, SCRIPT, "--csv", csv_path, "--db-url", db_url],
                       env={**os.environ, "STARTUP_DEDUP_CONTACTS": "1"}, capture_output=True, text=True)
    assert r.returncode != 0 and "ABORT" in r.stderr
