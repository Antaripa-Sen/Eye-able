#!/bin/bash
# EyeAble Quick Setup Script
# Run: chmod +x setup.sh && ./setup.sh

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     EyeAble — Setup Script           ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Backend setup
echo "📦 Installing backend dependencies..."
cd backend && npm install
echo ""

echo "🔑 Setting up backend environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created backend/.env — PLEASE EDIT IT with your values"
else
  echo "⚠️  backend/.env already exists, skipping"
fi
cd ..

# Frontend setup
echo ""
echo "📦 Installing frontend dependencies..."
cd frontend && npm install
echo ""

echo "🔑 Setting up frontend environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created frontend/.env — Firebase values are pre-filled"
else
  echo "⚠️  frontend/.env already exists, skipping"
fi
cd ..

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  NEXT STEPS:                                         ║"
echo "║  1. Edit backend/.env  → add DB password + JWT secret ║"
echo "║  2. Create PostgreSQL DB (see SETUP.md)              ║"
echo "║  3. Run: cd backend && npm run migrate               ║"
echo "║  4. Run: cd backend && npm run dev  (terminal 1)     ║"
echo "║  5. Run: cd frontend && npm run dev (terminal 2)     ║"
echo "║  6. Open: http://localhost:5173                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
