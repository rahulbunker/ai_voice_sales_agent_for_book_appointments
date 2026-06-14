# 🤖 AutoCall Pro — AI Voice Sales Agent with CRM Automation

> **An intelligent AI-powered outbound calling system** that automates sales conversations, books appointments via Google Calendar, manages leads in Firestore, and retries failed calls automatically — built with Flask, Firebase, ElevenLabs, and Google Calendar API.

---

## 📌 Table of Contents

- [Project Overview](#-project-overview)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [How It Works — End to End](#-how-it-works--end-to-end)
- [Key Features](#-key-features)
- [API Endpoints Reference](#-api-endpoints-reference)
- [Environment Variables Setup](#-environment-variables-setup)
- [Firebase Setup](#-firebase-setup)
- [Google Calendar Integration](#-google-calendar-integration)
- [Auto-Retry Scheduler](#-auto-retry-scheduler)
- [Installation & Running Locally](#-installation--running-locally)
- [Call Status Flow](#-call-status-flow)
- [Security Notes](#-security-notes)

---

## 🧠 Project Overview

**AutoCall Pro** is a full-stack AI voice agent system designed for **clinics, sales teams, and businesses** that need to automate outbound phone calls and appointment booking at scale.

The system works like this:
1. A sales agent (or admin) logs into a **Firebase-authenticated dashboard**
2. They upload a list of contacts or trigger a single outbound call
3. The system calls the customer using an **AI voice agent** (powered by ElevenLabs Conversational AI via an external telephony API)
4. The AI voice agent conducts a sales conversation and, if the customer agrees, books an appointment on **Google Calendar** with a **Google Meet link**
5. All contact data, call statuses, and appointment details are saved in **Firestore (Firebase)**
6. If a call fails or goes unanswered, the **APScheduler** automatically retries it after a configurable interval

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│   Login Page (index.html) + Dashboard (dashboard.html)      │
│   Firebase Client SDK — handles auth, token management      │
└───────────────────────┬─────────────────────────────────────┘
                        │ Firebase ID Token (JWT)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  FLASK BACKEND (main.py)                    │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Auth Layer  │  │ Outbound API │  │  Appointment API │  │
│  │ Firebase SDK │  │ (outbound.py)│  │  Google Calendar │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         APScheduler — Auto Retry (every 5 min)      │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────┬───────────────────────┬──────────────────────┘
               │                       │
               ▼                       ▼
┌──────────────────────┐   ┌────────────────────────────────┐
│  External Telephony  │   │        Firebase / Firestore    │
│  API (Bonvoice)      │   │  contacts, userSettings,       │
│  + ElevenLabs AI     │   │  appointments collection       │
│  Voice Agent         │   └────────────────────────────────┘
└──────────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│      Google Calendar API        │
│  Check free/busy → Create event │
│  with Google Meet link          │
└──────────────────────────────────┘
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Backend Framework** | Flask 3.1.0 (Python) |
| **Authentication** | Firebase Authentication (Google/Email) |
| **Database** | Firebase Firestore (NoSQL) |
| **Outbound Calling** | External Telephony API (Bonvoice) + ElevenLabs AI Voice |
| **Appointment Booking** | Google Calendar API v3 |
| **Background Jobs** | APScheduler (BackgroundScheduler) |
| **Environment Config** | python-dotenv |
| **HTTP Client** | requests 2.32.3 |
| **Frontend** | HTML, CSS, Vanilla JavaScript |

---

## 📁 Project Structure

```
ai_voice_sales_agent_for_book_appointments/
│
├── main.py                  # Flask app — routes, auth, scheduler, API
├── outbound.py              # Outbound call logic (single, bulk, status check)
│
├── templates/
│   ├── index.html           # Login / Signup page
│   └── dashboard.html       # Main CRM dashboard
│
├── static/
│   ├── css/                 # Stylesheets
│   └── js/                  # Frontend JS (auth, call triggers, etc.)
│
├── thesis/                  # Research/documentation files (LaTeX)
│
├── firebase.json            # Firebase service account credentials
├── firebase_config.json     # Firebase frontend config
├── firestore.rules          # Firestore security rules
├── .env                     # Environment variables (API keys, URLs)
├── requirements.txt         # Python dependencies
├── structure.txt            # Project structure notes
└── EXTERNAL_API_CHANGES.md  # Changelog for external API updates
```

---

## 🔄 How It Works — End to End

### Step 1 — User Login
- Frontend uses **Firebase Client SDK** to authenticate
- After login, Firebase returns an **ID Token (JWT)**
- Frontend sends this token to `POST /api/auth/verify`
- Backend verifies it via **Firebase Admin SDK** and sets a **secure httpOnly cookie**

### Step 2 — Making an Outbound Call
- User enters a phone number on the dashboard and clicks "Call"
- Frontend calls `POST /api/outbound/call` with `{ "destination": "919876543210" }`
- `main.py` passes this to `outbound.py → make_outbound_call()`
- `outbound.py` sends a POST request to the **external Bonvoice API** (`/outbound-call`)
- Bonvoice triggers the **ElevenLabs AI voice agent** to call the customer
- API returns an `event_id` to track the call

### Step 3 — Tracking Call Status
- Frontend polls `GET /api/outbound/call-status/<event_id>` every few seconds
- Backend calls `outbound.py → check_call_status()` which hits `/call-status/{event_id}` on Bonvoice
- Returns status: `initiated → in-progress → answered → completed/failed/no-answer`
- Firestore `contacts` collection is updated with the latest status and `calledAt` timestamp

### Step 4 — Appointment Booking
- If the customer agrees during the AI call, ElevenLabs triggers the appointment booking webhook
- `POST /api/webhooks/appointments/book` receives contact details + `appointmentDateTime`
- Backend checks **Google Calendar free/busy** to confirm the slot is available
- If available → creates a **Google Calendar event** with a **Google Meet link**
- Updates Firestore contact with `appointmentStatus`, `calendarEventId`, `meetingLink`

### Step 5 — Auto-Retry Failed Calls
- APScheduler runs `auto_retry_failed_calls()` **every 5 minutes**
- Queries Firestore for contacts with status `failed`, `no-answer`, `busy`, `not-connected`
- Checks if the last call attempt was more than the configured retry interval ago (default: 1 hour)
- Automatically retries those calls by calling `make_outbound_call()` again

---

## ✨ Key Features

- **🔐 Firebase Authentication** — Secure login with email/password or Google OAuth; token verified server-side
- **📞 AI-Powered Outbound Calling** — ElevenLabs Conversational AI conducts real sales conversations over phone
- **📅 Smart Appointment Booking** — Free/busy check + Google Meet link auto-generated; Firestore updated automatically
- **📋 Bulk Calling** — Upload a contacts list and trigger calls to all of them in one API call
- **🔁 Auto-Retry Scheduler** — Failed/missed calls retried automatically on a configurable interval (5 min to 24 hrs)
- **📊 CRM Dashboard** — Visual dashboard to view contact statuses, call history, and appointments
- **🔒 Webhook Security** — Appointment webhook protected by `APPOINTMENT_WEBHOOK_SECRET`
- **🌐 Dual Booking Endpoints** — Separate endpoints for dashboard use (`/api/appointments/book`) and external AI agent (`/api/webhooks/appointments/book`)

---

## 📡 API Endpoints Reference

### Auth Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/verify` | Verify Firebase ID token, set session cookie | No |
| `POST` | `/api/auth/logout` | Clear session cookie | No |
| `GET` | `/api/auth/session` | Check if current session is valid | No |
| `GET` | `/api/user/profile` | Get logged-in user profile | ✅ Yes |

### Outbound Call Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/outbound/call` | Trigger a single outbound AI call | ✅ Yes |
| `GET` | `/api/outbound/call-status/<event_id>` | Poll live call status | ✅ Yes |
| `POST` | `/api/outbound/bulk` | Trigger bulk calls to multiple contacts | ✅ Yes |

### Appointment Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/appointments/book` | Book appointment from dashboard | ✅ Yes |
| `POST` | `/api/webhooks/appointments/book` | Book appointment from ElevenLabs AI agent | Webhook Secret |

### Settings Endpoint

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/settings/retry-interval` | Update auto-retry interval (minutes) | ✅ Yes |

---

### Appointment Booking Payload

Both appointment endpoints accept the same JSON:

```json
{
  "contactId": "optional-firestore-contact-id",
  "name": "Rahul",
  "phone": "+919876543210",
  "email": "rahul@example.com",
  "appointmentDateTime": "2026-05-28T16:00:00+05:30",
  "durationMinutes": 30,
  "notes": "Booked during outbound AI call."
}
```

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the project root with these values:

```env
# ── Outbound Calling API ──────────────────────────────────
OUTBOUND_API_URL=https://your-telephony-api.run.app
API_SECRET_KEY=your-api-secret-key

# ── Google Calendar ───────────────────────────────────────
GOOGLE_CALENDAR_ID=your_calendar_id_or_email@gmail.com
GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata

# ── Appointment Webhook Security ──────────────────────────
APPOINTMENT_WEBHOOK_SECRET=make-a-long-random-secret-here

# ── Google Credentials (choose one) ──────────────────────
# Option A: Path to service account JSON file
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json

# Option B: Inline service account JSON (for cloud deployments)
GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

> ⚠️ **Important:** The `.env` file contains real secrets. Never commit it with actual credentials to a public repo. Add `.env` to `.gitignore` (or replace sensitive values before pushing).

---

## 🔥 Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project
2. Enable **Authentication** (Email/Password + Google)
3. Create a **Firestore Database** (start in test mode, then apply `firestore.rules`)
4. Go to **Project Settings → Service Accounts → Generate new private key**
5. Save the downloaded JSON as `firebase.json` in the project root
6. Copy your **Firebase web config** (apiKey, authDomain, etc.) into `firebase_config.json`

### Firestore Collections Used

| Collection | Purpose |
|---|---|
| `contacts` | Stores all leads — name, phone, status, calledAt, appointmentStatus |
| `userSettings` | Stores per-user retry interval preference |

---

## 📅 Google Calendar Integration

The appointment booking system:
1. Uses a **Google Service Account** (not OAuth — no user login required for Calendar)
2. Calls `freebusy.query` to check if the requested slot is free
3. If free → calls `events.insert` to create the event with:
   - Guest email (customer)
   - Google Meet conference link (auto-generated)
   - Duration from `durationMinutes`
   - Notes from the AI call
4. Updates Firestore contact document with `calendarEventId` and `meetingLink`

### Service Account Setup

1. Go to Google Cloud Console → IAM & Admin → Service Accounts
2. Create a service account and download its JSON key
3. Share your Google Calendar with the service account email
4. Grant **"Make changes to events"** permission

---

## ⏰ Auto-Retry Scheduler

The background scheduler (`APScheduler`) runs inside the Flask process and checks for failed calls every 5 minutes.

**Retry Logic:**
- Fetches all contacts from Firestore with status: `failed`, `no-answer`, `busy`, `not-connected`
- Checks if `calledAt` timestamp is older than the retry interval
- Per-user retry interval read from `userSettings` collection (default: 60 minutes)
- Retries by calling `make_outbound_call()` and updating Firestore status accordingly

**Configurable via API:**
```http
POST /api/settings/retry-interval
{ "minutes": 30 }
```
Allowed range: 5 to 1440 minutes (1 day).

---

## 🚀 Installation & Running Locally

### Prerequisites
- Python 3.10+
- A Firebase project (with service account JSON)
- Access to an outbound telephony API (Bonvoice or similar)
- Google Cloud service account with Calendar API enabled

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/rahulbunker/ai_voice_sales_agent_for_book_appointments.git
cd ai_voice_sales_agent_for_book_appointments

# 2. Create and activate virtual environment
python -m venv venv
source venv/bin/activate        # Linux/Mac
venv\Scripts\activate           # Windows

# 3. Install dependencies
pip install -r requirements.txt

# Additional packages (not in requirements.txt but used):
pip install apscheduler google-api-python-client google-auth

# 4. Set up environment variables
cp .env.example .env            # Edit with your real values

# 5. Add Firebase service account
# Save your firebase service account JSON as firebase.json

# 6. Run the Flask server
python main.py
```

Server starts at: `http://127.0.0.1:5001`

| Page | URL |
|---|---|
| Login | `http://127.0.0.1:5001/login` |
| Dashboard | `http://127.0.0.1:5001/dashboard` |
| Auth API | `http://127.0.0.1:5001/api/auth/verify` |

---

## 📊 Call Status Flow

```
Contact Added
     │
     ▼
  "pending"
     │
     ▼ (call triggered)
  "calling"
     │
     ├──► "answered" ──► "completed" ──► appointmentStatus: "booked" ✅
     │
     ├──► "failed"    ──► [auto-retry after interval]
     │
     ├──► "no-answer" ──► [auto-retry after interval]
     │
     └──► "busy"      ──► [auto-retry after interval]
```

---

## 🔒 Security Notes

- Firebase ID Tokens are verified **server-side** using Firebase Admin SDK on every protected request
- Session token is stored as an **httpOnly, SameSite=Lax cookie** (not accessible via JavaScript)
- The appointment webhook endpoint is protected by `APPOINTMENT_WEBHOOK_SECRET` header
- Firestore security rules in `firestore.rules` restrict data access per authenticated user
- The `.env` file should never be committed with real credentials — use environment variables in production

---

## 👨‍💻 Author

**Rahul Bunker**
M.Sc Data Science — IIIT Lucknow (2024–2026)
GitHub: [@rahulbunker](https://github.com/rahulbunker)

---

## 📄 License

This project is for portfolio and educational purposes. Feel free to fork and adapt with attribution.
