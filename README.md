# Attendify

Attendify is an advanced geo-location based attendance management system built for educational institutions. It allows teachers to start real-time attendance sessions and students to securely mark their attendance using Passkeys (WebAuthn) or Trusted Browser authentication, validated against a highly precise, server-side GPS verification engine.

---

## 🚀 Key Features

*   **Real-Time Dashboards:** Built with Socket.io, teachers can see students appearing on their dashboard in real-time as they mark their attendance.
*   **Progressive Web App (PWA) Support:** The app installs seamlessly on mobile devices.
*   **Offline Queueing:** If a student loses their internet connection during class, they can still tap "Mark Attendance". The app securely queues the request offline and automatically syncs it with the server the moment the connection is restored.
*   **Advanced Geolocation Engine:** Custom multi-sample GPS smoothing algorithm that filters out multipath indoor interference and speed outliers before sending the coordinates to the server.
*   **Biometric Passkeys (WebAuthn):** Students can register multiple Passkeys (FaceID, TouchID, Windows Hello) to authenticate their identity effortlessly, completely eliminating shared passwords and buddy-punching. Admin-gated passkey setup windows ensure strict device control.
*   **Trusted Browser Fallback:** A secure device-fingerprinting fallback for older devices that don't support Passkeys.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB, Mongoose |
| **Frontend** | EJS, HTML, Vanilla CSS, JavaScript (PWA Service Workers) |
| **Authentication** | Passport.js, express-session, bcrypt |
| **Realtime** | Socket.io (with fallback polling support) |
| **Maps & Location** | Leaflet.js, Browser Geolocation API |
| **Biometrics** | WebAuthn, `@simplewebauthn/server` |
| **Security** | Helmet, CSRF protection, express-rate-limit |

---

## 🏗 System Architecture & Workflow

### 1. Administration & Setup
The College Admin is responsible for setting up the baseline data:
*   Registering Departments, Subjects, Class Groups, Classrooms, Teachers, and Students.
*   Setting the physical geolocation (Latitude, Longitude) and `radius` for every Classroom.
*   Defining the Weekly Schedule.

### 2. Teacher Starts Live Attendance
When it's time for a scheduled class, the Teacher opens their dashboard:
1.  The Teacher clicks **Start**.
2.  The Teacher's device collects their current GPS location.
3.  An `AttendanceSession` is created on the backend containing the Teacher's location, the allowed radius (from the Classroom setup), and the session timeframe.
4.  Using WebSockets, the system instantly alerts all students in that Class Group that a live attendance session has started.

### 3. Student Marks Attendance
When a Student opens their dashboard during an active session, they see the **Mark Attendance** button. Clicking it triggers a strict multi-layered verification process:

#### Layer A: Identity Verification (Passkey vs Trusted Browser)
To ensure the student isn't marking attendance for a friend, they must prove their identity using a physical device factor:
*   **Passkeys (WebAuthn):** The server sends a cryptographic "challenge". The student's device prompts them for their fingerprint or Face ID. If successful, the device signs the challenge with their securely stored private key. Students can register *multiple* passkeys (e.g., iPhone + iPad), but only during an admin-approved 30-minute window.
*   **Trusted Browser (Fallback):** The student enters their password to "Trust" their current browser. The server generates a unique encrypted device token and stores it as an HttpOnly cookie.

#### Layer B: Geolocation Verification
Once identity is confirmed, the system verifies the student is physically in the classroom.
*   **Client-Side Smoothing:** The frontend uses the HTML5 Geolocation API (`navigator.geolocation`) to capture up to 16 samples over 25 seconds, filtering out speed-based outliers and wild inaccurate readings to find the most confident coordinate.
*   **Server-Side Validation:** The frontend sends this data to the backend. The backend calculates the Haversine distance between the Student's coordinates and the Teacher's coordinates.
*   **Grace Allowances:** The backend accounts for GPS inaccuracy. If the calculated distance minus the GPS inaccuracy margin is strictly less than the Classroom's allowed radius, the backend accepts the attendance.

### 4. Finalizing Records
*   If all checks pass, an `AttendanceRecord` is created with a `PRESENT` status. The Teacher's live dashboard updates instantly.
*   If the checks fail (e.g. Student is 500 meters away), an `AttendanceAttempt` is logged as `REJECTED` and the teacher can see it in their "Suspicious Attempts" panel.
*   When the class time ends, the session automatically closes and marks all remaining students as `ABSENT`.

---

## 🔒 Security Features

Attendify includes enterprise-grade security protections:
*   **Password hashing** with bcrypt
*   **Session authentication** using Passport.js and MongoDB session store
*   **CSRF protection** injected dynamically into all frontend requests
*   **Helmet security headers** enforcing strict Content Security Policies (CSP)
*   **Rate limiting** to prevent brute-force attacks (`express-rate-limit`)
*   **Server-side GPS validation** preventing spoofed client-side distance calculations
*   **Role-based route protection** (Platform Admin, College Admin, Teacher, Student)

---

## 💻 Local Setup & Development

### Prerequisites
*   Node.js (v18+)
*   MongoDB Instance (Local or Atlas)

### Installation
1. Clone the project:
   ```bash
   git clone <repo-url>
   cd Attendify
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory. You can use the following template:
   ```env
   NODE_ENV=development
   PORT=5500
   MONGO_URI=mongodb://127.0.0.1:27017/attendance-app
   SESSION_SECRET=your-very-long-secure-session-secret-here
   ATTENDANCE_TOKEN_SECRET=your-very-long-attendance-token-secret-here
   APP_ORIGIN=http://localhost:5500
   WEBAUTHN_RP_ID=localhost
   WEBAUTHN_ORIGIN=http://localhost:5500
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

### 🛠 Developer GPS Bypass
If you are developing locally on a desktop computer without a GPS chip, the frontend will fail to acquire a location. You can bypass the GPS requirement to easily test the application:

1. Add `MOCK_GPS=true` to your `.env` file.
2. In your browser console on the student dashboard, run: `localStorage.setItem('MOCK_GPS', 'true')`
3. Hard refresh the page. The system will now instantly inject mock coordinates and bypass backend distance checks!

---

## ☁️ Deployment

Attendify supports multiple deployment modes depending on your infrastructure. The app automatically detects the environment using the `REALTIME_MODE` variable.

*   **`socket` mode**: Best for VPS (EC2, DigitalOcean) or persistent services (Render, Railway). It uses true WebSockets for instant, low-latency live map and dashboard updates.
*   **`polling` mode**: Best for serverless environments (Vercel, Netlify). The frontend automatically switches to fetching data every few seconds, ensuring realtime-like functionality without connection drops.

For a production-grade deployment on Vercel, it is highly recommended to explicitly set `REALTIME_MODE=polling`.
