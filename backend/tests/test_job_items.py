import os
import sys
import tempfile

_tmp = tempfile.mkdtemp()
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

import main
import models
from auth import create_access_token, get_password_hash
from database import SessionLocal


@pytest.fixture(scope="module")
def client():
    return TestClient(main.app)


@pytest.fixture(scope="module")
def setup():
    db = SessionLocal()
    u = models.User(username="adm_jobitems", hashed_password=get_password_hash("x"), role="admin", is_active=True)
    c = models.Contact(first_name="Luc", last_name="Côté", phone="+15145550199")
    db.add_all([u, c])
    db.commit()
    out = {"headers": {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}, "contact_id": c.id}
    db.close()
    return out


def test_booking_with_custom_items_and_typed_duration(client, setup):
    h = setup["headers"]
    r = client.post("/api/deals/", headers=h, json={
        "title": "Luc Côté — Vitres", "value": 0, "contact_id": setup["contact_id"],
        "expected_close_date": "2026-12-01T09:00:00", "estimated_minutes": 75, "job_status": "todo",
    })
    assert r.status_code == 200, r.text
    deal = r.json()
    assert deal["estimated_minutes"] == 75

    items = [
        {"name": "Vitres ext. 2 étages", "description": "24 fenêtres", "qty": 1, "unit_price_cents": 27500, "taxable": True},
        {"name": "Moustiquaires", "qty": 12, "unit_price_cents": 300, "taxable": True},
        {"name": "Pourboire", "qty": 1, "unit_price_cents": 1000, "taxable": False},
    ]
    r = client.put(f"/api/deals/{deal['id']}/line-items", headers=h, json=items)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["items"]) == 3
    assert body["totals"]["subtotal_cents"] == 27500 + 3600 + 1000
    # taxes only on the 31 100 taxable cents
    assert body["totals"]["tps_cents"] == round(31100 * 0.05)

    # deal.value follows the pre-tax subtotal
    r = client.get(f"/api/deals/{deal['id']}", headers=h)
    assert r.json()["value"] == 321.0

    # Replace keeps it idempotent
    r = client.put(f"/api/deals/{deal['id']}/line-items", headers=h, json=items[:1])
    assert len(r.json()["items"]) == 1
    r = client.get(f"/api/deals/{deal['id']}/line-items", headers=h)
    assert [i["name"] for i in r.json()["items"]] == ["Vitres ext. 2 étages"]

    # Invoice from job copies the custom lines
    r = client.post(f"/api/billing/invoices/from-job/{deal['id']}", headers=h)
    assert r.status_code in (200, 201), r.text
    inv = r.json()
    inv_id = inv.get("id") or inv.get("invoice", {}).get("id")
    r = client.get(f"/api/billing/invoices/{inv_id}", headers=h)
    names = [i["name"] for i in r.json()["items"]]
    assert names == ["Vitres ext. 2 étages"]


def test_validation(client, setup):
    h = setup["headers"]
    r = client.put("/api/deals/999999/line-items", headers=h, json=[])
    assert r.status_code == 404
    r = client.post("/api/deals/", headers=h, json={"title": "x", "estimated_minutes": 2000})
    assert r.status_code == 422
