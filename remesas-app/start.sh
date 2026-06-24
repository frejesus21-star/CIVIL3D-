#!/bin/bash
# Levanta backend y frontend en paralelo
echo "Iniciando RemesasVE..."
cd "$(dirname "$0")"

# Backend
(cd backend && npm start) &
BACKEND_PID=$!

# Frontend
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "  Backend API: http://localhost:4000"
echo "  Frontend:    http://localhost:5173"
echo ""
echo "Presiona Ctrl+C para detener"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
