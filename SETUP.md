# EyeAble — Complete Setup Guide

## Architecture Overview

```
eyeable/
├── backend/          ← Node.js + Express + Socket.IO + PostgreSQL
│   ├── config/       ← DB connection
│   ├── controllers/  ← Business logic
│   ├── database/     ← Schema & migrations
│   ├── middleware/   ← JWT auth
│   ├── routes/       ← API endpoints
│   ├── sockets/      ← Real-time Socket.IO
│   └── index.js      ← Server entry
└── frontend/         ← React + Vite + Tailwind
    └── src/
        ├── pages/    ← AuthPage, StudentPage, TeacherPage
        ├── store/    ← Zustand auth store
        ├── services/ ← Firebase (Google OAuth) + Socket.IO
        └── components/
```

---

## Step 1: Install PostgreSQL

### macOS
```bash
brew install postgresql@15
brew services start postgresql@15
```

### Ubuntu/Debian
```bash
sudo apt update && sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Windows
Download from: https://www.postgresql.org/download/windows/

---

## Step 2: Create the Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE eyeable;
CREATE USER eyeable_user WITH ENCRYPTED PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE eyeable TO eyeable_user;
\q
```

---

## Step 3: Run Schema Migration

```bash
cd eyeable/backend

# Copy and fill in your .env
cp .env.example .env
# Edit .env with your actual values:
# DATABASE_URL=postgresql://eyeable_user:yourpassword@localhost:5432/eyeable
# JWT_SECRET=generate-a-random-64-char-string-here

# Install dependencies
npm install

# Run migration (creates all tables)
npm run migrate
```

You should see:
```
✅ PostgreSQL connected
✅ All tables created successfully
```

---

## Step 4: Configure Environment Files

### backend/.env
```
DATABASE_URL=postgresql://eyeable_user:yourpassword@localhost:5432/eyeable
JWT_SECRET=replace-with-a-random-secret-minimum-32-chars
JWT_EXPIRES_IN=7d
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### frontend/.env
```
VITE_API_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
VITE_FIREBASE_API_KEY=AIzaSyAvOGMmLgbeZwpVpOAWeH5ilU077uOmz2s
VITE_FIREBASE_AUTH_DOMAIN=eyeable-2026.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=eyeable-2026
VITE_FIREBASE_APP_ID=1:29944050006:web:33515697c3aac35432e6f7
```

---

## Step 5: Start the Backend

```bash
cd eyeable/backend
npm run dev
```

Expected output:
```
🚀 EyeAble backend running on port 4000
📡 Socket.IO enabled
✅ PostgreSQL connected
```

---

## Step 6: Install and Start the Frontend

```bash
cd eyeable/frontend
npm install
npm run dev
```

Open: http://localhost:5173

---

## Step 7: Verify APIs are Working

```bash
# Health check
curl http://localhost:4000/health
# Should return: {"status":"ok","timestamp":"..."}

# Test registration
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@test.com","password":"password123","fullName":"Test Teacher","role":"teacher"}'
# Should return: {"token":"...","user":{...}}
```

---

## Step 8: Google Sign-In Setup

Google Sign-In uses your existing Firebase project (eyeable-2026). 

In Firebase Console (https://console.firebase.google.com):
1. Go to Authentication → Sign-in method
2. Enable Google provider
3. Add `http://localhost:5173` to Authorized domains
4. (For production) Add your domain

The backend receives the Google UID from Firebase and creates/finds the user in PostgreSQL — no Firebase Realtime Database is used anymore.

---

## Step 9: Test Socket.IO Real-Time

1. Open http://localhost:5173
2. Register a **teacher** account → Go to Live Classroom tab
3. Open another browser/tab → Register a **student** account
4. The student card will appear in the teacher dashboard in real-time
5. As the student types, the teacher sees live updates

---

## Step 10: How Everything Works Together

```
Student Browser
    │
    ├─ WebGazer.js (eye tracking) → keyboard clicks
    ├─ Socket.IO → teacher dashboard (live typing, gaze confidence)
    └─ REST API → submit answer, save analytics

Teacher Browser
    ├─ Socket.IO → real-time student cards
    ├─ REST API → assignments, submissions, analytics
    └─ Socket.IO emit → push settings/recalibration to students
```

---

## Common Errors & Fixes

### "Cannot connect to PostgreSQL"
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432
# Or: sudo systemctl status postgresql
```

### "CORS error"
Make sure `FRONTEND_URL=http://localhost:5173` is set in backend `.env`

### "Firebase: auth/unauthorized-domain"
Add `localhost` to Firebase Console → Authentication → Settings → Authorized domains

### "WebGazer camera denied"
- Must use HTTPS in production
- For local dev, browser allows localhost camera
- Check browser camera permissions

### "Socket not connecting"
Verify `VITE_SOCKET_URL=http://localhost:4000` in frontend `.env`

---

## Production Deployment Checklist

- [ ] Set `NODE_ENV=production` in backend
- [ ] Use a strong `JWT_SECRET` (64+ random chars)
- [ ] Use SSL/HTTPS (required for webcam access)
- [ ] Add production domain to Firebase Authorized Domains
- [ ] Set `FRONTEND_URL` to your actual domain
- [ ] Use a managed PostgreSQL (Supabase, Railway, Neon, etc.)
- [ ] Deploy backend to Railway/Render/Heroku
- [ ] Deploy frontend to Vercel/Netlify
- [ ] Update `VITE_API_URL` and `VITE_SOCKET_URL` to production URLs

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register new user |
| POST | /api/auth/login | No | Email login |
| POST | /api/auth/google | No | Google OAuth |
| GET | /api/auth/me | Yes | Current user |
| GET | /api/assignments | Yes | List assignments |
| GET | /api/assignments/active | Student | Current assignment |
| POST | /api/assignments | Teacher | Create assignment |
| PATCH | /api/assignments/:id/publish | Teacher | Toggle publish |
| DELETE | /api/assignments/:id | Teacher | Delete |
| POST | /api/submissions | Student | Save answer |
| GET | /api/submissions | Yes | Get submissions |
| POST | /api/analytics | Student | Save session data |
| GET | /api/analytics/students | Teacher | All students overview |
| GET | /api/analytics/:studentId | Yes | Student analytics |
| GET | /api/settings/:studentId | Yes | Get settings |
| PATCH | /api/settings/:studentId | Yes | Update settings |
| GET | /api/users/students | Teacher | All students |
| GET | /api/users/notifications | Yes | Notifications |

## Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| student:typing | Student→Server→Teachers | Live typing updates |
| student:gaze | Student→Server→Teachers | Gaze confidence |
| student:submitted | Student→Server→Teachers | Answer submitted |
| students:online | Server→Teacher | Initial online list |
| student:online | Server→Teachers | Student connected |
| student:update | Server→Teachers | Student status update |
| student:offline | Server→Teachers | Student disconnected |
| teacher:updateSettings | Teacher→Server→Student | Push settings |
| teacher:recalibrate | Teacher→Server→Student | Request recalibration |
| settings:updated | Server→Student | Settings received |
| calibration:requested | Server→Student | Show calibration modal |
| notification:new | Server→Teachers | New notification |
