from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, SessionLocal
import models
from routes import auth, users, contacts, companies, deals, activities, dashboard, knocks
from auth import get_password_hash

app = FastAPI(title="Self-Hosted CRM", version="1.0.0", docs_url="/api/docs", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create all tables
Base.metadata.create_all(bind=engine)


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


@app.get("/")
def root():
    return {"status": "CRM API running", "docs": "/api/docs"}
