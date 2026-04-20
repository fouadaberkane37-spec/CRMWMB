from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./crm.db")

# Sanitize: strip whitespace and accidental leading "=" (copy-paste artifacts)
DATABASE_URL = DATABASE_URL.strip().lstrip("=").strip()

# If the env var was set to an empty string (e.g. overridden to "" in Railway),
# fall back to SQLite so the app at least starts instead of crashing.
if not DATABASE_URL:
    import sys
    print("WARNING: DATABASE_URL is empty — falling back to SQLite. Set it to a PostgreSQL URL in production.", file=sys.stderr)
    DATABASE_URL = "sqlite:///./crm.db"

# Railway (and most PaaS) gives postgres:// URLs; SQLAlchemy requires postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# check_same_thread is only valid for SQLite
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
