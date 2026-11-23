import os
import sys
import tempfile
from datetime import datetime, timedelta

import pytest

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402
import models  # noqa: E402
from database import SessionLocal  # noqa: E402
from auth import create_access_token, get_password_hash  # noqa: E402
from routes import customers, service_plans  # noqa: E402

_before = len(main.app.router.routes)
for r in (customers.router, service_plans.router, service_plans.public_router):
    main.app.include_router(r)
# Move our routes ahead of main's SPA catch-all (present when frontend/dist exists)
_routes = main.app.router.routes
_new = _routes[_before:]
del _routes[_before:]
_routes[0:0] = _new


@pytest.fixture(scope="module")
def client():
    return TestClient(main.app)


@pytest.fixture(scope="module")
def H():
    db = SessionLocal()
    u = models.User(username="adm_cust", full_name="Adm", hashed_password=get_password_hash("x"), role="admin")
    db.add(u)
    db.commit()
    tok = create_access_token({"sub": str(u.id)})
    db.close()
    return {"Authorization": f"Bearer {tok}"}


def mk_contact(first, **kw):
    db = SessionLocal()
    c = models.Contact(first_name=first, last_name="T", **kw)
    db.add(c)
    db.commit()
    cid = c.id
    db.close()
    return cid


def mk_deal(cid, days, status="todo", value=100):
    db = SessionLocal()
    d = models.Deal(title="J", contact_id=cid, value=value, job_status=status,
                    expected_close_date=datetime.utcnow() + timedelta(days=days))
    db.add(d)
    db.commit()
    db.close()


def test_lifecycle(client, H):
    new = mk_contact("New", address="1 Rue A, Laval, QC")
    up = mk_contact("Up", tags="vip,Laval")
    past = mk_contact("Past")
    plan = mk_contact("Plan")
    mk_deal(up, 5)
    mk_deal(past, -30, "done", 250)
    db = SessionLocal()
    db.add(models.ServicePlan(contact_id=plan, name="P", status="active", token="tk-lc"))
    db.commit()
    db.close()
    r = client.get("/api/customers/", headers=H).json()
    by = {c["id"]: c for c in r["customers"]}
    assert by[new]["lifecycle"] == "new" and by[new]["city"] == "Laval"
    assert by[up]["lifecycle"] == "upcoming" and by[up]["next_job"]
    assert by[past]["lifecycle"] == "past" and by[past]["total_spent"] == 250
    assert by[plan]["lifecycle"] == "active_plan"
    assert r["counts"]["new"] >= 1 and r["counts"]["past"] >= 1
    only = client.get("/api/customers/?lifecycle=upcoming", headers=H).json()
    assert [c["id"] for c in only["customers"]] == [up]
    assert [c["id"] for c in client.get("/api/customers/?tag=vip", headers=H).json()["customers"]] == [up]
    assert client.get("/api/customers/?search=Past&limit=1", headers=H).json()["total"] == 1


def test_overview_and_properties(client, H):
    cid = mk_contact("Ov", address="5 Rue B, Laval, QC", phone="514")
    mk_deal(cid, -10, "done", 300)
    db = SessionLocal()
    db.add(models.Invoice(number="F-T1", contact_id=cid, status="sent", total_cents=50000, paid_cents=20000, token="tk-inv"))
    db.commit()
    db.close()
    o = client.get(f"/api/customers/{cid}/overview", headers=H).json()
    assert len(o["properties"]) == 1 and o["properties"][0]["is_primary"]
    assert o["stats"]["job_count"] == 1
    assert o["stats"]["lifetime_value"] == 200 + 300
    assert o["stats"]["balance_due_cents"] == 30000
    assert len(o["invoices"]) == 1
    p = client.post(f"/api/customers/{cid}/properties", json={"address": "9 Chalet", "label": "Chalet"}, headers=H).json()
    assert not p["is_primary"]
    u = client.put(f"/api/customers/properties/{p['id']}", json={"city": "Mont", "is_primary": True}, headers=H).json()
    assert u["city"] == "Mont" and u["is_primary"]
    props = client.get(f"/api/customers/{cid}/properties", headers=H).json()
    assert sum(x["is_primary"] for x in props) == 1
    assert client.delete(f"/api/customers/properties/{p['id']}", headers=H).status_code == 200
    props = client.get(f"/api/customers/{cid}/properties", headers=H).json()
    assert len(props) == 1 and props[0]["is_primary"]


def test_plan_activate_cancel_and_public(client, H):
    cid = mk_contact("Pl")
    p = client.post("/api/service-plans/", json={"contact_id": cid, "name": "Vitres 3x", "visits_per_year": 3,
                                                  "price_cents": 30000, "billing_frequency": "yearly",
                                                  "start_date": f"{datetime.utcnow().year + 1}-01-10T00:00:00"}, headers=H).json()
    assert p["status"] == "draft" and p["arr_cents"] == 30000
    assert client.get(f"/api/public/plans/{p['token']}").status_code == 404  # draft hidden
    client.post(f"/api/service-plans/{p['id']}/send", headers=H)
    pub = client.get(f"/api/public/plans/{p['token']}").json()
    assert pub["name"] == "Vitres 3x" and "token" not in pub
    r = client.post(f"/api/public/plans/{p['token']}/sign", json={"signature_name": "Jean", "signature_data": "data:x"}).json()
    assert r["status"] == "active"
    db = SessionLocal()
    jobs = db.query(models.Deal).filter(models.Deal.notes.like(f"%[plan:{p['id']}]%")).all()
    assert len(jobs) == 3
    for j in jobs:
        assert j.value == 100 and j.job_status == "todo" and j.title == "Plan: Vitres 3x"
        assert j.expected_close_date.hour == 9 and 4 <= j.expected_close_date.month <= 11
    jobs[0].expected_close_date = datetime.utcnow() - timedelta(days=3)
    db.commit()
    db.close()
    a = client.post(f"/api/service-plans/{p['id']}/activate", headers=H).json()
    assert len(a["job_ids"]) == 3  # idempotent
    c = client.post(f"/api/service-plans/{p['id']}/cancel", headers=H).json()
    assert c["removed_jobs"] == 2 and c["plan"]["status"] == "cancelled"
    db = SessionLocal()
    assert db.query(models.Deal).filter(models.Deal.notes.like(f"%[plan:{p['id']}]%")).count() == 1
    db.close()
    lst = client.get("/api/service-plans/?status=cancelled", headers=H).json()
    assert any(x["id"] == p["id"] for x in lst["plans"])


def test_plan_delete_draft_only(client, H):
    cid = mk_contact("Dl")
    p = client.post("/api/service-plans/", json={"contact_id": cid, "name": "X"}, headers=H).json()
    act = client.post("/api/service-plans/", json={"contact_id": cid, "name": "Y"}, headers=H).json()
    client.post(f"/api/service-plans/{act['id']}/activate", headers=H)
    assert client.delete(f"/api/service-plans/{act['id']}", headers=H).status_code == 400
    assert client.delete(f"/api/service-plans/{p['id']}", headers=H).status_code == 200
