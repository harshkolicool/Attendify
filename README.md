<div align="center">

<img src="./public/images/readme/hero_banner.jpg" alt="Attendify Hero Banner" width="100%" style="border-radius: 18px;" />

<br/><br/>

# 🎓 ATTENDIFY

### Next-Generation Geofenced & Biometric Smart Attendance System

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-Cache%20%26%20Locks-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io)
[![WebAuthn](https://img.shields.io/badge/WebAuthn-FIDO2%20Passkeys-2D55A4?style=for-the-badge&logo=webauthn&logoColor=white)](https://webauthn.io)
[![Leaflet](https://img.shields.io/badge/Leaflet-GIS%20Mapping-199900?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com)
[![License](https://img.shields.io/badge/License-Proprietary-0A84FF?style=for-the-badge&logo=security&logoColor=white)](#-license)

<br/>

**Attendify** eliminates proxy attendance through **hardware-bound biometric passkeys (FIDO2 WebAuthn)**, **tamper-resistant trusted browser attestation**, **GPS geofence radar verification**, and **real-time WebSocket classroom telemetry** — deployed as a resilient multi-tenant platform for modern institutions.

<br/>

[Overview](#-overview) · [Biometrics & Security](#-biometric-passkeys--trusted-browsers) · [Architecture](#%EF%B8%8F-system-architecture) · [Real-Time Radar](#-real-time-geospatial-radar) · [Tech Stack](#-technology-stack) · [Role Portals](#-role-portals) · [Production Deployment](#-production-deployment-on-render) · [Testing](#-automated-testing)

---

</div>

## ✨ Overview

Traditional college attendance methods like manual paper roll-calls, sign-in sheets, and static QR codes are vulnerable to proxy attendance, buddy punching, and location spoofing. 

**Attendify** solves this by establishing a zero-trust attendance pipeline that cryptographically validates both **physical location** and **device-bound biometric identity** simultaneously.

### 🌟 Core Capabilities

- **🔒 Hardware-Bound Biometric Passkeys** — Passwordless attendance authenticated via Touch ID, Face ID, Windows Hello, or Android Biometrics through the FIDO2/WebAuthn standard.
- **🛡️ Trusted Browser Fallback Engine** — Secondary cryptographic browser attestation with entropy fingerprinting and password step-up when biometrics are unavailable.
- **📍 Real-Time Geofence Enforcement** — High-accuracy GPS verification computing geodesic distance to classroom centers using the Haversine formula on a WGS-84 Earth ellipsoid.
- **⚡ Live Tactical Classroom Radar** — Teachers view a real-time tactical map of connected students with live GPS pin tracking, marker clustering, and proximity badges powered by Socket.IO.
- **🏢 Enterprise Multi-Tenancy** — Strict tenant isolation across colleges, departments, class groups, timetable schedules, and faculty accounts.
- **📊 Instant Analytics & Reporting** — Excel (.xlsx) report generation, student timetable heatmaps, and attendance percentage trackers.
- **🔔 Web Push Notifications** — Background lecture alerts and passkey approval notices via Web Push (VAPID) and Service Workers.

---

## 🔐 Biometric Passkeys & Trusted Browsers

<div align="center">
  <img src="./public/images/readme/biometric_geofence.jpg" alt="Biometric Passkey Verification Architecture" width="100%" style="border-radius: 16px;" />
</div>

Attendify implements a **Dual-Layer Identity Assurance Architecture**: Primary biometric passkey verification backed by cryptographic trusted browser attestation.

### 1. FIDO2 / WebAuthn Biometric Passkeys (Primary)

Passkeys eliminate shared passwords and credential theft. When a student registers a passkey on their device (smartphone, laptop, or tablet):

1. **Hardware Keypair Generation**: The device's **Apple Secure Enclave**, **Android TEE (Trusted Execution Environment)**, or **Windows TPM** generates an asymmetric cryptographic keypair (secp256r1 / Ed25519).
2. **Public Key Registration**: The public key is sent to the Attendify server and permanently stored in MongoDB under the student's profile. The **private key never leaves the physical hardware security chip**.
3. **Challenge-Response Signature**: When marking attendance:
   - The server issues a cryptographically secure 32-byte one-time challenge.
   - The student verifies their physical presence via fingerprint or facial scan.
   - The device's Secure Enclave signs the challenge with the private key.
   - The server verifies the signature, origin, Relying Party ID (RP ID), and anti-replay counters.

```
Student Device (Secure Enclave)                    Attendify Server (Node.js)
        │                                                     │
        │ ── 1. GET /attendance/passkey/options ────────────> │  (Generate 32-byte challenge)
        │ <── 2. Challenge + RP ID + Allowed Credentials ──── │
        │                                                     │
        │  [Biometric Scan Verified (Face ID / Fingerprint)]  │
        │  [Hardware Signs Server Challenge]                  │
        │                                                     │
        │ ── 3. POST /attendance/passkey/verify ────────────> │  (Verify signature against stored public key)
        │ <── 4. Signed Attendance Token Issued ✓ ─────────── │
```

### 2. Trusted Browser Attestation (Zero-Proxy Fallback)

When biometric sensors are temporarily unavailable, students can authenticate through **Trusted Browsers**:

1. **Entropy-Based Device Fingerprinting**: The client generates a multi-dimensional browser entropy hash combining canvas rendering signatures, WebGL GPU profile, audio context fingerprint, and hardware concurrency parameters.
2. **Salted Token Exchange**: When a student trusts their browser on `/student/passkeys`, they must provide their student password. The server validates the credentials and registers a device ID with an activation delay.
3. **Single-Device Token Binding**: Each attendance request generates an ephemeral HMAC token validated against the student's active device signature, preventing browser profile cloning and proxy submissions.

---

## 📡 Real-Time Geospatial Radar

<div align="center">
  <img src="./public/images/readme/radar_telemetry.jpg" alt="Real-Time Geospatial Radar" width="100%" style="border-radius: 16px;" />
</div>

During active lecture sessions, faculty and teachers monitor attendance through a live geospatial radar:

- 🟢 **Inside Geofence** — Student GPS telemetry is verified within the active classroom boundary radius.
- 🟡 **Near Boundary** — Student position is within margin of GPS accuracy drift ($\pm 15\text{m}$).
- 🔴 **Outside Boundary** — Student coordinates exceed the allowed geofence perimeter.
- 📡 **Live Telemetry Beacon** — Real-time GPS stream over WebSockets with 0 page refreshes.

### Haversine Geofence Formula

Classroom boundary verification calculates great-circle geodesic distances between student GPS coordinates and the classroom anchor point:

$$d = 2R \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$

Where $R = 6{,}371{,}000\text{ m}$ (mean Earth radius), $\phi$ is latitude, and $\lambda$ is longitude in radians.

---

## 🏛️ System Architecture

<div align="center">
  <img src="./public/images/readme/system_architecture.jpg" alt="System Architecture" width="100%" style="border-radius: 16px;" />
</div>

Attendify is structured across a decoupled **5-tier production architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                       CLIENT TIER                           │
│  Responsive EJS · PWA · Service Workers · Dark / Light UX   │
├─────────────────────────────────────────────────────────────┤
│                     GATEWAY TIER                            │
│  Reverse Proxy / Cloudflare · SSL/TLS · WebSocket Upgrade   │
├─────────────────────────────────────────────────────────────┤
│                   APPLICATION TIER                          │
│  Node.js Cluster · Express 5 · Socket.IO · Passport.js      │
│  CSRF Protection · Rate Limiting · WebPush Dispatcher       │
├─────────────────────────────────────────────────────────────┤
│                 COORDINATION LAYER                          │
│  Redis: GPS Telemetry Store · Distributed Mutex Locks       │
│  Session Cache · Socket.IO Cluster Adapter                  │
├─────────────────────────────────────────────────────────────┤
│                  PERSISTENCE TIER                           │
│  MongoDB Atlas · Mongoose ODM · Compound Geo Indexes        │
│  Connect-Mongo Encrypted Sessions                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 💻 Technology Stack

<div align="center">

| Layer | Technologies | Role & Implementation |
| :--- | :--- | :--- |
| **Backend Core** | Node.js v18+, Express 5 | Async middleware pipeline, REST API endpoints |
| **Database** | MongoDB Atlas, Mongoose ODM | Document storage, compound indexes, soft deletes |
| **Realtime Engine** | Socket.IO 4+ | Low-latency bi-directional WebSocket streaming |
| **In-Memory Cache** | Redis 7+, ioredis | Distributed locks, GPS hash store, query caching |
| **Biometric Auth** | `@simplewebauthn/server`, FIDO2 | Passkey creation, assertion verification |
| **GIS & Mapping** | Leaflet.js, MarkerCluster | Interactive tactical map, radar circles |
| **Templating** | EJS | Server-rendered UI with responsive CSS design tokens |
| **Reporting** | ExcelJS | Multi-sheet .xlsx attendance exports |
| **Push Alerts** | `web-push`, Service Workers | VAPID push notifications for class reminders |
| **Security** | Helmet, bcrypt, CSRF guards | CSP headers, timing-safe tokens, rate limits |

</div>

---

## 👥 Role Portals

<div align="center">
  <img src="./public/images/readme/role_portals.jpg" alt="Role Portals" width="100%" style="border-radius: 16px;" />
</div>

### 👑 Platform Super Admin
- Global onboarding and verification of colleges and universities.
- System-wide telemetry, college license limits, and health monitoring.
- Managing college admin accounts and global platform configurations.

### 🏛️ College Administrator
- Managing academic departments, class groups, subjects, and timetables.
- Configuring physical classrooms with GPS anchor coordinates and geofence radii.
- Faculty onboarding and student roster management (with CSV bulk import).
- Reviewing student passkey enrollment requests and device resets.

### 👨‍🏫 Teacher / Faculty
- Starting geofenced attendance sessions bound to scheduled class timetables.
- Live tactical classroom radar with real-time student location monitoring.
- Manual attendance overrides for excused absences and official duty.
- Instant single-click export of class attendance logs to Excel (.xlsx).

### 👨‍🎓 Student
- Zero-proxy attendance marking via biometric passkey + GPS verification.
- Trusted browser fallback setup for alternative access.
- Live lecture timetable schedule with active session indicators.
- Attendance history dashboard with subject percentages and calendar heatmaps.

---

## 🚀 Production Deployment on Render

Deploying Attendify to [Render](https://render.com) takes less than 5 minutes:

### 1. Connect Repository
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** $\rightarrow$ **Web Service**.
3. Select your GitHub repository (`Attendify`).

### 2. Configure Service Settings

| Setting | Value |
| :--- | :--- |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | `Starter` (Recommended for persistent WebSockets) |

### 3. Configure Environment Variables

Add the following environment variables in the Render dashboard:

```env
NODE_ENV=production
PORT=10000
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/attendify?retryWrites=true&w=majority
SESSION_SECRET=<generate-a-strong-random-32-char-secret>
ATTENDANCE_TOKEN_SECRET=<generate-a-strong-random-32-char-secret>

# WebAuthn Domain Configuration (Must match your Render domain or custom domain)
APP_URL=https://attendify.onrender.com
RP_ID=attendify.onrender.com
ORIGIN=https://attendify.onrender.com

# Web Push Notification Keys (Generate via: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=<your-vapid-public-key>
VAPID_PRIVATE_KEY=<your-vapid-private-key>
VAPID_SUBJECT=mailto:admin@attendify.com
```

### 4. Deploy & Seed Super Admin
1. Click **Create Web Service**. Render will automatically build and start the application.
2. In the Render Shell tab, run the seed script to create your super admin account:
   ```bash
   npm run init:admin
   ```
3. Log in at `https://your-app-name.onrender.com/platform-admin/login`.

---

## 🧪 Automated Testing

Attendify includes a comprehensive multi-tier automated test suite:

```bash
# Run syntax and lint checks across all source files
npm run lint

# Run unit tests (attendance token signing, geofence policy, passkey verification)
npm run test:flows

# Run full integration and health verification
npm test
```

---

## 🛡️ Security & Anti-Fraud Posture

- **Hardware Signature Defense**: Passkeys utilize asymmetric public-key cryptography; private keys are sealed inside physical device hardware (Apple Secure Enclave / Android TEE).
- **Anti-GPS Spoofing Engine**: Temporal velocity filters detect artificial GPS coordinates moving faster than physical campus walking/running speeds ($> 25\text{ m/s}$).
- **Timing-Safe CSRF Tokens**: Double-submit cookie verification with `crypto.timingSafeEqual` prevents cross-site forgery attacks.
- **Distributed Rate Limiting**: Multi-tier request throttling protects login, attendance, and registration endpoints from brute-force attempts.
- **Strict Content Security Policy**: Dynamic Helmet CSP headers prevent unauthorized scripts, clickjacking, and XSS injection.

---

## 📄 License

<div align="center">

**© 2026 Attendify. All Rights Reserved.**

This software is proprietary. Unauthorized copying, distribution, or commercial deployment without written permission is strictly prohibited.

Built with ❤️ by [Harsh Koli](https://github.com/harshkolicool)

</div>
