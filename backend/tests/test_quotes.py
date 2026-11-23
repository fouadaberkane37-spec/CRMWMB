import os
import sys
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ.setdefault("SECRET_KEY", "test-secret")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

import main
import models
from auth import create_access_token, get_password_hash
from database import SessionLocal, Base, engine
from routes import quotes as quotes_routes, pricebook as pricebook_routes

main.app.include_router(quotes_routes.router)
main.app.include_router(quotes_routes.public_router)
main.app.include_router(pricebook_routes.router)


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=engine)
    return TestClient(main.app)


@pytest.fixture(scope="module")
def auth():
    db = SessionLocal()
    u = db.query(models.User).filter(models.User.username == "qtest_admin").first()
    if not u:
        u = models.User(username="qtest_admin", email="qt@example.com", full_name="QT",
                        hashed_password=get_password_hash("x"), role="admin", is_active=True)
        db.add(u)
        db.commit()
        db.refresh(u)
    uid = u.id
    c = models.Contact(first_name="Marie", last_name="Tremblay", phone="+15145550000", created_by=uid)
    db.add(c)
    db.commit()
    db.refresh(c)
    cid = c.id
    db.close()
    token = create_access_token({"sub": str(uid)})
    return {"headers": {"Authorization": f"Bearer {token}"}, "contact_id": cid}


def test_full_quote_flow(client, auth):
    h = auth["headers"]
    body = {
        "contact_id": auth["contact_id"], "title": "Vitres ext.", "message": "Merci!",
        "items": [
            {"name": "Vitres extérieur", "qty": 2, "unit_price_cents": 10000, "taxable": True},
            {"name": "Frais non taxable", "qty": 1, "unit_price_cents": 5000, "taxable": False},
        ],
        "discount_type": "percent", "discount_value": 10, "require_signature": True,
    }
    r = client.post("/api/quotes", json=body, headers=h)
    assert r.status_code == 201, r.text
    q = r.json()
    assert q["number"].startswith("Q-")
    # subtotal 25000, discount 2500, taxable 20000 - 2000*20000/25000... = 18400
    assert q["subtotal_cents"] == 25000
    assert q["discount_cents"] == 2500
    assert q["tps_cents"] == round(18000 * 0.05)
    assert q["tvq_cents"] == round(18000 * 0.09975)
    assert q["total_cents"] == 25000 - 2500 + q["tps_cents"] + q["tvq_cents"]
    assert len(q["items"]) == 2
    qid, token = q["id"], q["token"]

    # numbering increments
    r2 = client.post("/api/quotes", json={"contact_id": auth["contact_id"], "items": []}, headers=h)
    assert r2.json()["number"] != q["number"]

    # draft is hidden from public
    assert client.get(f"/api/public/quotes/{token}").status_code == 404

    # update recomputes
    r = client.put(f"/api/quotes/{qid}", json={"discount_type": None, "discount_value": 0}, headers=h)
    assert r.json()["discount_cents"] == 0
    assert r.json()["subtotal_cents"] == 25000

    # send by link
    r = client.post(f"/api/quotes/{qid}/send", json={"channel": "link"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "sent" and r.json()["link"].endswith(f"/q/{token}")

    # list filter + search
    r = client.get("/api/quotes", params={"status": "sent", "search": "Tremblay"}, headers=h)
    assert any(x["id"] == qid and x["contact_name"] == "Marie Tremblay" for x in r.json())

    # public view marks viewed
    r = client.get(f"/api/public/quotes/{token}")
    assert r.status_code == 200
    pub = r.json()
    assert pub["status"] == "viewed" and len(pub["items"]) == 2 and pub["company"]["name"]
    assert client.get(f"/api/quotes/{qid}", headers=h).json()["viewed_at"]

    # accept requires signature
    assert client.post(f"/api/public/quotes/{token}/accept", json={}).status_code == 400
    sig = "data:image/png;base64,iVBORw0KGgo="
    r = client.post(f"/api/public/quotes/{token}/accept",
                    json={"signature_name": "Marie Tremblay", "signature_data": sig})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "accepted"

    full = client.get(f"/api/quotes/{qid}", headers=h).json()
    assert full["status"] == "accepted" and full["deal_id"]

    # job created with copied items
    db = SessionLocal()
    deal = db.query(models.Deal).filter(models.Deal.id == full["deal_id"]).first()
    assert deal.stage == "won" and deal.job_status == "todo"
    assert deal.value == full["total_cents"] / 100
    n = db.query(models.LineItem).filter(models.LineItem.parent_type == "job",
                                         models.LineItem.parent_id == deal.id).count()
    db.close()
    assert n == 2

    # no longer editable / deletable; convert again conflicts
    assert client.put(f"/api/quotes/{qid}", json={"title": "x"}, headers=h).status_code == 400
    assert client.delete(f"/api/quotes/{qid}", headers=h).status_code == 400
    assert client.post(f"/api/quotes/{qid}/convert", json={}, headers=h).status_code == 409


def test_decline_mark_convert_delete(client, auth):
    h = auth["headers"]
    base = {"contact_id": auth["contact_id"],
            "items": [{"name": "A", "qty": 1, "unit_price_cents": 1000}], "require_signature": False}
    a = client.post("/api/quotes", json=base, headers=h).json()
    client.post(f"/api/quotes/{a['id']}/send", json={"channel": "link"}, headers=h)
    r = client.post(f"/api/public/quotes/{a['token']}/decline")
    assert r.json()["status"] == "declined"

    b = client.post("/api/quotes", json=base, headers=h).json()
    r = client.post(f"/api/quotes/{b['id']}/mark", json={"status": "accepted"}, headers=h)
    assert r.json()["status"] == "accepted"
    r = client.post(f"/api/quotes/{b['id']}/convert", json={"expected_close_date": "2026-12-01T00:00:00"}, headers=h)
    assert r.status_code == 200 and r.json()["deal_id"]

    c = client.post("/api/quotes", json=base, headers=h).json()
    assert client.delete(f"/api/quotes/{c['id']}", headers=h).status_code == 200
    assert client.get(f"/api/quotes/{c['id']}", headers=h).status_code == 404

    # no signature required -> accept with no signature works
    d = client.post("/api/quotes", json=base, headers=h).json()
    client.post(f"/api/quotes/{d['id']}/send", json={"channel": "link"}, headers=h)
    assert client.post(f"/api/public/quotes/{d['token']}/accept", json={}).status_code == 200


def test_auth_required(client):
    assert client.get("/api/quotes").status_code == 401
    assert client.get("/api/public/quotes/nope").status_code == 404


def test_price_book(client, auth):
    h = auth["headers"]
    r = client.get("/api/services", headers=h)
    assert r.status_code == 200 and len(r.json()) == 7  # seeded on first use
    r = client.post("/api/services", json={"name": "Test", "unit_price_cents": 1234}, headers=h)
    sid = r.json()["id"]
    r = client.put(f"/api/services/{sid}", json={"unit_price_cents": 2000}, headers=h)
    assert r.json()["unit_price_cents"] == 2000
    ids = [s["id"] for s in client.get("/api/services", headers=h).json()][::-1]
    assert client.post("/api/services/reorder", json={"ids": ids}, headers=h).status_code == 200
    assert client.delete(f"/api/services/{sid}", headers=h).status_code == 200
    active = client.get("/api/services", params={"active": True}, headers=h).json()
    assert all(s["id"] != sid for s in active)
