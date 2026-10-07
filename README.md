# 🎟️ EventHub: Event Booking & QR Check-In Portal

[![CI Pipeline](https://github.com/your-username/eventhub-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/eventhub-portal/actions)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Dependencies: Zero](https://img.shields.io/badge/dependencies-0%20external-brightgreen.svg)](#-zero-external-dependencies)
[![Cost Posture: ₹0](https://img.shields.io/badge/budget-%E2%82%B90%20free-success.svg)](#-cost-constraints--acceptance-criteria)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> **Industry Full-Stack Project Challenge · Project 05 Specification**  
> An end-to-end, zero-cost operational platform featuring dynamic scannable QR ticket generation, real-time entrance gate check-in, duplicate scan prevention, capacity constraints, OpenStreetMap Nominatim geocoding, and security audit observability.

---

## 📑 Table of Contents
- [Project Overview](#-1-project-overview)
- [Key Features](#-2-key-features)
- [System Architecture](#-3-system-architecture)
- [Database Schema & Constraints](#-4-database-schema--constraints)
- [Quickstart Guide](#-5-quickstart-guide)
- [Presentation & Viva Guide](#-6-presentation--viva-guide)
- [REST API Reference](#-7-rest-api-reference)
- [Automated Testing](#-8-automated-testing)
- [Cost Constraints & Acceptance Criteria](#-9-cost-constraints--acceptance-criteria)
- [Contributing](#-10-contributing)
- [License](#-11-license)

---

## 📌 1. Project Overview
Small-to-medium events, campus hackathons, student workshops, and technical conferences need participant registration, capacity control, and entrance check-in without buying a heavy, paid enterprise ticketing platform.

**EventHub** replaces fragmented spreadsheets and manual paper lists with a modern, lightweight operational web application featuring:
1. **Strict Capacity Enforcement**: Real-time counter preventing over-subscription of limited venue capacity.
2. **Cryptographic QR Digital Passes**: Unique ticket token generation (`EH-2026-XXXX-XXXX`) and canvas QR codes.
3. **Live Entrance Gate Check-In**: High-speed scanner & validator that prevents duplicate entries and provides instant audio-visual verification.
4. **Interactive Venue Mapping**: External API integration with OpenStreetMap Nominatim for address geocoding and Leaflet interactive map pins.
5. **Observability & Audit Trail**: Full transaction logs in `organizer_logs` tracking every creation, booking, and check-in event.

---

## ✨ 2. Key Features

- **Multi-Role Ecosystem**: Seamless switching between **Attendee**, **Organizer**, and **Gate Operator** with a 1-click header switcher designed specifically for classroom/viva demonstrations.
- **Boarding Pass Passes**: Beautiful digital tickets styled with airline/concert cutout perforations, attendee details, ticket tokens, and high-resolution canvas QR codes.
- **Entrance Gate Console**: Live gate turnout metrics gauge (`Checked In / Capacity`), instant token input, and audio chime synthesis via the browser's native Web Audio API.
- **Duplicate Prevention**: Immediate detection of reused or screenshotted QR passes, displaying the original admission timestamp and operator name.
- **Venue Discovery**: OpenStreetMap Nominatim geocoding and interactive Leaflet.js maps with custom pins.
- **Organizer Analytics**: Live turnouts, attendee roster search, and 1-click CSV report export.
- **Observability Audit Trail**: Security log stream recording actions, timestamps, and IP addresses.

---

## 🏗️ 3. System Architecture

```
   ┌────────────────────────────────────────────────────────┐
   │            Client Browser (Desktop & Mobile)           │
   │  React 18 / Native Modern JS • Leaflet Map • QRCode.js │
   └───────────────────────────┬────────────────────────────┘
                               │ HTTP REST JSON
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │          Python 3 REST Server (ThreadingHTTPServer)     │
   │      Zero external pip dependencies • High throughput  │
   └─────────────┬───────────────────────────┬──────────────┘
                 │                           │
                 ▼                           ▼
   ┌──────────────────────────┐   ┌──────────────────────────┐
   │  SQLite Relational DB    │   │ OpenStreetMap Nominatim  │
   │  • users                 │   │ (External Geocoding API) │
   │  • events                │   │ • Address validation     │
   │  • registrations         │   │ • Coordinates caching    │
   │  • checkins              │   │ • Rate-limit compliance  │
   │  • organizer_logs        │   └──────────────────────────┘
   └──────────────────────────┘
```

---

## 🗄️ 4. Database Schema & Constraints

The SQLite database (`eventhub.db`) strictly implements the 5 relational tables required by the Project 05 specification:

```sql
-- 1. Users Table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('organizer', 'operator', 'attendee')),
    phone TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Events Table
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organizer_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    venue_name TEXT NOT NULL,
    venue_address TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    date_time TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK(capacity > 0),
    ticket_price REAL DEFAULT 0.0,
    status TEXT DEFAULT 'published' CHECK(status IN ('draft', 'published', 'closed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Registrations Table (Enforces unique registration per user per event)
CREATE TABLE registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    ticket_token TEXT UNIQUE NOT NULL,
    qr_data TEXT NOT NULL,
    status TEXT DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'waitlisted', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, event_id)
);

-- 4. Checkins Table (Enforces single check-in per registration)
CREATE TABLE checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    registration_id INTEGER UNIQUE NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    operator_id INTEGER NOT NULL REFERENCES users(id),
    checkin_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'verified' CHECK(status IN ('verified', 'flagged')),
    notes TEXT
);

-- 5. Organizer Logs Table (Observability & Security Audit Trail)
CREATE TABLE organizer_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    ip_address TEXT DEFAULT '127.0.0.1',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🚀 5. Quickstart Guide

### Prerequisites
- Python 3.10 or higher
- Any modern web browser (Chrome, Safari, Edge, Firefox)

### 1. Clone the repository
```bash
git clone https://github.com/<your-username>/eventhub-portal.git
cd eventhub-portal
```

### 2. Run the automated test suite
```bash
python3 tests/test_api.py
```
*(All 10 unit tests pass in ~0.01 seconds)*

### 3. Start the application
```bash
python3 app.py
```
*(Or use `./run.sh`)*

Open your browser to:
👉 **`http://127.0.0.1:8080/`** (or `http://localhost:8080/`)

### 👥 Pre-Configured Demo Accounts
| Role | Email | Password | Primary Purpose |
|---|---|---|---|
| **Attendee** | `attendee@eventhub.io` | `pass123` | Browse events, register, view digital QR pass |
| **Gate Operator** | `operator@eventhub.io` | `pass123` | Real-time QR gate validation & duplicate rejection |
| **Organizer** | `organizer@eventhub.io` | `pass123` | Publish events, view turnout KPIs, export CSV roster |

---

## 🎤 6. Presentation & Viva Guide
A complete, word-for-word presentation script, slide-by-slide outline, and answers to the top 10 professor viva questions can be found in:
📄 **[PRESENTATION_GUIDE.md](PRESENTATION_GUIDE.md)**

---

## 📡 7. REST API Reference

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/login` | Authenticate user & get session token | No |
| `POST` | `/api/auth/register` | Register a new attendee or organizer | No |
| `POST` | `/api/auth/demo-switch` | Quick 1-click role switcher for presentations | No |
| `GET` | `/api/events` | List all events (optional `?category=` and `?search=`) | No |
| `GET` | `/api/events/:id` | Get event details with venue coordinates | No |
| `POST` | `/api/events` | Create new event with auto-geocoding | Organizer |
| `POST` | `/api/registrations` | Book a ticket (enforces capacity limits) | Attendee |
| `GET` | `/api/registrations/my` | Get all tickets for logged-in user | Attendee |
| `POST` | `/api/checkin/validate` | Validate QR/ticket token at gate | Operator / Organizer |
| `GET` | `/api/checkin/stats/:id` | Live gate turnout stats | Operator / Organizer |
| `GET` | `/api/organizer/dashboard` | Dashboard KPIs and audit trail | Organizer |
| `GET` | `/api/organizer/attendees/:id` | Attendee list for an event | Organizer |
| `GET` | `/api/organizer/export/:id` | Download attendees roster as `.csv` | Organizer |
| `GET` | `/api/external/geocode?q=` | Geocoding proxy to OpenStreetMap | No |

---

## 🧪 8. Automated Testing

The repository includes a comprehensive unit testing suite in `tests/test_api.py` covering:
- Database table creation and schema validation
- Initial event seeding
- Password hashing and authentication
- Unique ticket token generation (`EH-2026-XXXX-XXXX`)
- Duplicate registration prevention (`UNIQUE(user_id, event_id)`)
- Strict capacity constraint enforcement (blocking bookings when full)
- Gate check-in verification
- Duplicate check-in prevention (`UNIQUE(registration_id)`)
- Invalid/forged token rejection
- External OpenStreetMap Nominatim geocoding

Run tests anytime with:
```bash
python3 tests/test_api.py
```

---

## 💰 9. Cost Constraints & Acceptance Criteria

| Requirement from Specification | Status | Evidence |
|---|---|---|
| Total Project Cost: ₹0 | ✅ Compliant | Zero paid dependencies, open-source libraries |
| Event capacity cannot be exceeded | ✅ Verified | Unit test `test_06_capacity_limit_enforced` |
| Unique QR/token generated | ✅ Verified | Dynamic canvas QR + `EH-2026-XXXX-XXXX` tokens |
| Check-in operator validates only once | ✅ Verified | Unit test `test_08_duplicate_checkin_prevented` |
| Organizer monitors attendance | ✅ Verified | Real-time KPIs & attendee roster |
| External API integration | ✅ Verified | OpenStreetMap Nominatim address lookup |
| CSV attendee export | ✅ Verified | 1-click download in Organizer Hub |
| Observability & audit logs | ✅ Verified | `organizer_logs` table & live UI audit stream |

---

## 🤝 10. Contributing
Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on code style, tests, and pull request submissions.

---

## 📄 11. License
This project is open-source and licensed under the [MIT License](LICENSE).
