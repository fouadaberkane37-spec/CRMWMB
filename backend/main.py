from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import text
from database import engine, Base, SessionLocal, DATABASE_URL
import models
from routes import auth, users, contacts, companies, deals, activities, dashboard, knocks, search, sms, chats, invites, twilio as twilio_routes
from routes import timeclock as timeclock_routes
from routes import phases as phases_routes
from routes import analytics as analytics_routes
from routes import availability as availability_routes
from routes import reminders as reminders_routes
from routes import invoices as invoices_routes
from routes import hours as hours_routes
from auth import get_password_hash
from datetime import datetime
import os

_is_prod = os.getenv("ENV", "").lower() == "production"
_docs_url = None if _is_prod else "/api/docs"
app = FastAPI(title="Self-Hosted CRM", version="1.0.0", docs_url=_docs_url, redoc_url=None, redirect_slashes=False)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
if _raw_origins and _raw_origins.strip() != "*":
    allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
else:
    # Same-origin serve: allow Railway domain + localhost for dev
    allowed_origins = ["*"]

_allow_creds = allowed_origins != ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=_allow_creds,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self'"
        )
        if _is_prod:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# Create all tables
Base.metadata.create_all(bind=engine)

# Warn loudly if running SQLite in production
_is_sqlite = DATABASE_URL.startswith("sqlite")
if _is_sqlite and os.getenv("ENV", "").lower() == "production":
    import sys
    print("WARNING: Running SQLite in production. Set DATABASE_URL to a PostgreSQL connection string.", file=sys.stderr)

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

# Add 'is_read' column to existing chat_messages tables
if _is_sqlite:
    _add_is_read = "ALTER TABLE chat_messages ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT 1"
else:
    _add_is_read = "ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT TRUE"
try:
    with engine.begin() as _conn:
        _conn.execute(text(_add_is_read))
    print("[OK] chat_messages.is_read column ensured")
except Exception as _e:
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


# Ensure inbound_leads table exists
_inbound_leads_ddl = """
    CREATE TABLE IF NOT EXISTS inbound_leads (
        id         {pk},
        phone      VARCHAR NOT NULL UNIQUE,
        last_body  TEXT,
        source     VARCHAR DEFAULT 'sms',
        count      INTEGER DEFAULT 1,
        created_at {ts},
        updated_at {ts}
    )
""".format(
    pk="INTEGER PRIMARY KEY AUTOINCREMENT" if _is_sqlite else "SERIAL PRIMARY KEY",
    ts="DATETIME DEFAULT CURRENT_TIMESTAMP" if _is_sqlite else "TIMESTAMP DEFAULT NOW()",
)
try:
    with engine.begin() as _conn:
        _conn.execute(text(_inbound_leads_ddl))
    print("[OK] inbound_leads table ready")
except Exception as _e:
    print(f"[WARN] inbound_leads DDL: {_e}")


# Ensure tech_availability table exists
_tech_avail_ddl = """
    CREATE TABLE IF NOT EXISTS tech_availability (
        id         {pk},
        user_id    INTEGER NOT NULL REFERENCES users(id),
        week_start VARCHAR NOT NULL,
        mon        BOOLEAN DEFAULT FALSE,
        tue        BOOLEAN DEFAULT FALSE,
        wed        BOOLEAN DEFAULT FALSE,
        thu        BOOLEAN DEFAULT FALSE,
        fri        BOOLEAN DEFAULT FALSE,
        sat        BOOLEAN DEFAULT FALSE,
        sun        BOOLEAN DEFAULT FALSE,
        created_at {ts},
        updated_at {ts},
        UNIQUE(user_id, week_start)
    )
""".format(
    pk="INTEGER PRIMARY KEY AUTOINCREMENT" if _is_sqlite else "SERIAL PRIMARY KEY",
    ts="DATETIME DEFAULT CURRENT_TIMESTAMP" if _is_sqlite else "TIMESTAMP DEFAULT NOW()",
)
try:
    with engine.begin() as _conn:
        _conn.execute(text(_tech_avail_ddl))
    print("[OK] tech_availability table ready")
except Exception as _e:
    print(f"[WARN] tech_availability DDL: {_e}")


# Ensure shift_confirmations table exists
_shift_conf_ddl = """
    CREATE TABLE IF NOT EXISTS shift_confirmations (
        id           {pk},
        user_id      INTEGER NOT NULL REFERENCES users(id),
        shift_date   VARCHAR NOT NULL,
        confirmed_at {ts},
        UNIQUE(user_id, shift_date)
    )
""".format(
    pk="INTEGER PRIMARY KEY AUTOINCREMENT" if _is_sqlite else "SERIAL PRIMARY KEY",
    ts="DATETIME DEFAULT CURRENT_TIMESTAMP" if _is_sqlite else "TIMESTAMP DEFAULT NOW()",
)
try:
    with engine.begin() as _conn:
        _conn.execute(text(_shift_conf_ddl))
    print("[OK] shift_confirmations table ready")
except Exception as _e:
    print(f"[WARN] shift_confirmations DDL: {_e}")


# Ensure timeclocks table exists (handles DBs created before this model was added)
_timeclocks_ddl = """
    CREATE TABLE IF NOT EXISTS timeclocks (
        id         {pk},
        user_id    INTEGER NOT NULL REFERENCES users(id),
        deal_id    INTEGER REFERENCES deals(id),
        clock_type VARCHAR NOT NULL,
        clocked_at {ts},
        notes      TEXT
    )
""".format(
    pk="INTEGER PRIMARY KEY AUTOINCREMENT" if _is_sqlite else "SERIAL PRIMARY KEY",
    ts="DATETIME DEFAULT CURRENT_TIMESTAMP" if _is_sqlite else "TIMESTAMP DEFAULT NOW()",
)
try:
    with engine.begin() as _conn:
        _conn.execute(text(_timeclocks_ddl))
    print("[OK] timeclocks table ready")
except Exception as _e:
    print(f"[WARN] timeclocks DDL: {_e}")


# Ensure deal_technicians table exists
_deal_techs_ddl = """
    CREATE TABLE IF NOT EXISTS deal_technicians (
        id      {pk},
        deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        UNIQUE(deal_id, user_id)
    )
""".format(pk="INTEGER PRIMARY KEY AUTOINCREMENT" if _is_sqlite else "SERIAL PRIMARY KEY")
try:
    with engine.begin() as _conn:
        _conn.execute(text(_deal_techs_ddl))
    print("[OK] deal_technicians table ready")
except Exception as _e:
    print(f"[WARN] deal_technicians DDL: {_e}")


# reminder columns on deals + reminder_logs table
_reminder_migrations = [
    ("reminder_sent",        "ALTER TABLE deals ADD COLUMN{if_not_exists} reminder_sent BOOLEAN DEFAULT FALSE"),
    ("reminder_sent_48h",    "ALTER TABLE deals ADD COLUMN{if_not_exists} reminder_sent_48h BOOLEAN DEFAULT FALSE"),
    ("client_reminder_sent", "ALTER TABLE deals ADD COLUMN{if_not_exists} client_reminder_sent BOOLEAN DEFAULT FALSE"),
]
for _col, _stmt in _reminder_migrations:
    _sql = _stmt.replace("{if_not_exists}", "" if _is_sqlite else " IF NOT EXISTS")
    try:
        with engine.begin() as _conn:
            _conn.execute(text(_sql))
    except Exception:
        pass

_reminder_logs_ddl = """
    CREATE TABLE IF NOT EXISTS reminder_logs (
        id           {pk},
        deal_id      INTEGER NOT NULL REFERENCES deals(id),
        user_id      INTEGER NOT NULL REFERENCES users(id),
        phone_number VARCHAR,
        status       VARCHAR DEFAULT 'sent',
        error        TEXT,
        sent_at      {ts}
    )
""".format(
    pk="INTEGER PRIMARY KEY AUTOINCREMENT" if _is_sqlite else "SERIAL PRIMARY KEY",
    ts="DATETIME DEFAULT CURRENT_TIMESTAMP" if _is_sqlite else "TIMESTAMP DEFAULT NOW()",
)
try:
    with engine.begin() as _conn:
        _conn.execute(text(_reminder_logs_ddl))
    print("[OK] reminder_logs table ready")
except Exception as _e:
    print(f"[WARN] reminder_logs DDL: {_e}")


# Add phone-invite columns to invites table and phone to users table
_invite_migrations = [
    ("phone",     "ALTER TABLE invites ADD COLUMN{if_not_exists} phone VARCHAR"),
    ("full_name", "ALTER TABLE invites ADD COLUMN{if_not_exists} full_name VARCHAR"),
]
for _col, _stmt in _invite_migrations:
    _sql = _stmt.replace("{if_not_exists}", "" if _is_sqlite else " IF NOT EXISTS")
    try:
        with engine.begin() as _conn:
            _conn.execute(text(_sql))
    except Exception:
        pass  # already exists

_user_migrations = [
    ("phone", "ALTER TABLE users ADD COLUMN{if_not_exists} phone VARCHAR"),
]
for _col, _stmt in _user_migrations:
    _sql = _stmt.replace("{if_not_exists}", "" if _is_sqlite else " IF NOT EXISTS")
    try:
        with engine.begin() as _conn:
            _conn.execute(text(_sql))
    except Exception:
        pass  # already exists


# Add new contact columns (address, services, price) for existing production DBs
_deal_migrations = [
    ("job_status",     "ALTER TABLE deals ADD COLUMN{if_not_exists} job_status VARCHAR DEFAULT 'todo'"),
    ("business_type",  "ALTER TABLE deals ADD COLUMN{if_not_exists} business_type VARCHAR DEFAULT 'window'"),
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
    ("address",    "ALTER TABLE contacts ADD COLUMN{if_not_exists} address TEXT"),
    ("services",   "ALTER TABLE contacts ADD COLUMN{if_not_exists} services TEXT"),
    ("price",      "ALTER TABLE contacts ADD COLUMN{if_not_exists} price FLOAT"),
    ("lat",        "ALTER TABLE contacts ADD COLUMN{if_not_exists} lat FLOAT"),
    ("lng",        "ALTER TABLE contacts ADD COLUMN{if_not_exists} lng FLOAT"),
    ("deleted_at", "ALTER TABLE contacts ADD COLUMN{if_not_exists} deleted_at " + ("DATETIME" if _is_sqlite else "TIMESTAMP")),
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
    """Create default admin on first run with a random password."""
    import secrets as _sec
    db = SessionLocal()
    try:
        if not db.query(models.User).first():
            pwd = _sec.token_urlsafe(16)
            admin = models.User(
                username="admin",
                email="admin@crm.local",
                full_name="Admin",
                hashed_password=get_password_hash(pwd),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print(f"[OK] Default admin created -> username: admin | password: {pwd}")
            print("  SAVE THIS PASSWORD — it will not be shown again!")
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

# Force-reset admin password when RESET_ADMIN_PASSWORD=1 is set.
# Also clears the admin phone so 2FA is bypassed.
# Use this whenever you're locked out: set the env var, redeploy, log in, remove the var.
if os.getenv("RESET_ADMIN_PASSWORD") == "1":
    _db = SessionLocal()
    try:
        _admin = _db.query(models.User).filter(models.User.username == "admin").first()
        if _admin:
            _admin.hashed_password = get_password_hash("Admin1234!")
            _admin.phone = None  # clear phone so 2FA doesn't block login
            _db.commit()
            print("[OK] RESET_ADMIN_PASSWORD: password set to Admin1234!, phone cleared")
        else:
            print("[WARN] RESET_ADMIN_PASSWORD: no user with username 'admin' found")
    finally:
        _db.close()

# Nuclear option: reset EVERY user's password to Admin1234! and clear all phones.
# Set RESET_ALL_PASSWORDS=1, redeploy, log in with your username + Admin1234!, remove var.
if os.getenv("RESET_ALL_PASSWORDS") == "1":
    _db = SessionLocal()
    try:
        _all = _db.query(models.User).all()
        for _u in _all:
            _u.hashed_password = get_password_hash("Admin1234!")
            _u.phone = None
        _db.commit()
        print(f"[OK] RESET_ALL_PASSWORDS: reset {len(_all)} user(s) to Admin1234!, phones cleared")
        for _u in _all:
            print(f"  -> username='{_u.username}' full_name='{_u.full_name}' role={_u.role}")
    finally:
        _db.close()

# List all users to Railway logs — set LIST_USERS=1 to see exact usernames.
if os.getenv("LIST_USERS") == "1":
    _db = SessionLocal()
    try:
        _all_users = _db.query(models.User).all()
        print(f"[LIST_USERS] {len(_all_users)} user(s) in database:")
        for _u in _all_users:
            print(f"  id={_u.id} username='{_u.username}' full_name='{_u.full_name}' role={_u.role} active={_u.is_active} phone={_u.phone or 'none'}")
    finally:
        _db.close()

# Reset password for ANY specific user — case-insensitive match on username OR full_name.
# Set RESET_PASSWORD_FOR=<username> in Railway variables, redeploy, log in, then remove it.
_reset_for = os.getenv("RESET_PASSWORD_FOR", "").strip().lower()
if _reset_for:
    _db = SessionLocal()
    try:
        _all_users = _db.query(models.User).all()
        _u = next((u for u in _all_users if u.username.lower() == _reset_for or (u.full_name or '').lower() == _reset_for), None)
        if _u:
            _u.hashed_password = get_password_hash("Admin1234!")
            _u.phone = None  # clear phone so 2FA doesn't block login
            _db.commit()
            print(f"[OK] RESET_PASSWORD_FOR: '{_u.username}' (id={_u.id}) password set to Admin1234!, phone cleared")
        else:
            _names = [u.username for u in _all_users]
            print(f"[WARN] RESET_PASSWORD_FOR: no match for '{_reset_for}'. Existing usernames: {_names}")
    finally:
        _db.close()

# One-time admin password reset — self-disabling via DB marker table _pwd_reset_v1.
# Resets the admin account password to "Admin1234!" so you can log in after a fresh deploy.
# Runs exactly once; all subsequent deploys skip it because the marker table already exists.
try:
    with engine.begin() as _conn:
        _conn.execute(text("CREATE TABLE _pwd_reset_v1 (id int)"))
    # Marker table just created → first time running → reset password
    _db = SessionLocal()
    try:
        _admin = _db.query(models.User).filter(models.User.username == "admin").first()
        if _admin:
            _admin.hashed_password = get_password_hash("Admin1234!")
            _admin.phone = None  # clear phone so 2FA doesn't block login
            _db.commit()
            print("[OK] Admin password reset to Admin1234! (one-time, login and change it)")
        else:
            print("[WARN] _pwd_reset_v1: no admin user found to reset")
    finally:
        _db.close()
except Exception:
    pass  # Marker table already exists → password reset already ran, skip

promote_admins()

# One-time auto-reset of admin password (runs once, self-disabling via DB marker)
try:
    with engine.begin() as _c:
        _exists = _c.execute(text("SELECT to_regclass('_pwd_reset_v1')")).scalar()
        if not _exists:
            _c.execute(text("CREATE TABLE _pwd_reset_v1 (done boolean)"))
            _c.execute(text("INSERT INTO _pwd_reset_v1 VALUES (true)"))
            _db = SessionLocal()
            try:
                _admin = _db.query(models.User).filter(models.User.username == "admin").first()
                if _admin:
                    _admin.hashed_password = get_password_hash("Admin1234!")
                    _db.commit()
                    print("[OK] Admin password auto-reset to: Admin1234!")
            finally:
                _db.close()
except Exception as _e:
    print(f"[WARN] pwd reset skipped: {_e}")

# Data wipe — only runs when WIPE_DATA=1 is explicitly set.
if os.getenv("WIPE_DATA") == "1":
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
        print("[OK] WIPE_DATA=1: contacts, deals, calendar, knocks, chats, activities cleared")
    except Exception as _e:
        _db.rollback()
        print(f"[ERR] Wipe failed: {_e}")
    finally:
        _db.close()

if os.getenv("SEED_CALENDAR") == "1":
    seed_calendar_data()

# Reset bad geocoding — clear lat/lng outside Greater Montreal area.
# Covers lat 45.1–46.1, lon -74.6 to -73.0 (~1 h from Montreal).
try:
    with engine.begin() as _conn:
        _conn.execute(text(
            "UPDATE contacts SET lat = NULL, lng = NULL "
            "WHERE lat IS NOT NULL AND ("
            "  lat < 45.2 OR lat > 46.1 OR lng < -74.7 OR lng > -73.3"
            ")"
        ))
    print("[OK] Cleared out-of-area geocoding (outside Saint-Jerome/Laval/Montreal area)")
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
        # Clean up FK-constrained child rows first to avoid IntegrityError
        _db.query(models.DealTechnician).filter(models.DealTechnician.deal_id.in_(_to_delete)).delete(synchronize_session=False)
        _db.query(models.ReminderLog).filter(models.ReminderLog.deal_id.in_(_to_delete)).delete(synchronize_session=False)
        _db.query(models.Activity).filter(models.Activity.deal_id.in_(_to_delete)).update({"deal_id": None}, synchronize_session=False)
        _db.query(models.TimeClock).filter(models.TimeClock.deal_id.in_(_to_delete)).update({"deal_id": None}, synchronize_session=False)
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
app.include_router(timeclock_routes.router)
app.include_router(analytics_routes.router)
app.include_router(availability_routes.router)
app.include_router(reminders_routes.router)
app.include_router(phases_routes.router)
app.include_router(invoices_routes.router)
app.include_router(hours_routes.router)

# Start 24h reminder scheduler
reminders_routes.start_scheduler()

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
