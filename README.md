# Self-Hosted CRM

A fully self-hosted CRM — your data stays 100% on your machine. No subscriptions, no seat limits, no data sent anywhere.

## Features

- **Contacts** — manage leads, prospects, and customers
- **Companies** — organize by organization
- **Deals Pipeline** — Kanban board (Lead → Qualified → Proposal → Negotiation → Won/Lost)
- **Activities** — log calls, emails, meetings, notes, tasks
- **Users** — unlimited users with admin/user roles
- **Dashboard** — stats and recent activity at a glance

## Stack

- **Backend**: FastAPI + SQLite (via SQLAlchemy)
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Auth**: JWT tokens + bcrypt — everything local

## Quick Start (Windows)

```
double-click start.bat
```

## Quick Start (Mac/Linux)

```bash
chmod +x start.sh
./start.sh
```

Then open **http://localhost:5173**

**Default login**: `admin` / `admin123` — change this after first login!

## Manual Setup

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Data

All data is stored in `backend/crm.db` (SQLite). Back up this file to keep your data safe.

## Security

- Change the default admin password immediately after first login
- Set a strong `SECRET_KEY` env var in production:
  ```
  SECRET_KEY=your-very-long-random-secret uvicorn main:app --port 8000
  ```
- Do not expose to the internet without HTTPS/reverse proxy

## API Docs

Visit **http://localhost:8000/api/docs** for the interactive API reference.
