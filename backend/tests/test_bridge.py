import os
import sys
import tempfile

BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, BACKEND)
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "bridge_test.db")
os.environ.setdefault("SECRET_KEY", "test-secret")

import json  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
import models  # noqa: E402
from auth import create_access_token, get_password_hash  # noqa: E402
from database import SessionLocal, Base, engine  # noqa: E402
from routes import bridge as bridge_routes  # noqa: E402
from bridge import bluework as bw  # noqa: E402

if not any(getattr(r, "path", "").startswith("/api/bridge") for r in main.app.routes):
    main.app.include_router(bridge_routes.router)

# English headers
CUSTOMERS_EN = """ID,First Name,Last Name,Phone,Email,Address,City,Status
101,jean,TREMBLAY,(514) 555-0142,jean@example.com,12 rue des Pins,Laval,Active plan
102,Marie,Gagnon,450-555-0177,,5 av. du Parc,Laval,New
"""
# French headers
CUSTOMERS_FR = """Nom,Téléphone,Courriel,Adresse,Ville,Statut
Luc Roy,438 555 0199,luc@example.com,8 boul. Saint-Martin,Laval,Past
"""
JOBS = """Job ID,Customer ID,Title,Status,Scheduled,Total,Technician
J1,101,Lavage de vitres,Completed,2026-06-10 09:00,305.50,Karim
J2,102,Gouttières,Scheduled,12/07/2026,"$1,200.00",Karim
J3,999,Orphan,Scheduled,2026-07-01,10,
"""
QUOTES = """Quote #,Client ID,Status,Total,Date
2001,101,Signed,"1 149,75 $",2026-05-01
2002,102,Not sent,200,2026-05-02
2003,102,Declined,50,2026-05-03
"""
INVOICES = """Invoice #,Customer ID,Status,Total,Amount Paid,Date
3001,101,Paid,344.93,344.93,2026-06-11
3002,102,Sent,100,0,2026-06-12
3003,102,Partial refund,100,100,2026-06-13
"""
PLANS = """Plan ID,Customer ID,Plan,Status,Price,Frequency
P1,101,Entretien annuel,Past due,199,Yearly
"""


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    u = models.User(username="boss", hashed_password=get_password_hash("x"), role="admin", is_active=True)
    t = models.User(username="tech", hashed_password=get_password_hash("x"), role="user", is_active=True)
    db.add_all([u, t])
    db.commit()
    tok = create_access_token({"sub": str(u.id)})
    tok_user = create_access_token({"sub": str(t.id)})
    db.close()
    c = TestClient(main.app)
    c.headers.update({"Authorization": f"Bearer {tok}"})
    c.user_headers = {"Authorization": f"Bearer {tok_user}"}
    yield c


def post(c, entity, csv_text, dry_run=False, mapping=None):
    h, _ = bw.read_csv(csv_text.encode())
    m = mapping or bw.guess_mapping(entity, h)
    r = c.post("/api/bridge/import", data={"entity": entity, "mapping": json.dumps(m), "dry_run": str(dry_run).lower()},
               files={"file": ("x.csv", csv_text.encode(), "text/csv")})
    assert r.status_code == 200, r.text
    return r.json()


def load_all(c):
    for e, t in [("customers", CUSTOMERS_EN), ("customers", CUSTOMERS_FR), ("jobs", JOBS), ("quotes", QUOTES),
                 ("invoices", INVOICES), ("service_plans", PLANS)]:
        post(c, e, t)


def test_mapping_guess_en_fr():
    en, _ = bw.read_csv(CUSTOMERS_EN.encode())
    m = bw.guess_mapping("customers", en)
    assert m["external_id"] == "ID" and m["first_name"] == "First Name" and m["last_name"] == "Last Name"
    assert m["phone"] == "Phone" and m["email"] == "Email" and m["address"] == "Address" and m["city"] == "City"
    assert m["status"] == "Status" and "name" not in m
    fr, _ = bw.read_csv(CUSTOMERS_FR.encode())
    m = bw.guess_mapping("customers", fr)
    assert m["name"] == "Nom" and m["phone"] == "Téléphone" and m["email"] == "Courriel"
    assert m["address"] == "Adresse" and m["city"] == "Ville" and m["status"] == "Statut"
    jm = bw.guess_mapping("jobs", ["Job ID", "Customer ID", "Scheduled", "Total", "Technician", "Status"])
    assert jm["external_id"] == "Job ID" and jm["customer_id"] == "Customer ID" and jm["technician"] == "Technician"


def test_parsers():
    assert bw.parse_cents("$1,234.56") == 123456 and bw.parse_cents("1 234,56 $") == 123456
    assert bw.parse_cents("1.234,56") == 123456 and bw.parse_cents("305") == 30500
    assert bw.parse_date("12/07/2026") == "2026-07-12T00:00:00"
    assert bw.normalize_phone("(514) 555-0142") == "+15145550142"


def test_status_maps():
    assert bw.map_status("quotes", "Signed")[0] == "accepted"
    assert bw.map_status("quotes", "Not sent")[0] == "draft"
    assert bw.map_status("invoices", "Failed")[0] == "sent"
    assert bw.map_status("invoices", "Partial refund")[0] == "paid"
    assert bw.map_status("invoices", "Annulée")[0] == "cancelled"
    assert bw.map_status("service_plans", "Past due")[0] == "past_due"
    assert bw.map_status("service_plans", "Pending")[0] == "sent"
    assert bw.map_status("jobs", "Completed")[0] == "done" and bw.map_status("jobs", "Pending")[0] == "todo"
    assert bw.map_status("leads", "Lost")[0] == "inactive"
    assert bw.map_status("customers", "Bogus") == ("customer", False)


def test_preview_and_auth(client):
    r = client.post("/api/bridge/preview", data={"entity": "customers"},
                    files={"file": ("c.csv", CUSTOMERS_FR.encode(), "text/csv")})
    assert r.status_code == 200
    j = r.json()
    assert j["mapping"]["phone"] == "Téléphone" and j["rows"][0]["phone"] == "+14385550199"
    assert j["rows"][0]["first_name"] == "Luc" and j["rows"][0]["last_name"] == "Roy"
    r = client.post("/api/bridge/preview", data={"entity": "customers"}, headers=client.user_headers,
                    files={"file": ("c.csv", CUSTOMERS_FR.encode(), "text/csv")})
    assert r.status_code == 403
    assert client.get("/api/bridge/status").status_code == 200


def test_customers_idempotent_and_dry_run(client):
    dry = post(client, "customers", CUSTOMERS_EN, dry_run=True)
    assert dry["created"] == 2 and dry["dry_run"]
    assert client.get("/api/bridge/status").json()["contacts"] == 0   # rolled back
    r1 = post(client, "customers", CUSTOMERS_EN)
    assert (r1["created"], r1["updated"]) == (2, 0)
    r2 = post(client, "customers", CUSTOMERS_EN)
    assert (r2["created"], r2["updated"]) == (0, 2)
    db = SessionLocal()
    assert db.query(models.Contact).count() == 2
    jean = db.query(models.Contact).filter_by(external_ref="bw:c:101").one()
    assert jean.first_name == "Jean" and jean.last_name == "Tremblay" and jean.phone == "+15145550142"
    assert jean.status == "customer" and "bw:active-plan" in jean.tags and jean.source == "bluework"
    assert db.query(models.Property).filter_by(contact_id=jean.id).count() == 1
    # same phone, no id -> matched by phone, not duplicated
    post(client, "customers", "Nom,Téléphone\nJean Tremblay,514-555-0142\n")
    assert db.query(models.Contact).count() == 2
    db.close()


def test_full_chain_links_and_idempotent(client):
    load_all(client)
    db = SessionLocal()
    jean = db.query(models.Contact).filter_by(external_ref="bw:c:101").one()
    j1 = db.query(models.Deal).filter_by(external_ref="bw:J1").one()
    j2 = db.query(models.Deal).filter_by(external_ref="bw:J2").one()
    assert j1.contact_id == jean.id and j1.job_status == "done" and j1.value == 305.5 and j1.stage == "won"
    assert j2.job_status == "todo" and j2.expected_close_date.month == 7 and j2.expected_close_date.day == 12
    assert db.query(models.Deal).filter_by(external_ref="bw:J3").first() is None  # unknown customer -> error
    q = db.query(models.Quote).filter_by(external_ref="bw:#2001").one()
    assert q.status == "accepted" and q.total_cents == 114975 and q.number == "Q-2001" and q.token
    assert q.subtotal_cents + q.tps_cents + q.tvq_cents == q.total_cents
    assert db.query(models.LineItem).filter_by(parent_type="quote", parent_id=q.id).count() == 1
    assert db.query(models.Quote).filter_by(external_ref="bw:#2002").one().status == "draft"
    inv = db.query(models.Invoice).filter_by(external_ref="bw:#3001").one()
    assert inv.status == "paid" and inv.paid_cents == 34493 and len(inv.payments) == 1
    assert inv.payments[0].amount_cents == 34493
    assert db.query(models.Invoice).filter_by(external_ref="bw:#3002").one().payments == []
    assert db.query(models.Invoice).filter_by(external_ref="bw:#3003").one().status == "paid"
    plan = db.query(models.ServicePlan).filter_by(external_ref="bw:P1").one()
    assert plan.status == "past_due" and plan.price_cents == 19900 and plan.billing_frequency == "yearly"
    counts = {t: db.query(m).count() for t, m in [("c", models.Contact), ("d", models.Deal), ("q", models.Quote),
                                                  ("i", models.Invoice), ("p", models.Payment),
                                                  ("l", models.LineItem), ("s", models.ServicePlan)]}
    db.close()
    r = post(client, "jobs", JOBS)
    assert r["created"] == 0 and r["updated"] == 2 and r["errors"][0]["row"] == 4
    for e, t in [("quotes", QUOTES), ("invoices", INVOICES), ("service_plans", PLANS)]:
        rep = post(client, e, t)
        assert rep["created"] == 0 and rep["updated"] == len(t.strip().splitlines()) - 1
    db = SessionLocal()
    assert counts == {t: db.query(m).count() for t, m in [("c", models.Contact), ("d", models.Deal),
                      ("q", models.Quote), ("i", models.Invoice), ("p", models.Payment),
                      ("l", models.LineItem), ("s", models.ServicePlan)]}
    db.close()
    st = client.get("/api/bridge/status").json()
    assert st["contacts"] == 2 and st["quotes"] == 3 and st["payments"] == 2
