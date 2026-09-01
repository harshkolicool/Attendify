<div align="center">

<img src="./public/images/readme/hero_banner.jpg" alt="Attendify Hero Banner" width="100%" style="border-radius: 18px;" />

<br/><br/>

# 🎓 ATTENDIFY

### Next-Gen Zero-Proxy Biometric, Ultrasonic & Geofenced Smart Attendance Platform

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20Multi--Tenant-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-Cluster%20Cache%20%26%20Queues-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime%20Radar-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io)
[![WebAuthn](https://img.shields.io/badge/WebAuthn-FIDO2%20Passkeys-2D55A4?style=for-the-badge&logo=webauthn&logoColor=white)](https://webauthn.io)
[![Web Audio](https://img.shields.io/badge/Web_Audio-Ultrasonic_4--Tone_Chord-9333EA?style=for-the-badge&logo=audio&logoColor=white)](#-ultrasonic-acoustic-radar)
[![PWA](https://img.shields.io/badge/PWA-Offline%20Background%20Sync-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](#-offline-background-sync)
[![Tests](https://img.shields.io/badge/Tests-23%2F23%20Passing-10B981?style=for-the-badge&logo=checkmarx&logoColor=white)](#-automated-testing)
[![Anti-Proxy](https://img.shields.io/badge/Anti--Proxy-100%25%20Hardware--Bound-6366F1?style=for-the-badge&logo=shield&logoColor=white)](#-security)
[![License](https://img.shields.io/badge/License-ISC-yellow?style=for-the-badge)](./LICENSE)

<br/>

> **Attendify** makes proxy attendance physically impossible. It simultaneously verifies that a student is **inside the room** (ultrasonic soundwaves), **biometrically authenticated** (Touch ID / Face ID), and **geographically present** (satellite GPS) — all in under 3 seconds, from any smartphone.

<br/>

[📖 Overview](#-overview) · [✨ Features](#-core-features) · [🛡️ Security](#-multi-layer-security) · [🗺️ Portals](#-role-portals) · [⚙️ Setup](#-getting-started) · [🧪 Tests](#-automated-testing) · [🚀 Deploy](#-deployment)

---

</div>

## 📖 Overview

Traditional attendance systems are broken. Here's how students cheat them — and how Attendify stops each one:

| Old Method | How Students Cheat | How Attendify Stops It |
| :--- | :--- | :--- |
| Paper roll call | Friend says "present" for you | **Biometric passkey** proves only your device can sign |
| QR Code scan | Send screenshot to WhatsApp group | **Ultrasonic sound** only present in the physical room |
| GPS check-in | Fake GPS mock location apps | **Kalman filter + velocity** catches teleporting locations |
| Password login | Share password with friends | **FIDO2 Passkey** cannot be shared — lives on your hardware |
| Static tokens | Copy-paste token to friend | **20-second rolling tokens** expire before they can be shared |

Attendify verifies **three independent physical proofs** at the same time:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ATTENDIFY TRIPLE-VERIFICATION PIPELINE                 │
├───────────────────────┬─────────────────────────────┬───────────────────────┤
│  1. BIOMETRIC PASSKEY │  2. ULTRASONIC CHORD RADAR  │  3. GPS GEOFENCE      │
│  Apple Secure Enclave │  Inaudible 18.3–19.7 kHz    │  Sub-Meter GPS Radius │
│  Android Hardware TEE │  Simultaneous 4-Tone Chord  │  Kalman Filter Smooth │
│  Windows Hello TPM    │  Indoor Seating Row Ranging │  Anti-Spoof Velocity  │
└───────────────────────┴─────────────────────────────┴───────────────────────┘
```

---

## ✨ Core Features

### 🔊 Ultrasonic Acoustic Radar

<div align="center">
  <img src="./public/images/readme/attendance_marking_flow.jpg" alt="Ultrasonic Attendance Flow" width="80%" style="border-radius: 14px;" />
</div>

<br/>

**How it works — in plain English:**
- The teacher's laptop speakers emit 4 silent ultrasonic tones simultaneously (like a dog whistle — humans can't hear it, but microphones can capture it).
- These soundwaves physically cannot travel through classroom walls, so you must be **inside the room** to receive them.
- The student's smartphone microphone captures the tones using a 2048-point FFT (Fast Fourier Transform) spectral scan.
- The system decodes the tones into a 4-character cryptographic verification code and measures the **exact seating distance** using indoor log-distance path loss physics.
- **Verdict**: Front Row (0–2m), Mid Classroom (2–5m), Back Row (5–8m).

**Anti-cheat protections built in:**
- 🔄 **Rolling 20-second chords**: The tones change every 20 seconds using SHA-256 time-window hashing — so recording and sending audio to a friend is useless (it expires before they can use it).
- 🔇 **Completely inaudible**: No disruption to the class. Frequency range 18,300 Hz – 19,740 Hz.
- ⚡ **Instant** (~0.2 seconds decoding time).

---

### 🔑 FIDO2 WebAuthn Biometric Passkeys

**How it works — in plain English:**
- Instead of typing a password, students tap their fingerprint or look at their face camera to mark attendance.
- A cryptographic key pair is generated **inside** the phone's secure hardware chip (Secure Enclave on iPhone, TEE on Android) and never leaves the device.
- Even Attendify's own servers never see the private key — making it impossible to share credentials.
- Supported on: **iPhone (Face ID / Touch ID)**, **Android (Fingerprint / Face)**, **MacBook (Touch ID)**, **Windows (Windows Hello)**, **USB hardware keys (YubiKey)**.

**Why this stops proxy:**
- You literally cannot share a passkey with a friend — it's locked to your specific device's hardware chip.
- Even if a friend borrows your phone, they need your face or fingerprint to authenticate.

---

### 📶 Offline Background Sync (PWA)

**How it works — in plain English:**
- If the internet is slow or completely dead (basement classroom, overcrowded Wi-Fi), attendance still gets marked locally.
- The app stores the attendance record in the phone's offline storage (IndexedDB).
- A **Service Worker** running in the background automatically syncs it to the server the moment connectivity returns — even if the student has closed the browser tab or locked their phone.
- **Result**: Zero dropped attendance marks, even in zero-signal rooms.

---

### 🛡️ Motion Fusion & Anti-Emulator Guard

**How it works — in plain English:**
- While marking attendance, the app silently samples the phone's accelerometer for natural human micro-tremors (tiny movements every person's hand makes while holding a phone).
- Bots and PC emulators produce zero movement — they're caught and blocked.
- This prevents automated scripts or virtual machines from faking real student attendance.

---

### 🗺️ Live Classroom Radar Map

**How it works — in plain English:**
- When a session is active, teachers see a live Leaflet map in the dashboard.
- Each student appears as a colored pin with their name, and the pins **glide smoothly** in real-time as students move (using GPU-accelerated CSS cubic-bezier transitions — no jarring teleports).
- Color-coded distance rings show who is Inside the geofence, Near the boundary, or Outside.
- Student count pills update live via Socket.IO WebSockets.

---

### 🚄 High-Concurrency Redis Batch Queue

**How it works — in plain English:**
- At 9:00 AM when 500 students try to mark attendance simultaneously, naive apps crash or slow down.
- Attendify buffers all attendance attempts in a **Redis queue** and writes them to MongoDB in 50-record `insertMany` bulk batches — keeping API response time under 15ms even at campus-scale load.
- Multi-core **CPU clustering** (`cluster.js`) spawns one server worker per CPU core and uses `@socket.io/sticky` for WebSocket routing across all workers.

---

## 🛡️ Multi-Layer Security

| Layer | What It Checks | What Threat It Blocks |
| :---: | :--- | :--- |
| **Layer 1** | 🔊 Ultrasonic chord decoded by mic | Outside-room proxy attendance |
| **Layer 2** | 🔄 SHA-256 Rolling 20s Token | Recorded audio being shared via WhatsApp |
| **Layer 3** | 🔑 FIDO2 Passkey ES256 Signature | Account sharing, buddy punching |
| **Layer 4** | 📱 Accelerometer micro-tremor fusion | Virtual machines, bot scripts |
| **Layer 5** | 📍 Kalman-smoothed GPS geofence | Fake GPS apps, mock location tools |
| **Layer 6** | ⏱️ Rate limiter (15 req/min per IP+session) | Brute force, automated spamming |

---

## 📱 Screenshots

<div align="center">

| Student Dashboard | Teacher Live Radar | Attendance History |
| :---: | :---: | :---: |
| <img src="./public/images/readme/student_dashboard.jpg" width="250" style="border-radius:12px" /> | <img src="./public/images/readme/teacher_dashboard.jpg" width="250" style="border-radius:12px" /> | <img src="./public/images/readme/attendance_history.jpg" width="250" style="border-radius:12px" /> |

</div>

---

## 👥 Role Portals

### 🎓 Student Portal (`/student/dashboard`)

Everything a student needs in one clean dashboard:

- **One-Tap Smart Attendance** — Auto tries GPS first, falls back to ultrasonic automatically.
- **Live Progress Bars** — Real-time attendance percentage per subject.
- **Subject-Wise Analytics** — Doughnut charts showing attendance breakdown.
- **Class Timetable** — Countdown timer to next lecture.
- **Full History Log** — Every past attendance record with color-coded method badges:
  - 🟣 `Ultrasonic` — Verified physically inside room via soundwave
  - 🟢 `Passkey` — Verified via biometric hardware key
  - 🔵 `GPS` — Verified via satellite geofence
  - ⚪ `Manual` — Teacher-overridden entry
- **Passkey Manager** — Register/delete your Touch ID / Face ID devices.
- **Acoustic Diagnostic Lab** — Test your microphone's ultrasonic reception quality live.

---

### 👨‍🏫 Teacher Portal (`/teacher/dashboard`)

Full session and classroom control:

- **Start / Extend / End Sessions** — One-click class session control with time remaining countdown.
- **Live Classroom Radar Map** — Real-time student GPS pins with smooth gliding animations.
- **Verified Roster** — Live student list with Inside / Near / Outside / Ultrasonic status pills.
- **Ultrasonic Lab** — Broadcast controls with live frequency spectrum visualization.
- **Reports & Exports** — Date-range filtered CSV and `.xlsx` Excel report exports.
- **Push Notifications** — Send lecture-start alerts to enrolled students.

---

### 🏢 College Admin Portal (`/admin/dashboard`)

Complete institutional management:

- **Departments, Classes & Timetables** — Full CRUD management for all academic structure.
- **Teacher & Student Enrollment** — Approval flows for new accounts.
- **Passkey Authorization** — Review and approve student hardware key setup requests.
- **College-wide Analytics** — Attendance compliance dashboards and low-attendance alerts.

---

### 🌐 Platform Super Admin (`/platform-admin/dashboard`)

For the platform operator:

- **Multi-college Registration Approvals** — Review and activate new institutions.
- **System Health Monitoring** — Server uptime, database connections, active socket count.
- **Global Audit Logs** — Cross-institution event log for compliance.

---

## ⚙️ Getting Started

### Prerequisites
- **Node.js** v18.0.0 or higher
- **MongoDB** (local or MongoDB Atlas)
- **Redis** (optional for dev, required for production clustering)

### 1. Clone & Install

```bash
git clone https://github.com/harshkoli/Attendify.git
cd Attendify
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```env
# Server
PORT=5500
NODE_ENV=development

# Database
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/attendify

# Session Security
SESSION_SECRET=your_super_secret_session_key_here_minimum_32_chars

# Redis (optional in dev, required in production)
REDIS_URL=redis://localhost:6379

# WebAuthn / Passkeys
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:5500
WEBAUTHN_RP_NAME=Attendify

# Web Push Notifications (optional)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=mailto:admin@yourapp.com
```

### 3. Run

```bash
# Development (hot-reload with Nodemon)
npm run dev

# Production (multi-core CPU cluster)
npm start
```

Visit `http://localhost:5500` in your browser.

---

## 🧪 Automated Testing

```bash
npm test
```

This runs **syntax checks across all 93 source files** + **23 automated flow tests**:

```
✔ Acoustic frequency bin calculations map correctly above human hearing (v2.0)
✔ Acoustic 3-bin window peak detection captures slightly shifted frequencies
✔ Acoustic dynamic SNR distinguishes ultrasonic beacon from broadband noise
✔ Acoustic log-distance path loss correctly classifies seating rows
✔ Attendance token validates for correct session and student
✔ Tampered attendance token is rejected
✔ Expired attendance token is rejected
✔ allowAttendanceRequest isolates rate limits per student
✔ Simulated concurrent attendance mark preserves atomic counts
✔ Adaptive confidence threshold increases for small radius and weak network
✔ Strongly inside position passes even with low confidence
✔ Boundary-ambiguous low-confidence fix requests retry
✔ Clearly outside position fails
✔ isValidCoordinate rejects (0, 0) and out-of-range coordinates
✔ inferAccuracyFromMeta conservatively inflates accuracy when samples are poor
✔ getWebAuthnConfig handles localhost correctly
✔ getWebAuthnConfig handles proxy and Render headers correctly
✔ getSimpleWebAuthnServer exports generateRegistrationOptions
✔ Passkey credential public key deserializes reliably from MongoDB BSON Binary
✔ IP prefix normalization works for IPv4 and IPv6
✔ Trusted-device risk remains low for expected context
✔ Trusted-device risk escalates and requires step-up when profile changes
✔ Token rotation policy triggers after configured window

ℹ tests 23 | pass 23 | fail 0 ✅
```

---

## 🚀 Deployment

### Deploy on Render

1. Push your repo to GitHub.
2. Create a new **Web Service** on [render.com](https://render.com).
3. Set Build Command: `npm install`
4. Set Start Command: `npm start`
5. Add all `.env` variables under **Environment** settings.

### Deploy with PM2 (VPS)

```bash
# Install PM2 globally
npm install -g pm2

# Start with multi-core cluster config
pm2 start ecosystem.config.js --env production

# Auto-restart on server reboot
pm2 save && pm2 startup
```

---

## 🧰 Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Node.js v18+ | Server-side JavaScript |
| **Web Framework** | Express.js v5 | HTTP routing, middleware |
| **Database** | MongoDB Atlas + Mongoose | Multi-tenant data storage |
| **Caching & Queues** | Redis | Session cache, attendance bulk queue |
| **Real-Time** | Socket.IO + Cluster Adapter | Live classroom radar, WebSocket events |
| **DSP / Audio** | Web Audio API | 2048-pt FFT, MFSK decoding, ultrasonic |
| **Biometrics** | SimpleWebAuthn (FIDO2) | Passkey generation and verification |
| **Maps** | Leaflet.js + OpenStreetMap | Live GPS classroom radar |
| **Security** | Helmet.js, CSRF, Rate Limiter | HTTP hardening, anti-abuse |
| **Frontend** | Vanilla JS, CSS Glassmorphism | No framework overhead, fast load |
| **PWA** | Service Workers, IndexedDB | Offline sync, background beacon |
| **Analytics** | Chart.js | Attendance doughnut and bar charts |
| **Reports** | ExcelJS | `.xlsx` multi-sheet attendance exports |
| **Process Management** | PM2 + Node Cluster | Multi-core zero-downtime deployment |

---

## 📄 License

This project is licensed under the **ISC License**.

Built with ❤️ by [Harsh Koli](https://github.com/harshkolicool) for universities and smart campuses worldwide.

---

<div align="center">

⭐ **If Attendify helps your institution, please give it a star!** ⭐

</div>
