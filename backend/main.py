from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import text
from database import engine, Base, SessionLocal, DATABASE_URL
import models
from routes import auth, users, contacts, companies, deals, activities, dashboard, knocks, search, sms, chats
from auth import get_password_hash
import os

app = FastAPI(title="Self-Hosted CRM", version="1.0.0", docs_url="/api/docs", redirect_slashes=False)

# Allow all origins in production (Railway sets PORT; frontend is served by same process)
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
_chat_ddl = """
    CREATE TABLE IF NOT EXISTS chat_messages (
        id {pk},
        contact_id INTEGER NOT NULL REFERENCES contacts(id),
        sender_id  INTEGER NOT NULL REFERENCES users(id),
        body       TEXT    NOT NULL,
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


seed_admin()

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
