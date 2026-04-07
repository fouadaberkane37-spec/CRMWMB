from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text
from database import engine, Base, SessionLocal, DATABASE_URL
import models
from routes import auth, users, contacts, companies, deals, activities, dashboard, knocks, search, sms, chats, invites, twilio as twilio_routes
from auth import get_password_hash
from datetime import datetime
import os

app = FastAPI(title="Self-Hosted CRM", version="1.0.0", docs_url="/api/docs", redirect_slashes=False)

# Allow all origins in production (Railway sets PORT; frontend is served by same procehss)
# Override with ALLOWED_ORIGINS env var if you want to restrict
allowed_origins = os.getenv(
    "ALLOWED_ORIGINS", "*"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create all tables
Base.metadata.create_all(bind=engine)

# Explicitly ensure chat_messages exists (handles existing production DBs
# where create_all may have run before this table was added)
_is_sqlite = DATABASE_URL.startswith("sqlite")

# Ensure chat_messages table exists (handles DBs created before this model was added)
_chat_ddl = """
    CREATE TABLE IF NOT EXISTS chat_messages (
        id         {pk},
        contact_id INTEGER NOT NULL REFERENCES contacts(id),
        sender_id  INTEGER REFERENCES users(id),
        body       TEXT    NOT NULL,
        direction  VARCHAR(16) NOT NULL DEFAULT 'outbound',
        created_at {ts}
    )
""".format(
    pk="INTEGER PRIMARY KEY AUTOINCREMENT" if _is_sqlite else "SERIAL PRIMARY KEY",
    ts="DATETIME DEFAULT CURRENT_TIMESTAMP" if _is_sqlite else "TIMESTAMP DEFAULT NOW()",
)
try:
    with engine.begin() as _conn:
        _conn.execute(text(_chat_ddl))
    print("[OK] chat_messages table ready")
except Exception as _e:
    print(f"[WARN] chat_messages DDL: {_e}")

# Add 'direction' column to existing chat_messages tables that predate this column
if _is_sqlite:
    _add_direction = "ALTER TABLE chat_messages ADD COLUMN direction VARCHAR(16) NOT NULL DEFAULT 'outbound'"
else:
    _add_direction = "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS direction VARCHAR(16) NOT NULL DEFAULT 'outbound'"
try:
    with engine.begin() as _conn:
        _conn.execute(text(_add_direction))
    print("[OK] chat_messages.direction column ensured")
except Exception as _e:
    # Column already exists or SQLite duplicate-column error â safe to ignore
    pass


# Ensure invites table exists
_invites_ddl = """
    CREATE TABLE IF NOT EXISTS invites (
        id         {pk},
        email      VARCHAR NOT NULL,
        token      VARCHAR NOT NULL UNIQUE,
        role       VARCHAR NOT NULL DEFAULT 'user',
        created_by INTEGER REFERENCES users(id),
        created_at {ts},
        expires_at {ts2} NOT NULL,
        used_at    {ts2}
    )
""".format(
    pk="INTEGER PRIMARY KEY AUTOINCREMENT" if _is_sqlite else "SERIAL PRIMARY KEY",
    ts="DATETIME DEFAULT CURRENT_TIMESTAMP" if _is_sqlite else "TIMESTAMP DEFAULT NOW()",
    ts2="DATETIME" if _is_sqlite else "TIMESTAMP",
)
try:
    with engine.begin() as _conn:
        _conn.execute(text(_invites_ddl))
    print("[OK] invites table ready")
except Exception as _e:
    print(f"[WARN] invites DDL: {_e}")


# Add new contact columns (address, services, price) for existing production DBs
_deal_migrations = [
    ("job_status", "ALTER TABLE deals ADD COLUMN{if_not_exists} job_status VARCHAR DEFAULT 'todo'"),
]
for _col, _stmt in _deal_migrations:
    _sql = _stmt.replace("{if_not_exists}", "" if _is_sqlite else " IF NOT EXISTS")
    try:
        with engine.begin() as _conn:
            _conn.execute(text(_sql))
        print(f"[OK] deals.{_col} column ensured")
    except Exception:
        pass

_contact_migrations = [
    ("address",  "ALTER TABLE contacts ADD COLUMN{if_not_exists} address TEXT"),
    ("services", "ALTER TABLE contacts ADD COLUMN{if_not_exists} services TEXT"),
    ("price",    "ALTER TABLE contacts ADD COLUMN{if_not_exists} price FLOAT"),
    ("lat",      "ALTER TABLE contacts ADD COLUMN{if_not_exists} lat FLOAT"),
    ("lng",      "ALTER TABLE contacts ADD COLUMN{if_not_exists} lng FLOAT"),
]
for _col, _stmt in _contact_migrations:
    if _is_sqlite:
        _sql = _stmt.replace("{if_not_exists}", "")
    else:
        _sql = _stmt.replace("{if_not_exists}", " IF NOT EXISTS")
    try:
        with engine.begin() as _conn:
            _conn.execute(text(_sql))
        print(f"[OK] contacts.{_col} column ensured")
    except Exception as _e:
        pass  # Column already exists — safe to ignore


def promote_admins():
    """Promote usernames listed in PROMOTE_TO_ADMIN env var to admin role."""
    raw = os.getenv("PROMOTE_TO_ADMIN", "").strip()
    if not raw:
        return
    usernames = [u.strip() for u in raw.split(",") if u.strip()]
    db = SessionLocal()
    try:
        for username in usernames:
            user = db.query(models.User).filter(models.User.username == username).first()
            if user and user.role != "admin":
                user.role = "admin"
                db.commit()
                print(f"[OK] Promoted '{username}' to admin")
            elif user:
                print(f"[--] '{username}' is already admin")
            else:
                print(f"[WARN] PROMOTE_TO_ADMIN: user '{username}' not found")
    finally:
        db.close()


def seed_calendar_data():
    """Create contacts + deals from Groupe WMB calendar appointments.
    Runs once when SEED_CALENDAR=1 env var is set. Uses CALENDAR_OWNER username to assign ownership."""
    owner_username = os.getenv("CALENDAR_OWNER", "").strip()
    if not owner_username:
        print("[WARN] seed_calendar_data: set CALENDAR_OWNER=<fouad_username>")
        return

    db = SessionLocal()
    try:
        owner = db.query(models.User).filter(models.User.username == owner_username).first()
        if not owner:
            print(f"[WARN] seed_calendar_data: user '{owner_username}' not found")
            return

        EVENTS = [
            {"first": "Prateek",      "last": "Sur",         "phone": "+15147462700", "address": "333 rue des Anémones",                      "services": "window-ext",                     "price": 400.0, "date": datetime(2026, 4,  4, 10, 0), "windows": 50, "floors": 2},
            {"first": "Chris",        "last": "Stamires",    "phone": "+15146794910", "address": "277 Montreuil",                             "services": "window-ext, window-int",         "price": 350.0, "date": datetime(2026, 4, 11, 10, 0), "windows": 30, "floors": 2},
            {"first": "Amina",        "last": "Chellai",     "phone": "+15149174156", "address": "487 Anémone",                               "services": "window-ext, gutters",            "price": 450.0, "date": datetime(2026, 4, 11, 14, 0), "windows": 45, "floors": 2},
            {"first": "Mark",         "last": None,          "phone": "+15149997986", "address": "324 rue des Anemone",                       "services": "window-ext",                     "price": 500.0, "date": datetime(2026, 4, 12,  9, 0), "windows": 60, "floors": 2},
            {"first": "Valérie",      "last": None,          "phone": "+15142441676", "address": "552 rue Randell",                           "services": "window-ext",                     "price": 400.0, "date": datetime(2026, 4, 13, 13, 0), "windows": 60, "floors": 2},
            {"first": "David",        "last": None,          "phone": "+18198205096", "address": "8180 Rue des Bungalows, Laval, QC H7H 1X4", "services": "window-ext",                     "price": 350.0, "date": datetime(2026, 4, 19,  9, 0), "windows": 30, "floors": 2},
            {"first": "Francois",     "last": "Giroux",      "phone": "+15149104322", "address": "590 rue Bayard",                            "services": "window-ext",                     "price": 400.0, "date": datetime(2026, 4, 20,  9, 0), "windows": 30, "floors": 2},
            {"first": "Raynald",      "last": "Langlois",    "phone": "+15793683607", "address": "16230 rue de l'Esplanade",                  "services": "window-ext, gutters",            "price": 500.0, "date": datetime(2026, 4, 21, 10, 0), "windows": 30, "floors": 2},
            {"first": "Jean",         "last": None,          "phone": "+15149289227", "address": "705 rue la Buyère, Laval",                  "services": "window-ext",                     "price": 350.0, "date": datetime(2026, 4, 22,  9, 0), "windows": 35, "floors": 2},
            {"first": "Jean",         "last": "Lortie",      "phone": "+15142321088", "address": "2311 rue de Prague",                        "services": "window-ext, window-int",         "price": 315.0, "date": datetime(2026, 4, 23,  9, 0), "windows": 30, "floors": 2},
            {"first": "Chrystian",    "last": None,          "phone": "+15147545542", "address": "525 rue Bayard",                            "services": "window-ext",                     "price": 350.0, "date": datetime(2026, 4, 24,  9, 0), "windows": 2,  "floors": 2},
            {"first": "Louis",        "last": "Philipe Giguerre", "phone": "+15149281455", "address": "11630 rue du Platine",               "services": "window-ext, gutters",            "price": 300.0, "date": datetime(2026, 4, 25,  9, 0), "windows": 30, "floors": 2},
            {"first": "Alain",        "last": "Poirier",     "phone": "+15149680123", "address": "11940 rue Rubis",                           "services": "window-ext",                     "price": 350.0, "date": datetime(2026, 4, 25, 12, 0), "windows": 40, "floors": 2},
            {"first": "Tammy",        "last": None,          "phone": "+15149266953", "address": "16805 rue des Saphires",                    "services": "window-ext",                     "price": 311.0, "date": datetime(2026, 4, 25, 15, 0), "windows": 30, "floors": 2},
            {"first": "Sebastien",    "last": "Isabelle",    "phone": "+14505126439", "address": "479 rue des Villa",                         "services": "window-ext, gutters",            "price": 500.0, "date": datetime(2026, 4, 26,  7, 0), "windows": 30, "floors": 2},
            {"first": "Viencent",     "last": "Bernier",     "phone": "+14189978729", "address": "17190 rue des Orquide",                     "services": "window-ext",                     "price": 340.0, "date": datetime(2026, 4, 26, 14, 0), "windows": 30, "floors": 2},
            {"first": "Marie-Claude", "last": "Lemonde",     "phone": "+15149450536", "address": "2400 du Passerin",                          "services": "window-ext",                     "price": 300.0, "date": datetime(2026, 5,  4,  9, 0), "windows": 30, "floors": 2},
            {"first": "Arman",        "last": None,          "phone": "+15142368223", "address": "5850 Boul des Rossignoles",                  "services": "window-ext",                     "price": 375.0, "date": datetime(2026, 5,  6,  9, 0), "windows": 30, "floors": 2},
            {"first": "Perry",        "last": None,          "phone": "+15148231191", "address": "265 Montreuil",                             "services": "window-ext",                     "price": 300.0, "date": datetime(2026, 5, 15, 13, 0), "windows": 30, "floors": 2},
            {"first": "Jimmy",        "last": "Argybou",     "phone": "+15148933929", "address": "91 chem de la Galène Bleue",                "services": "window-ext",                     "price": 340.0, "date": datetime(2026, 5, 24, 10, 0), "windows": 30, "floors": 2},
            {"first": "Dominic",      "last": "David",       "phone": "+15142200127", "address": "120 place Gravie",                          "services": "window-ext",                     "price": 500.0, "date": datetime(2026, 5, 25, 10, 0), "windows": 50, "floors": 2},
            {"first": "Marc",         "last": "Gregoire",    "phone": "+15149092139", "address": "380 place Charmante",                       "services": "window-ext",                     "price": 510.0, "date": datetime(2026, 5, 25, 14, 0), "windows": 30, "floors": 2},
            {"first": "Claudette",    "last": "Généreux",    "phone": "+15144641495", "address": "1495 montée Masson, roulotte 48",           "services": "window-ext, window-int, gutters","price": 300.0, "date": datetime(2026, 5, 30,  9, 0), "windows": 10, "floors": 1},
            {"first": "José",         "last": "Drapeau",     "phone": "+15142462401", "address": "684 Cornouille",                            "services": "window-ext",                     "price": 300.0, "date": datetime(2026, 6,  3,  9, 0), "windows": 20, "floors": 2},
            {"first": "Frederic",     "last": "Bergeron",    "phone": "+15142675488", "address": "100 rue Saint-Pierre Est, Saint-Sauveur",   "services": "window-ext, window-int",         "price": 350.0, "date": datetime(2026, 8,  1,  7, 0), "windows": 30, "floors": 2},
        ]

        created_contacts = 0
        created_deals = 0

        for ev in EVENTS:
            # Avoid duplicates — match on phone OR name (handles re-runs after CSV import)
            contact = db.query(models.Contact).filter(
                models.Contact.created_by == owner.id,
                models.Contact.phone == ev["phone"],
            ).first()
            if not contact:
                contact = db.query(models.Contact).filter(
                    models.Contact.created_by == owner.id,
                    models.Contact.first_name == ev["first"],
                    models.Contact.last_name == (ev["last"] or None),
                ).first()

            if not contact:
                contact = models.Contact(
                    first_name=ev["first"],
                    last_name=ev["last"],
                    phone=ev["phone"],
                    address=ev["address"],
                    services=ev["services"],
                    price=ev["price"],
                    status="customer",
                    created_by=owner.id,
                )
                db.add(contact)
                db.flush()
                created_contacts += 1

            # Avoid duplicate deals — match on contact + date
            existing = db.query(models.Deal).filter(
                models.Deal.contact_id == contact.id,
                models.Deal.expected_close_date == ev["date"],
            ).first()

            if not existing:
                name = f"{ev['first']} {ev['last'] or ''}".strip()
                services_label = ev["services"].replace("window-ext", "Fenêtres ext").replace("window-int", "int").replace("gutters", "Gouttières")
                deal = models.Deal(
                    title=f"{name} — {services_label}",
                    value=ev["price"],
                    stage="proposal",
                    contact_id=contact.id,
                    expected_close_date=ev["date"],
                    notes=f"{ev['windows']} fenêtres · {ev['floors']} étage(s) · {ev['address']}",
                    created_by=owner.id,
                    assigned_to=owner.id,
                )
                db.add(deal)
                created_deals += 1

        db.commit()
        print(f"[OK] Calendar seed: {created_contacts} contacts + {created_deals} deals created for '{owner_username}'")
    except Exception as exc:
        db.rollback()
        print(f"[ERR] seed_calendar_data: {exc}")
    finally:
        db.close()


def seed_admin():
    """Create default admin on first run."""
    db = SessionLocal()
    try:
        if not db.query(models.User).first():
            admin = models.User(
                username="admin",
                email="admin@crm.local",
                full_name="Admin",
                hashed_password=get_password_hash("admin123"),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print("[OK] Default admin created -> username: admin | password: admin123")
            print("  Change the password after first login!")
    finally:
        db.close()


# Make sender_id nullable for inbound SMS (fix existing DBs with NOT NULL constraint)
if not _is_sqlite:
    try:
        with engine.begin() as _conn:
            _conn.execute(text("ALTER TABLE chat_messages ALTER COLUMN sender_id DROP NOT NULL"))
        print("[OK] chat_messages.sender_id is now nullable")
    except Exception as _e:
        pass  # Already nullable or column not found

seed_admin()
promote_admins()

# One-time data wipe (fresh start) — self-disabling via DB marker table.
# Creates _wipe_v1_done on first run; subsequent deploys skip it automatically.
try:
    with engine.begin() as _conn:
        _conn.execute(text("CREATE TABLE _wipe_v1_done (id int)"))
    # Table didn't exist → this is the first run → perform wipe
    _db = SessionLocal()
    try:
        _db.query(models.Deal).delete(synchronize_session=False)
        try:
            _db.query(models.Activity).delete(synchronize_session=False)
        except Exception:
            pass
        try:
            _db.query(models.ChatMessage).delete(synchronize_session=False)
        except Exception:
            pass
        try:
            _db.query(models.Knock).delete(synchronize_session=False)
        except Exception:
            pass
        _db.query(models.Contact).delete(synchronize_session=False)
        try:
            _db.query(models.Company).delete(synchronize_session=False)
        except Exception:
            pass
        _db.commit()
        print("[OK] One-time wipe complete — contacts, deals, calendar, knocks, chats, activities cleared")
    except Exception as _e:
        _db.rollback()
        print(f"[ERR] One-time wipe failed: {_e}")
    finally:
        _db.close()
except Exception:
    pass  # Marker table already exists → wipe already ran, skip

if os.getenv("WIPE_DATA") == "1":
    print("[INFO] WIPE_DATA env var is set but one-time wipe already ran via DB marker.")

if os.getenv("SEED_CALENDAR") == "1":
    seed_calendar_data()

# Reset bad geocoding — clear lat/lng outside Greater Montreal area.
# Covers lat 45.1–46.1, lon -74.6 to -73.0 (~1 h from Montreal).
try:
    with engine.begin() as _conn:
        _conn.execute(text(
            "UPDATE contacts SET lat = NULL, lng = NULL "
            "WHERE lat IS NOT NULL AND ("
            "  lat < 45.1 OR lat > 46.1 OR lng < -74.6 OR lng > -73.0"
            ")"
        ))
    print("[OK] Cleared out-of-area geocoding (outside Montreal ~1h radius)")
except Exception as _e:
    print(f"[WARN] geo-reset failed: {_e}")

# Auto-dedup contacts on EVERY startup — keeps oldest per unique full name.
# Prevents duplicates from re-appearing after redeployments or repeated CSV imports.
_db = SessionLocal()
try:
    from collections import defaultdict as _dd
    _all = _db.query(models.Contact).order_by(models.Contact.id.asc()).all()
    _groups = _dd(list)
    for _c in _all:
        _key = (
            f"{(_c.first_name or '').strip().lower()} "
            f"{(_c.last_name or '').strip().lower()}"
        ).strip()
        _groups[_key].append(_c)
    _deleted = 0
    for _key, _grp in _groups.items():
        for _dup in _grp[1:]:
            _db.delete(_dup)
            _deleted += 1
    if _deleted:
        _db.commit()
        print(f"[OK] Auto-dedup: removed {_deleted} duplicate contact(s)")
except Exception as _e:
    _db.rollback()
    print(f"[WARN] Auto-dedup failed: {_e}")
finally:
    _db.close()

# ── Deal cleanup (runs every startup) ─────────────────────────────────────────
_db = SessionLocal()
try:
    _all_deals = _db.query(models.Deal).filter(models.Deal.expected_close_date.isnot(None)).order_by(models.Deal.id.asc()).all()
    _valid_contact_ids = {c.id for c in _db.query(models.Contact.id).all()}
    _to_delete = set()

    # 1. Remove deals outside operating hours (before 07:00 or at/after 17:00)
    for _d in _all_deals:
        if not (7 <= _d.expected_close_date.hour < 17):
            _to_delete.add(_d.id)

    # 2. Remove orphaned deals (contact was deleted by dedup)
    for _d in _all_deals:
        if _d.contact_id and _d.contact_id not in _valid_contact_ids:
            _to_delete.add(_d.id)

    # 3. Dedup deals: per contact per calendar day, keep the oldest (lowest id)
    from collections import defaultdict as _dd2
    _deal_groups = _dd2(list)
    for _d in _all_deals:
        if _d.id in _to_delete:
            continue
        _day_key = (_d.contact_id, _d.expected_close_date.date())
        _deal_groups[_day_key].append(_d)
    for _grp in _deal_groups.values():
        for _dup in _grp[1:]:          # keep first (lowest id), delete rest
            _to_delete.add(_dup.id)

    if _to_delete:
        _db.query(models.Deal).filter(models.Deal.id.in_(_to_delete)).delete(synchronize_session=False)
        _db.commit()
        print(f"[OK] Deal cleanup: removed {len(_to_delete)} bad/duplicate deal(s)")
except Exception as _e:
    _db.rollback()
    print(f"[WARN] Deal cleanup failed: {_e}")
finally:
    _db.close()

# Rename the admin account if ADMIN_FULL_NAME env var is set
_admin_full_name = os.getenv("ADMIN_FULL_NAME", "").strip()
if _admin_full_name:
    _db = SessionLocal()
    try:
        _admin_user = _db.query(models.User).filter(models.User.role == "admin").first()
        if _admin_user and _admin_user.full_name != _admin_full_name:
            _admin_user.full_name = _admin_full_name
            _db.commit()
            print(f"[OK] Admin display name set to '{_admin_full_name}'")
    finally:
        _db.close()

# Reassign all contacts to a specific user if REASSIGN_CONTACTS_TO env var is set.
# Set it once, deploy, then remove it so it doesn't run again on every restart.
_reassign_to = os.getenv("REASSIGN_CONTACTS_TO", "").strip()
if _reassign_to:
    _db = SessionLocal()
    try:
        _target = _db.query(models.User).filter(models.User.username == _reassign_to).first()
        if _target:
            updated = _db.query(models.Contact).filter(models.Contact.created_by != _target.id).update(
                {"created_by": _target.id}, synchronize_session=False
            )
            _db.commit()
            print(f"[OK] Reassigned {updated} contacts to '{_reassign_to}' (id={_target.id})")
        else:
            print(f"[WARN] REASSIGN_CONTACTS_TO: user '{_reassign_to}' not found")
    finally:
        _db.close()

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(contacts.router)
app.include_router(companies.router)
app.include_router(deals.router)
app.include_router(activities.router)
app.include_router(dashboard.router)
app.include_router(knocks.router)
app.include_router(search.router)
app.include_router(sms.router)
app.include_router(chats.router)
app.include_router(invites.router)
app.include_router(twilio_routes.router)

# --- Serve built React frontend (production) ---
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        """Catch-all: serve index.html for React Router client-side routing."""
        index = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(index)
else:
    @app.get("/")
    def root():
        return {"status": "CRM API running", "docs": "/api/docs"}
