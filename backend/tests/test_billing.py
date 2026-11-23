import os
import sys
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

import main
import models
from auth import create_access_token, get_password_hash
from database import SessionLocal
from routes import billing

if not any(getattr(r, "path", "").startswith("/api/billing") for r in main.app.routes):
    main.app.include_router(billing.router)
    main.app.include_router(billing.public_router)


@pytest.fixture(scope="module")
def client():
    return TestClient(main.app)


@pytest.fixture(scope="module")
def setup():
    db = SessionLocal()
    u = models.User(username="adm_billing", hashed_password=get_password_hash("x"), role="admin", is_active=True)
    c = models.Contact(first_name="Marie", last_name="Tremblay", phone="+15145550101")
    db.add_all([u, c])
    db.commit()
    out = {"headers": {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}, "contact_id": c.id}
    db.close()
    return out


def test_full_flow(client, setup):
    h, cid = setup["headers"], setup["contact_id"]
    r = client.post("/api/billing/invoices", headers=h, json={
        "contact_id": cid, "items": [{"name": "Vitres ext.", "qty": 1, "unit_price_cents": 30000}]})
    assert r.status_code == 200, r.text
    inv = r.json()
    assert inv["number"].startswith("F-") and inv["status"] == "draft"
    assert inv["subtotal_cents"] == 30000
    assert inv["total_cents"] in (34492, 34493)
    assert len(inv["items"]) == 1

    r = client.post(f"/api/billing/invoices/{inv['id']}/send", headers=h, json={"channel": "link"})
    assert r.status_code == 200 and r.json()["status"] == "sent"
    assert r.json()["url"].endswith(f"/i/{inv['token']}")

    r = client.get(f"/api/public/invoices/{inv['token']}")
    assert r.status_code == 200 and r.json()["balance_cents"] == inv["total_cents"]
    assert client.get(f"/api/billing/invoices/{inv['id']}", headers=h).json()["status"] == "viewed"

    r = client.post(f"/api/billing/invoices/{inv['id']}/payments", headers=h,
                    json={"method": "cash", "amount_cents": 10000})
    d = r.json()
    assert d["status"] == "partial" and d["balance_cents"] == inv["total_cents"] - 10000

    r = client.post(f"/api/billing/invoices/{inv['id']}/payments", headers=h,
                    json={"method": "interac", "amount_cents": d["balance_cents"], "reference": "abc"})
    d = r.json()
    assert d["status"] == "paid" and d["balance_cents"] == 0 and d["paid_at"]
    assert client.get(f"/api/public/invoices/{inv['token']}").json()["status"] == "paid"

    # delete a payment -> back to partial
    pid = d["payments"][-1]["id"]
    d = client.delete(f"/api/billing/payments/{pid}", headers=h).json()
    assert d["status"] == "partial"

    s = client.get("/api/billing/summary", headers=h).json()
    assert s["paid_this_month_cents"] == 10000 and s["outstanding_cents"] > 0


def test_list_overdue_edit_delete(client, setup):
    h, cid = setup["headers"], setup["contact_id"]
    inv = client.post("/api/billing/invoices", headers=h, json={
        "contact_id": cid, "due_date": "2020-01-01T00:00:00",
        "items": [{"name": "X", "qty": 2, "unit_price_cents": 1000}]}).json()
    assert client.delete(f"/api/billing/invoices/{inv['id']}", headers=h).status_code == 200
    inv = client.post("/api/billing/invoices", headers=h, json={
        "contact_id": cid, "due_date": "2020-01-01T00:00:00",
        "items": [{"name": "X", "qty": 2, "unit_price_cents": 1000}]}).json()
    client.post(f"/api/billing/invoices/{inv['id']}/send", headers=h, json={"channel": "link"})
    r = client.get("/api/billing/invoices?status=overdue", headers=h)
    assert [i["id"] for i in r.json()] == [inv["id"]]
    r = client.put(f"/api/billing/invoices/{inv['id']}", headers=h, json={
        "items": [{"name": "X", "qty": 1, "unit_price_cents": 5000}], "discount_type": "percent", "discount_value": 10})
    assert r.status_code == 200 and r.json()["discount_cents"] == 500
    assert client.delete(f"/api/billing/invoices/{inv['id']}", headers=h).status_code == 400
    assert client.post(f"/api/billing/invoices/{inv['id']}/cancel", headers=h).json()["status"] == "cancelled"
    assert client.get("/api/billing/invoices?search=Tremblay", headers=h).json()


def test_from_job(client, setup):
    h, cid = setup["headers"], setup["contact_id"]
    db = SessionLocal()
    d1 = models.Deal(title="Nettoyage vitres", value=200.0, contact_id=cid)
    d2 = models.Deal(title="Gouttières", value=0, contact_id=cid)
    db.add_all([d1, d2])
    db.commit()
    db.add(models.LineItem(parent_type="job", parent_id=d2.id, name="Gouttières", qty=2, unit_price_cents=7500))
    db.commit()
    id1, id2 = d1.id, d2.id
    db.close()
    r = client.post(f"/api/billing/invoices/from-job/{id1}", headers=h).json()
    assert r["deal_id"] == id1 and r["subtotal_cents"] == 20000 and r["items"][0]["name"] == "Nettoyage vitres"
    r = client.post(f"/api/billing/invoices/from-job/{id2}", headers=h).json()
    assert r["subtotal_cents"] == 15000
    assert client.post("/api/billing/invoices/from-job/99999", headers=h).status_code == 404


def test_public_404_and_draft_hidden(client, setup):
    assert client.get("/api/public/invoices/nope").status_code == 404
    inv = client.post("/api/billing/invoices", headers=setup["headers"],
                      json={"contact_id": setup["contact_id"], "items": []}).json()
    assert client.get(f"/api/public/invoices/{inv['token']}").status_code == 404
