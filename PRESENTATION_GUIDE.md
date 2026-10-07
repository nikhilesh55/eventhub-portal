# 🎤 EventHub: Complete Presentation & Viva Guide
> **Industry Full-Stack Project Challenge · Project 05: Event Booking & QR Check-In Portal**  
> Use this comprehensive guide to deliver a top-scoring classroom or viva presentation.

---

## ⏱️ 1. Presentation Structure & Timing Breakdown (8–10 Minutes)

| Section | Recommended Time | Core Objective |
|---|---|---|
| **1. Introduction & Problem Statement** | 1.5 minutes | Establish why spreadsheets fail and how EventHub solves it. |
| **2. Architecture & Tech Stack** | 1.5 minutes | Explain the full-stack design (React, Python REST, SQLite, OpenStreetMap). |
| **3. Live Demonstration (The "Showstopper")** | 4.0 minutes | Demonstrate all 3 roles: Booking ➔ QR Pass ➔ Gate Validation ➔ Organizer Hub. |
| **4. Database Schema & Relational Integrity** | 1.5 minutes | Highlight the 5 tables, foreign keys, and unique capacity constraints. |
| **5. Conclusion & Q&A / Viva Defense** | 1.5 minutes | Answer professor questions confidently with technical depth. |

---

## 📑 2. Slide-by-Slide Deck Outline & Speaker Script

### Slide 1: Title & Team Introduction
- **Slide Title**: EventHub — Event Booking & QR Check-In Portal
- **Subtitle**: Industry Full-Stack Project Challenge · Project 05
- **Speaker Script**:
  > *"Good morning respected professor and evaluators. Today, I am proud to present **EventHub**, an end-to-end full-stack event booking and QR check-in platform designed according to the Industry Full-Stack Project Challenge specification. Our mission with EventHub is to provide a complete, lightweight, zero-cost operational tool for campus hackathons, technical conferences, and workshops that guarantees strict capacity control and eliminates entrance gate bottlenecks using digital QR verification."*

---

### Slide 2: Problem Statement & Motivation
- **Slide Title**: The Problem with Small & Mid-Sized Events
- **Key Points**:
  - Manual spreadsheets cause over-booking beyond venue fire/safety limits.
  - Paper attendee lists create long entrance queues and allow ticket pass sharing.
  - Commercial ticketing platforms are expensive and charge high commissions.
  - Lack of real-time visibility into gate turnout and check-in velocity.
- **Speaker Script**:
  > *"When colleges or local tech communities organize hackathons or workshops, they typically face two extremes: either they manage attendees with Google Forms and spreadsheets, which causes over-capacity registrations and paper-based gate delays, or they have to pay high fees to commercial platforms. EventHub bridges this gap by providing an enterprise-grade operational workflow at zero budget: strict capacity enforcement, cryptographically unique QR passes, and real-time gate validation."*

---

### Slide 3: Target Users & Core Features
- **Slide Title**: Multi-Role Operational Ecosystem
- **Key Points**:
  - **Attendee**: Search events, inspect interactive venue maps, register with 1 click, and access digital boarding pass tickets.
  - **Check-In Operator**: High-speed entrance gate console, instant QR/token scan, visual verification, and duplicate check-in prevention.
  - **Organizer**: Live turnout dashboard, capacity management, attendee roster, CSV export, and security audit logs.
- **Speaker Script**:
  > *"EventHub addresses three distinct user roles. The attendee registers and receives a digital boarding pass with a scannable QR code. The gate operator uses our check-in console to validate tickets in less than a second, while the organizer monitors live attendance, exports CSV reports, and reviews system audit logs in real time."*

---

### Slide 4: System Architecture & Data Flow
- **Slide Title**: Modern Three-Tier Architecture
- **Diagram**:
  ```
  [ React 18 UI + Leaflet ] ──(HTTP REST JSON)──► [ Python 3 REST Backend ]
                                                          │
                       ┌──────────────────────────────────┴────────────────────────┐
                       ▼                                                           ▼
         [ SQLite Database (ACID) ]                               [ OpenStreetMap Nominatim ]
          • users & events                                         • Address geocoding
          • registrations & checkins                               • Live venue coordinates
          • organizer_logs (Audit)                                 • Leaflet map tile rendering
  ```
- **Speaker Script**:
  > *"Our architecture consists of three robust layers: On the frontend, we use React 18 with Tailwind CSS and Leaflet.js for responsive interaction and mapping. On the backend, we engineered a clean, multithreaded Python REST API with zero external dependencies. Data persistence is handled by a relational SQLite database with strict foreign keys and constraints. For location intelligence, we integrated the external OpenStreetMap Nominatim API to geocode venue addresses into interactive map pins."*

---

### Slide 5: Relational Database Schema & Business Logic
- **Slide Title**: Relational Database Design (`eventhub.db`)
- **Key Points**:
  1. `users`: Stores organizer, operator, and attendee credentials with SHA-256 salted password hashes.
  2. `events`: Stores title, description, venue, coordinates, date/time, and capacity.
  3. `registrations`: Enforces `UNIQUE(user_id, event_id)` to prevent double booking; generates unique `ticket_token`.
  4. `checkins`: Enforces `UNIQUE(registration_id)` so an attendee can never be checked in twice.
  5. `organizer_logs`: Provides complete observability and audit history of all critical state transitions.
- **Speaker Script**:
  > *"A critical requirement of our challenge was that business logic must be enforced at the database level rather than just in frontend memory. Our database enforces this through two key constraints: First, `UNIQUE(user_id, event_id)` prevents an attendee from registering twice for the same event. Second, `UNIQUE(registration_id)` on the checkins table guarantees that a ticket can only be checked in once. Any subsequent attempt to scan the same QR code is instantly rejected as a duplicate."*

---

### Slide 6: External API & Security Highlights
- **Slide Title**: OpenStreetMap Geocoding & Zero-Cost Compliance
- **Key Points**:
  - **External API**: OpenStreetMap Nominatim provides reverse and forward geocoding.
  - **Controlled Proxy**: Calls are made through our backend service with custom User-Agent headers and client caching to honor Nominatim usage policies.
  - **Interactive Maps**: Coordinates are rendered on interactive Leaflet maps.
  - **Cost Compliance**: Total operational cost is ₹0 — no paid APIs, no SMS/email costs, and no payment gateway commissions.
- **Speaker Script**:
  > *"To satisfy the external API requirement, we integrated OpenStreetMap Nominatim. When an organizer enters a venue address, our backend geocodes it into latitude and longitude coordinates with caching, and displays an interactive map directly on the event card. Furthermore, we achieved 100% compliance with the ₹0 cost constraint by using open-source algorithms for QR generation and client-side audio synthesis."*

---

## 💻 3. Live Demonstration Walkthrough (Step-by-Step)

Follow this exact sequence during your live presentation for maximum impact:

### Step 1: Open the Application
1. In your browser, open: `http://127.0.0.1:8080/`.
2. Point out the clean UI:
   > *"Notice the modern navigation bar with our active demo role switcher in the top right. Currently, we are browsing as Attendee David Chen."*

### Step 2: Browse Events & Interactive Map
1. Click on category filters (*Technology*, *Workshop*, etc.) to show dynamic client-side filtering.
2. Click on **"View Venue Map"** on the first event (*TechInnovate 2026 Summit*).
3. Show the interactive Leaflet map:
   > *"Here you can see the venue location dynamically rendered using OpenStreetMap Nominatim coordinates."*

### Step 3: Register for an Event
1. Click **"Book Ticket"** on *NextGen Web & React Architecture Workshop*.
2. Show the toast notification and immediate redirection to **"My Tickets"**:
   > *"The booking is confirmed. Notice how our system automatically generated a digital boarding pass pass with a unique cryptographic ticket token and a high-resolution canvas QR code."*

### Step 4: The Entrance Gate Test (The "Wow" Moment)
1. Use the top-right switcher to switch to **"Gate Operator"** (or click the **"⚡ Test Scan Gate"** button on the ticket).
2. The gate console opens with live turnout statistics.
3. Click the pre-configured button: **"🟢 Valid Ticket (David Chen)"** or paste the ticket token.
4. Hit **Verify**:
   - The screen flashes a large **Green "VERIFIED & ADMITTED"** card.
   - An audio verification chime plays.
   - The attendee name, event title, and gate entry time appear in the Gate Activity Feed.
   > *"The ticket is validated, recorded in the SQLite checkins table, and David Chen is admitted."*

### Step 5: Duplicate Scan Prevention (Critical Demonstration)
1. Immediately click **"Verify"** again with the exact same ticket token.
2. The screen instantly turns **Yellow "ALREADY CHECKED IN"**:
   - Displays: *"Attendee already checked in at [Time] by Operator Alex Rivera."*
   - Plays a warning tone.
   > *"Notice how the system rejects duplicate scans. Even if someone took a screenshot of a friend's QR code, our database unique constraint prevents fraudulent duplicate entries."*

### Step 6: Fake / Invalid Token Rejection
1. Click **"🔴 Invalid Token (Fake Pass)"** and click **Verify**.
2. The screen flashes **Red "INVALID_TOKEN"**:
   > *"Arbitrary or forged QR codes are immediately flagged and rejected."*

### Step 7: Organizer Hub, Analytics & CSV Export
1. Switch to **"Organizer"** role via the top header.
2. Show the 4 KPI cards: Published Events, Total Registrations, Total Checked In, Turnout %.
3. Click **"Attendees"** to view the live roster showing who is checked in and who is pending.
4. Click **"CSV 📥"** to demonstrate instant download of the attendee report.
5. Scroll down to show the **Observability & Audit Trail (`organizer_logs`)**:
   > *"Every single event creation, registration, and check-in action is permanently recorded in our audit trail with timestamps and IP addresses for full observability."*

---

## ❓ 4. Top 10 Viva & Professor Questions (With Model Answers)

### Q1: Why did you choose Project 05 (EventHub) from the Google Drive list?
**Answer**:
> *"We selected Project 05 because it represents a complete, real-world operational workflow that can be proven end-to-end. It features multi-role permissions (Attendee, Organizer, Gate Operator), complex relational constraints, scannable QR verification, live external mapping, and security auditing, while remaining intuitive and impressive during a live demonstration."*

---

### Q2: How is the event capacity limit enforced? Can two users register at the same time and exceed capacity?
**Answer**:
> *"Capacity enforcement is handled atomically on the backend in `backend/db.py`. Before inserting a registration, our query checks `COUNT(*) FROM registrations WHERE event_id = ? AND status = 'confirmed'`. If this count equals or exceeds the event's `capacity` column, the backend immediately rejects the request with HTTP 400. In addition, SQLite transactions ensure ACID compliance so concurrent requests are serialized safely."*

---

### Q3: How do you prevent an attendee from checking in twice with the same ticket?
**Answer**:
> *"We enforce this using a relational database constraint on the `checkins` table. The `registration_id` column has a strict `UNIQUE` constraint. When the gate operator scans a token, the backend queries if that `registration_id` already exists in `checkins`. If it does, the server returns an `ALREADY_CHECKED_IN` status code (HTTP 409) along with the original check-in timestamp and operator identity, completely preventing double entry."*

---

### Q4: What external API did you integrate, and how does your backend interact with it?
**Answer**:
> *"We integrated the **OpenStreetMap Nominatim Geocoding API**. Instead of exposing API calls directly in the browser, our backend proxies the request through `backend/external.py` with custom User-Agent identification and an in-memory caching layer (`GEOCODE_CACHE`). This retrieves the venue's latitude and longitude, which are then rendered on an interactive Leaflet.js map with a customized location pin."*

---

### Q5: Why did you split the database into 5 separate tables?
**Answer**:
> *"Our database is normalized up to 3rd Normal Form (3NF) to avoid redundancy and anomalies:
> 1. `users`: Stores entity credentials independently of event roles.
> 2. `events`: Stores event metadata and venue details.
> 3. `registrations`: Acts as a junction table between `users` and `events` with a composite unique constraint `UNIQUE(user_id, event_id)`.
> 4. `checkins`: Captures the gate validation event with operator attribution and unique ticket link.
> 5. `organizer_logs`: Decouples audit observability from business transactions so system activity can be inspected without mutating business records."*

---

### Q6: What is the format of your ticket token, and how is the QR code generated?
**Answer**:
> *"Each ticket token is generated using the pattern `EH-{YEAR}-{RANDOM_SALT}-{CHECKSUM}`, for example `EH-2026-T84A-9102`. The QR code itself is rendered dynamically on the client using HTML5 Canvas via `QRCode.js`. The QR payload contains a JSON string encoding the token, event ID, attendee name, and timestamp."*

---

### Q7: How does your authentication and role-based access control (RBAC) work?
**Answer**:
> *"User passwords are encrypted using SHA-256 with a static salt before storage. Upon successful login, the server issues a Bearer session token stored in memory (`SESSIONS`). On protected routes—such as creating events (Organizer only) or validating check-ins (Operator or Organizer)—the backend extracts the token from the `Authorization` header, verifies the user's role, and returns HTTP 403 Forbidden if permissions are insufficient."*

---

### Q8: How did you satisfy the ₹0 budget constraint?
**Answer**:
> *"Every component of EventHub was selected to incur zero cost:
> 1. SQLite is serverless, open-source, and free.
> 2. OpenStreetMap Nominatim is a free, public geocoding API.
> 3. QR codes are generated directly in the browser using client-side canvas.
> 4. Audio verification chimes use the browser's native Web Audio API synthesis rather than external media files.
> 5. Tickets simulate pricing without requiring paid payment gateway subscriptions."*

---

### Q9: What happens if the external geocoding API is down or the network is offline?
**Answer**:
> *"Our backend includes a smart fallback mechanism in `backend/external.py`. If OpenStreetMap Nominatim is unreachable or times out, the backend checks our local cache of known venue addresses. If the address is unknown, it supplies default regional coordinates, logs the event, and allows event creation to proceed smoothly without blocking the user."*

---

### Q10: What automated testing did you perform to verify the application?
**Answer**:
> *"We implemented a comprehensive automated unit test suite in `tests/test_api.py` with 10 unit tests. It programmatically verifies table creation, seeding, authentication, token generation, duplicate registration rejection, capacity limit enforcement, valid check-in, duplicate check-in rejection, fake token rejection, and OpenStreetMap geocoding. All 10 tests run and pass in under 0.01 seconds."*
