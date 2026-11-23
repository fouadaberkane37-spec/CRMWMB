"""App startup must never delete jobs/contacts or reset passwords unless explicitly asked."""
import os
import subprocess
import sys
import tempfile
import textwrap

BACKEND = os.path.join(os.path.dirname(__file__), "..")


def _run(code: str, db_url: str, extra_env=None):
    env = {**os.environ, "DATABASE_URL": db_url, **(extra_env or {})}
    for k in ("STARTUP_DEAL_CLEANUP", "STARTUP_DEDUP_CONTACTS", "STARTUP_GEO_RESET", "ONE_TIME_ADMIN_RESET"):
        if not extra_env or k not in extra_env:
            env.pop(k, None)
    r = subprocess.run([sys.executable, "-c", textwrap.dedent(code)], cwd=BACKEND, env=env,
                       capture_output=True, text=True, timeout=180)
    assert r.returncode == 0, r.stderr[-2000:]
    return r.stdout.strip().splitlines()[-1]


def test_startup_keeps_data_and_passwords():
    db_url = f"sqlite:///{tempfile.mkdtemp()}/startup.db"
    _run("""
        from datetime import datetime
        from database import engine, Base, SessionLocal
        import models
        from auth import get_password_hash
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        db.add(models.User(username="admin", hashed_password=get_password_hash("my-own-secret"), role="admin", is_active=True))
        a = models.Contact(first_name="Jean", last_name="Tremblay", phone="+15145550001", lat=48.42, lng=-71.06)
        b = models.Contact(first_name="Jean", last_name="Tremblay", phone="+15145550002")
        db.add_all([a, b]); db.commit()
        db.add_all([
            models.Deal(title="evening", contact_id=a.id, expected_close_date=datetime(2026, 12, 1, 18, 30)),
            models.Deal(title="morning", contact_id=a.id, expected_close_date=datetime(2026, 12, 1, 9, 0)),
            models.Deal(title="early", contact_id=b.id, expected_close_date=datetime(2026, 12, 2, 6, 30)),
        ])
        db.commit()
        print("seeded")
    """, db_url)

    out = _run("""
        import main  # runs every startup step
        from database import SessionLocal
        import models
        from auth import verify_password
        db = SessionLocal()
        admin = db.query(models.User).filter_by(username="admin").one()
        saguenay = db.query(models.Contact).filter_by(phone="+15145550001").one()
        print(db.query(models.Contact).count(), db.query(models.Deal).count(),
              verify_password("my-own-secret", admin.hashed_password), saguenay.lat is not None)
    """, db_url)
    assert out == "2 3 True True"
