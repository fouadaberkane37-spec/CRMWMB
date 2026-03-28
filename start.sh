#!/bin/bash
set -e

echo "==============================="
echo "  Self-Hosted CRM - Starting"
echo "==============================="

# Backend
echo ""
echo "[1/4] Setting up backend..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt -q
echo "Backend ready."

echo "[2/4] Starting backend (port 8000)..."
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Frontend
echo ""
echo "[3/4] Setting up frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies (first run only)..."
    npm install
fi
echo "Frontend ready."

echo "[4/4] Starting frontend (port 5173)..."
echo ""
echo "==============================="
echo "  CRM is starting!"
echo "  Open: http://localhost:5173"
echo "  Login: admin / admin123"
echo "==============================="
echo ""
npm run dev &
FRONTEND_PID=$!
cd ..

# Open browser
sleep 3
if command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:5173
elif command -v open &>/dev/null; then
    open http://localhost:5173
fi

# Wait and clean up on Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'CRM stopped.'" EXIT
wait
