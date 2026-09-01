<div align="center">

<img src="./public/images/readme/hero_banner.jpg" alt="Attendify — Smart Attendance Platform" width="100%" />

<br/><br/>

# 🎓 Attendify

**Enterprise Zero-Proxy Smart Attendance — Biometrics + Ultrasonic + GPS**

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-Queue%20%26%20Cache-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io)
[![WebAuthn](https://img.shields.io/badge/WebAuthn-FIDO2%20Passkeys-2D55A4?style=for-the-badge&logo=webauthn&logoColor=white)](https://webauthn.io)
[![PWA](https://img.shields.io/badge/PWA-Offline%20Sync-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](#-offline-background-sync)
[![Tests](https://img.shields.io/badge/Tests-23%2F23%20Passing-10B981?style=for-the-badge&logo=checkmarx&logoColor=white)](#-automated-testing)
[![Anti-Proxy](https://img.shields.io/badge/Anti--Proxy-Hardware%20Bound-6366F1?style=for-the-badge&logo=shield&logoColor=white)](#-security)

<br/>

> **Attendify makes proxy attendance physically impossible.**
> Students must be physically inside the room (ultrasonic sound), biometrically authenticated (Touch ID / Face ID), and geographically confirmed (GPS) — all verified simultaneously in under 3 seconds from any smartphone.

<br/>

**[📖 Overview](#-overview) · [✨ Features](#-features) · [🛡️ Security](#-security) · [👥 Portals](#-role-portals) · [⚙️ Setup](#-getting-started) · [🧪 Tests](#-automated-testing) · [🚀 Deploy](#-deployment)**

---

</div>

## 📖 Overview

Traditional attendance is broken. Here is how students cheat and how Attendify stops each method:

| Old Method | How Students Cheat It | How Attendify Stops It |
| :--- | :--- | :--- |
| Paper roll call | Friend answers "present" for you | Biometric passkey — only your device can sign |
| QR Code scan | Screenshot sent over WhatsApp | Ultrasonic sound — physically inside room only |
| GPS check-in | Fake GPS / mock location apps | Kalman filter + velocity clamp detects teleporting |
| Password login | Share password with classmates | FIDO2 passkey cannot leave your hardware chip |
| Static tokens | Copy token and forward it | 20-second rolling tokens expire before forwarding |

**Attendify verifies three independent physical proofs at the same time:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ATTENDIFY TRIPLE-VERIFICATION PIPELINE                  │
├───────────────────────┬─────────────────────────────┬───────────────────────┤
│  1. BIOMETRIC PASSKEY │  2. ULTRASONIC CHORD RADAR  │  3. GPS GEOFENCE      │
│  Apple Secure Enclave │  Inaudible 18.3–19.7 kHz    │  Sub-Meter GPS Radius │
│  Android Hardware TEE │  4-Tone Simultaneous Chord  │  Kalman Filter Smooth │
│  Windows Hello TPM    │  Indoor Seating Row Ranging │  Anti-Spoof Velocity  │
└───────────────────────┴─────────────────────────────┴───────────────────────┘
```

---

## ✨ Features

### 🔊 Ultrasonic Acoustic Radar (4-Tone Polyphonic Chord)

<div align="center">
  <img src="./public/images/readme/acoustic_radar_presence.jpg" alt="Ultrasonic Acoustic Radar — Attendance Verification" width="90%" />
</div>

<br/>

**How it works in plain English:**

1. The teacher's laptop speakers emit **4 silent ultrasonic tones at the same time** — like a dog whistle that humans cannot hear but microphones can detect.
2. These soundwaves **physically cannot travel through walls**, so students must be inside the room.
3. The student's smartphone microphone captures the tones using a **2048-point FFT scan**.
4. The system decodes all 4 tones into a cryptographic verification code in **under 0.2 seconds**.
5. Indoor path-loss physics measures the student's **exact seating distance** and categorizes them: Front Row (0–2m), Mid Classroom (2–5m), Back Row (5–8m).

**Built-in anti-cheat protections:**
- 🔄 **Rolling 20-second chords** — Tones rotate using SHA-256 time-window hashing. Forwarded recordings expire before a friend can use them.
- 🔇 **Completely inaudible** — Frequency range 18,300 Hz–19,740 Hz. Zero disruption to class.
- ⚡ **Instant** — Full decode in ~0.2 seconds.

---

### 🔑 FIDO2 WebAuthn Biometric Passkeys

<div align="center">
  <img src="./public/images/readme/biometric_geofence.jpg" alt="Biometric Passkey + GPS Geofence" width="90%" />
</div>

<br/>

**How it works in plain English:**

- Instead of typing a password, students tap their fingerprint or look at their face camera.
- A cryptographic key pair is generated **inside** the device's secure hardware chip (iPhone Secure Enclave, Android TEE, Windows TPM) and **never leaves the device**.
- Even Attendify's own servers never see the private key.
- Supported on: **iPhone (Face ID / Touch ID)**, **Android (Fingerprint / Face)**, **MacBook (Touch ID)**, **Windows (Windows Hello)**, **YubiKey (USB)**.

**Why this stops proxy:**
- A passkey cannot be shared — it is locked to your specific device's hardware chip.
- Even if a friend borrows your phone, they need your own face or fingerprint.

---

### 📍 Sub-Meter GPS Geofencing

**How it works in plain English:**

- When the teacher starts a class, their GPS coordinates form a **geofence boundary** around the classroom.
- The student's phone must report a location within that boundary using high-accuracy satellite GPS (`enableHighAccuracy: true`, zero cache).
- A **Kalman filter** smooths out atmospheric drift and multipath wall reflections so legitimate students are not rejected due to GPS noise.
- An anti-velocity clamp detects fake GPS apps that "teleport" from a dorm room to the classroom instantly.

---

### 📶 Offline Background Sync (PWA)

**How it works in plain English:**

- If the internet is dead (basement classroom, overcrowded Wi-Fi), attendance is stored **locally in the browser** (IndexedDB).
- A **Service Worker** (`/sw.js`) running in the background automatically syncs it to the server the moment connection returns — even if the student has closed the browser tab or locked their phone.
- **Result:** Zero dropped attendance marks, even in zero-signal rooms.

---

### 🛡️ Motion Fusion — Anti-Emulator Guard

**How it works in plain English:**

- While marking attendance, the app silently samples the phone's accelerometer for natural human micro-tremors.
- Bots and PC emulators produce zero movement — they are caught and blocked.
- This prevents automated scripts and virtual machines from faking student presence.

---

### 🗺️ Live Tactical Classroom Radar Map

<div align="center">
  <img src="./public/images/readme/radar_telemetry.jpg" alt="Teacher Live Classroom Radar Map" width="90%" />
</div>

<br/>

**How it works in plain English:**

- When a session is live, teachers see a real-time Leaflet map with every connected student as a colored pin.
- Pins **glide smoothly** as students move (GPU-accelerated CSS cubic-bezier transitions — no jarring teleports).
- Color-coded rings show: **Inside geofence**, **Near boundary**, **Outside**, **Ultrasonic verified**.
- Live student count pills update instantly via Socket.IO WebSockets.

---

### 🚄 High-Concurrency Redis Batch Queue

**How it works in plain English:**

- At 9:00 AM when 500 students try to mark attendance at once, naive apps crash or time out.
- Attendify buffers all attempts in a **Redis queue** and writes them to MongoDB in 50-record `insertMany` bulk batches — keeping response time under 15ms at campus scale.
- **Multi-core CPU clustering** (`cluster.js`) spawns one server worker per CPU core with `@socket.io/sticky` load balancing across all workers.

---

## 🛡️ Security

<div align="center">
  <img src="./public/images/readme/algorithms_cryptography.jpg" alt="Attendify Cryptography & Security Architecture" width="90%" />
</div>

<br/>

| Layer | What It Checks | Threat It Blocks |
| :---: | :--- | :--- |
| **1** | 🔊 Ultrasonic chord decoded by microphone | Outside-room proxy attendance |
| **2** | 🔄 SHA-256 Rolling 20-second Token | Audio forwarded over WhatsApp |
| **3** | 🔑 FIDO2 Passkey ES256 Signature | Account sharing, buddy punching |
| **4** | 📱 Accelerometer micro-tremor fusion | Virtual machines, bot scripts |
| **5** | 📍 Kalman-smoothed GPS geofence | Fake GPS / mock location tools |
| **6** | ⏱️ Rate limiter (15 req/min per IP+session) | Brute force, automated spamming |

---

## 👥 Role Portals

<div align="center">
  <img src="./public/images/readme/role_portals.jpg" alt="Attendify Role Portals — Student, Teacher, Admin" width="90%" />
</div>

<br/>

### 🎓 Student (`/student/dashboard`)

- **One-tap smart attendance** — Tries GPS first, auto-falls back to ultrasonic
- **Live attendance percentage** — Progress bars per subject, updated in real time
- **Doughnut chart analytics** — Subject-wise attendance breakdown
- **Class timetable** — Countdown timer to next lecture
- **Full history log** — Every past mark with colored method badges:
  - 🟣 `Ultrasonic` — Physically inside room via soundwave
  - 🟢 `Passkey` — Biometric hardware key
  - 🔵 `GPS` — Satellite geofence
  - ⚪ `Manual` — Teacher override
- **Passkey manager** — Register / delete Touch ID / Face ID devices
- **Acoustic diagnostic lab** — Test microphone ultrasonic reception quality

---

### 👨‍🏫 Teacher (`/teacher/dashboard`)

- **Session control** — Start, extend, and end class in one click
- **Live classroom radar** — Real-time student GPS pins with smooth animations
- **Verified roster** — Live list with Inside / Near / Outside / Ultrasonic status pills
- **Ultrasonic lab** — Broadcast controls with live frequency spectrum visualization
- **Reports & exports** — Date-range CSV and `.xlsx` Excel exports
- **Push notifications** — Send lecture-start alerts to all enrolled students

---

### 🏢 College Admin (`/admin/dashboard`)

- Full CRUD for Departments, Classes, Subjects, Timetables, Classrooms
- Teacher and student enrollment approval flows
- Passkey setup request review and hardware authorization
- College-wide attendance analytics and low-attendance alerts

---

### 🌐 Platform Super Admin (`/platform-admin/dashboard`)

- Multi-college registration approvals
- System health: server uptime, DB connections, active socket count
- Cross-institution audit logs

---

## ⚙️ Getting Started

### Prerequisites

- **Node.js** v18.0.0 or higher
- **MongoDB** (local or MongoDB Atlas)
- **Redis** (optional in dev, required for production)

### 1. Clone & Install

```bash
git clone https://github.com/harshkolicool/Attendify.git
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

# Session Security (minimum 32 characters)
SESSION_SECRET=your_super_secret_session_key_here_min_32_chars

# Redis (required in production)
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

### 3. Run the App

```bash
# Development — hot-reload with Nodemon
npm run dev

# Production — multi-core CPU cluster
npm start
```

Visit **`http://localhost:5500`** in your browser.

---

## 🧪 Automated Testing

```bash
npm test
```

Runs **syntax checks across all 93 source files** + **23 automated flow tests**:

```
✔ Acoustic frequency bin calculations map correctly above human hearing (v2.0)
✔ Acoustic 3-bin window peak detection captures slightly shifted frequencies
✔ Acoustic dynamic SNR distinguishes ultrasonic beacon from broadband noise
✔ Acoustic log-distance path loss correctly classifies seating rows (v2.0)
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

ℹ tests 23  |  pass 23  |  fail 0  ✅
```

---

## 🏗️ System Architecture

<div align="center">
  <img src="./public/images/readme/system_architecture.jpg" alt="Attendify System Architecture" width="90%" />
</div>

<br/>

```
                        ┌──────────────────────────────────────────┐
                        │          PRODUCTION CLUSTER               │
                        │   cluster.js  ──►  N × Worker Processes  │
                        │   @socket.io/sticky  (least-connection)  │
                        └──────────────────┬───────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              ▼                            ▼                            ▼
       ┌─────────────┐            ┌─────────────────┐          ┌──────────────┐
       │  MongoDB     │            │   Redis Queue   │          │  Socket.IO   │
       │  Atlas       │            │   Batch Write   │          │  Cluster     │
       │  (10 conn/   │            │   (50-item      │          │  Adapter     │
       │  worker)     │            │   insertMany)   │          │  (Pub/Sub)   │
       └─────────────┘            └─────────────────┘          └──────────────┘
```

---

## 🚀 Deployment

### Option A — Render (recommended for easy hosting)

1. Push your repo to GitHub.
2. Create a new **Web Service** on [render.com](https://render.com).
3. Set **Build Command:** `npm install`
4. Set **Start Command:** `npm start`
5. Add all `.env` variables under **Environment** settings.

### Option B — VPS with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start with multi-core cluster config
pm2 start ecosystem.config.js --env production

# Save and enable auto-restart on reboot
pm2 save
pm2 startup
```

---

## 🧰 Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| Runtime | Node.js v18+ | Server-side JavaScript |
| Web Framework | Express.js v5 | HTTP routing and middleware |
| Database | MongoDB Atlas + Mongoose | Multi-tenant data, connection pooling |
| Cache & Queues | Redis | Session cache, attendance bulk queue |
| Real-Time | Socket.IO + Cluster Adapter | Live radar map, WebSocket events |
| DSP / Audio | Web Audio API | 2048-pt FFT, MFSK chord decode |
| Biometrics | SimpleWebAuthn (FIDO2) | Passkey generation and verification |
| Maps | Leaflet.js + OpenStreetMap | Live GPS classroom radar |
| Security | Helmet.js, CSRF, Rate Limiter | HTTP hardening, anti-abuse |
| Frontend | Vanilla JS, CSS Glassmorphism | Fast, framework-free |
| PWA | Service Workers, IndexedDB | Offline sync, background beacon |
| Analytics | Chart.js | Attendance doughnut and bar charts |
| Reports | ExcelJS | `.xlsx` multi-sheet exports |
| Process Mgmt | PM2 + Node Cluster | Multi-core zero-downtime deployment |

---

## 📄 License

This project is licensed under the **ISC License**.

Built with ❤️ by [Harsh Koli](https://github.com/harshkolicool) for universities and smart campuses worldwide.

---

<div align="center">

**⭐ If Attendify helps your institution, please give it a star! ⭐**

</div>
