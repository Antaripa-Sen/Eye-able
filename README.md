# 👁️ EyeAble — Assistive Learning Platform

[![Frontend](https://img.shields.io/badge/Frontend-React_Vite-38bdf8?style=flat-square&logo=react)](https://reactjs.org/)
[![Backend](https://img.shields.io/badge/Backend-Node.js_Express-22c55e?style=flat-square&logo=nodedotjs)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL-316192?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Eye Tracking](https://img.shields.io/badge/AI-WebGazer.js-f5c842?style=flat-square)](https://webgazer.cs.brown.edu/)

**EyeAble** is an AI-powered, browser-based, eye-controlled learning platform designed specifically for children with motor impairments. It eliminates the need for expensive hardware, allowing students to complete assignments, type, and communicate using only their webcam and their eyes. 

## 🌟 The Problem & Motivation

Motor-disabled children often possess normal cognitive abilities but struggle to write or type, leaving them dependent on caregivers for academic participation. Traditional eye-tracking hardware is prohibitively expensive for most families and schools. 

**EyeAble** solves this by democratizing accessibility. We use computer vision and AI to provide a completely hardware-free, browser-based platform that brings inclusive digital learning to low-resource settings and promotes true academic independence.

---

## ✨ Key Features

### For the Student (The "Nazar" Interface)
* 👁️ **Webcam Eye-Tracking:** High-accuracy, real-time gaze detection using `WebGazer.js`.
* 🎯 **Ergonomic "Nazar" UI:** A friendly, unified, single-screen dashboard featuring a curved, radial keyboard designed specifically to reduce eye fatigue and make targeting easier.
* ⏱️ **Dwell-Based Selection:** Squeeze-to-select animations and smooth audio feedback eliminate the need for physical clicks.
* 🔊 **Text-to-Speech:** Built-in audio playback gives non-verbal students an immediate voice.
* 🌙 **High-Contrast Dark Mode:** Deep indigo and warm amber themes reduce glare and improve eye-tracking accuracy.

### For the Teacher (The Command Center)
* 📡 **Live Monitoring:** Real-time Socket.IO dashboard to track which students are online, their current WPM, and gaze confidence.
* 📚 **Task Management:** Create, publish, and assign sentence/paragraph typing exercises or exams.
* ⚙️ **Remote Accessibility Sync:** Teachers can live-push settings (like dwell time, font size, or UI scale) directly to a struggling student's screen.
* 📊 **Analytics & Grading:** Track long-term student progress, review submitted answers, and send graded feedback.

---

## 🏗 System Architecture

The platform operates on a seamless, real-time data flow to ensure zero lag for the user:

`Camera Input` ➔ `Eye Tracking AI (WebGazer)` ➔ `Gaze Mapping Engine` ➔ `Interactive Canvas UI` ➔ `PostgreSQL Database` ➔ `Live Teacher Dashboard (Socket.IO)`

---

## 💻 Tech Stack

| Layer | Technology |
|-------|------|
| **Frontend** | React, Vite, TailwindCSS, Framer Motion |
| **Backend** | Node.js, Express, Socket.IO |
| **Database** | PostgreSQL |
| **Auth** | JWT, Firebase Google Sign-In |
| **Eye Tracking** | WebGazer.js (TFFacemesh & Ridge Regression) |

---

## 🚀 Quick Start

Ensure you have Node.js and PostgreSQL installed.

```bash
# 1. Clone the repo
git clone [https://github.com/Antaripa-Sen/Eye-able.git](https://github.com/Antaripa-Sen/Eye-able.git)
cd Eye-able

# 2. Run setup (installs dependencies, creates .env files)
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