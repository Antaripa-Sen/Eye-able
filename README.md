# 👁️ EyeAble — Assistive Learning Platform

An eye-gaze controlled learning platform for students with motor impairments.  
Students type answers using only their eyes. Teachers monitor in real-time.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TailwindCSS + Framer Motion |
| Backend | Node.js + Express + Socket.IO |
| Database | PostgreSQL |
| Auth | JWT + Firebase Google Sign-In |
| Eye Tracking | WebGazer.js |

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/eyeable.git
cd eyeable

# 2. Run setup (installs deps, creates .env files)
chmod +x setup.sh && ./setup.sh

# 3. Create PostgreSQL database (see SETUP.md for full instructions)
psql -U postgres -c "CREATE DATABASE eyeable;"

# 4. Edit backend/.env with your DB password and JWT secret

# 5. Run migrations
cd backend && npm run migrate

# 6. Start backend (Terminal 1)
cd backend && npm run dev

# 7. Start frontend (Terminal 2)
cd frontend && npm run dev

# 8. Open http://localhost:5173
```

---

## Environment Variables

See [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example).  
Copy each to `.env` and fill in your values. **Never commit `.env` files.**

---

## Full Setup Guide

See [SETUP.md](SETUP.md) for:
- PostgreSQL installation
- Firebase Google Sign-In setup
- API reference
- Socket.IO event reference
- Production deployment checklist

---

## Features

- 👁️ **Eye-gaze keyboard** — dwell-based typing with WebGazer.js
- 📡 **Real-time classroom** — Socket.IO live student monitoring
- 📚 **Assignment management** — create, publish, assign to students
- 📊 **Analytics** — WPM, accuracy, gaze confidence tracking
- ⚙️ **Remote settings** — teacher pushes accessibility settings to students live
- 🔔 **Notifications** — disconnection, submission, recalibration alerts
- 🔐 **JWT auth** — role-based access (teacher/student)
- 🌙 **Dark UI** — glassmorphism, futuristic design
