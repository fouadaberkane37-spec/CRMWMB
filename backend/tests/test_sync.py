import os
import sys
import tempfile

_tmp = tempfile.mkdtemp()
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ["FILES_DIR"] = os.path.join(_tmp, "uploads")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

import main
import models
from auth import create_access_token, get_password_hash
from database import SessionLocal
from routes import attachments as attachments_routes

attachments_routes.FILES_DIR = os.environ["FILES_DIR"]

# 1x1 JPEG
JPEG = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720"
    "222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405"
    "060708090a0bffda0008010100003f00d2cf20ffd9")


@pytest.fixture(scope="module")
def client():
    return TestClient(main.app)


@pytest.fixture(scope="module")
def h():
    db = SessionLocal()
    u = models.User(username="tech_sync", hashed_password=get_password_hash("x"), role="admin", is_active=True)
    db.add(u)
    db.commit()
    tok = create_access_token({"sub": str(u.id)})
    db.close()
    return {"Authorization": f"Bearer {tok}"}


def count(model):
    db = SessionLocal()
    n = db.query(model).count()
    db.close()
    return n


def test_offline_booking_replayed_twice_creates_once(client, h):
    body = {
        "client_ref": "11111111-aaaa-bbbb-cccc-000000000001",
        "new_contact": {"first_name": "Sophie", "last_name": "Roy", "phone": "+15145550777", "address": None},
        "deal": {"title": "Sophie Roy — Vitres", "value": 0, "expected_close_date": "2026-12-03T10:00:00",
                 "estimated_minutes": 90, "job_status": "todo"},
        "items": [{"name": "Vitres ext.", "qty": 1, "unit_price_cents": 20000, "taxable": True}],
    }
    c0, d0 = count(models.Contact), count(models.Deal)
    r1 = client.post("/api/sync/booking", headers=h, json=body)
    assert r1.status_code == 200, r1.text
    r2 = client.post("/api/sync/booking", headers=h, json=body)   # phone retried after a dropped connection
    assert r2.status_code == 200
    assert r2.json()["duplicate"] is True
    assert r1.json()["deal_id"] == r2.json()["deal_id"]
    assert count(models.Contact) == c0 + 1 and count(models.Deal) == d0 + 1
    items = client.get(f"/api/deals/{r1.json()['deal_id']}/line-items", headers=h).json()["items"]
    assert [i["name"] for i in items] == ["Vitres ext."]

    # Photo taken offline, uploaded later, referencing the booking by its client ref
    files = {"file": ("demande.jpg", JPEG, "image/jpeg")}
    form = {"owner_type": "job", "owner_client_ref": f"{body['client_ref']}:deal",
            "client_ref": "photo-0001-aaaa", "caption": "Tache sur la vitre du salon"}
    p1 = client.post("/api/attachments", headers=h, data=form, files=files)
    assert p1.status_code == 200, p1.text
    p2 = client.post("/api/attachments", headers=h, data=form, files={"file": ("demande.jpg", JPEG, "image/jpeg")})
    assert p2.json()["duplicate"] is True and p2.json()["id"] == p1.json()["id"]
    lst = client.get("/api/attachments", headers=h, params={"owner_type": "job", "owner_id": r1.json()["deal_id"]}).json()
    assert len(lst) == 1 and lst[0]["caption"] == "Tache sur la vitre du salon"
    f = client.get(lst[0]["url"], headers=h)
    assert f.status_code == 200 and f.content == JPEG


def test_offline_knock_and_status(client, h):
    k = {"client_ref": "knock-0001-aaaa", "lat": 45.57, "lng": -73.75, "status": "not_home", "address": "Rue Test"}
    n0 = count(models.Knock)
    a = client.post("/api/sync/knock", headers=h, json=k).json()
    b = client.post("/api/sync/knock", headers=h, json=k).json()
    assert a["knock_id"] == b["knock_id"] and b["duplicate"] is True
    assert count(models.Knock) == n0 + 1
    r = client.post("/api/sync/knock-status", headers=h,
                    json={"client_ref": "kst-0001-aaaa", "knock_client_ref": "knock-0001-aaaa", "status": "follow_up"})
    assert r.status_code == 200, r.text
    db = SessionLocal()
    assert db.get(models.Knock, a["knock_id"]).status == "follow_up"
    db.close()


def test_photo_rejections(client, h):
    r = client.post("/api/attachments", headers=h, data={"owner_type": "job", "owner_client_ref": "nope:deal"},
                    files={"file": ("x.jpg", JPEG, "image/jpeg")})
    assert r.status_code == 409          # booking not synced yet → phone keeps it queued
    r = client.post("/api/attachments", headers=h, data={"owner_type": "job", "owner_id": 1},
                    files={"file": ("x.exe", b"MZ", "application/octet-stream")})
    assert r.status_code in (404, 415)
