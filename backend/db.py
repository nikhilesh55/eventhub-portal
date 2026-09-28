"""
EventHub - Database Layer (SQLite)
Implements all required entities: users, events, registrations, checkins, organizer_logs.
Enforces unique registration per user/event, capacity constraints, and relational integrity.
"""

import sqlite3
import os
import hashlib
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "eventhub.db")


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def hash_password(password: str) -> str:
    """Hash password using SHA-256 with a static salt for educational simplicity."""
    salt = "eventhub_salt_2026"
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()


def init_db():
    """Create all required tables and indexes."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('organizer', 'operator', 'attendee')),
        phone TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Events Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
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
    """)

    # 3. Registrations Table (Enforces unique registration per user per event)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        ticket_token TEXT UNIQUE NOT NULL,
        qr_data TEXT NOT NULL,
        status TEXT DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'waitlisted', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, event_id)
    );
    """)

    # 4. Checkins Table (Enforces single check-in per registration)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        registration_id INTEGER UNIQUE NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        operator_id INTEGER NOT NULL REFERENCES users(id),
        checkin_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'verified' CHECK(status IN ('verified', 'flagged')),
        notes TEXT
    );
    """)

    # 5. Organizer Logs Table (Observability & Audit Trail)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS organizer_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        ip_address TEXT DEFAULT '127.0.0.1',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Performance & Lookup Indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_registrations_token ON registrations(ticket_token);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_checkins_event ON checkins(event_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_event ON organizer_logs(event_id);")

    conn.commit()
    conn.close()


def log_organizer_action(action: str, details: str, event_id: Optional[int] = None, user_id: Optional[int] = None):
    """Record an audit trail event for observability."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO organizer_logs (event_id, user_id, action, details)
        VALUES (?, ?, ?, ?)
    """, (event_id, user_id, action, details))
    conn.commit()
    conn.close()


def seed_data():
    """Seed initial users, events, and sample registrations for instant live demonstration."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if users already seeded
    cursor.execute("SELECT COUNT(*) FROM users;")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    # Seed Default Users for each role
    users = [
        ("Sarah Jenkins", "organizer@eventhub.io", hash_password("pass123"), "organizer", "+1 555-0101"),
        ("Alex Rivera", "operator@eventhub.io", hash_password("pass123"), "operator", "+1 555-0102"),
        ("David Chen", "attendee@eventhub.io", hash_password("pass123"), "attendee", "+1 555-0103"),
        ("Elena Rostova", "elena@example.com", hash_password("pass123"), "attendee", "+1 555-0104"),
        ("Marcus Vance", "marcus@example.com", hash_password("pass123"), "attendee", "+1 555-0105"),
        ("Priya Sharma", "priya@example.com", hash_password("pass123"), "attendee", "+1 555-0106"),
    ]

    cursor.executemany("""
        INSERT INTO users (name, email, password_hash, role, phone)
        VALUES (?, ?, ?, ?, ?)
    """, users)
    conn.commit()

    organizer_id = 1
    operator_id = 2

    # Dates
    now = datetime.now()
    d1 = (now + timedelta(days=2)).strftime("%Y-%m-%d 10:00")
    d2 = (now + timedelta(days=5)).strftime("%Y-%m-%d 14:30")
    d3 = (now + timedelta(days=12)).strftime("%Y-%m-%d 09:00")
    d4 = (now + timedelta(days=20)).strftime("%Y-%m-%d 18:00")

    events = [
        (
            organizer_id,
            "TechInnovate 2026 Summit & Hackathon",
            "Technology",
            "A high-impact 2-day conference gathering top software engineers, AI researchers, and startup founders to discuss next-gen cloud architectures, open source, and autonomous systems.",
            "Grand Innovation Hall, Silicon Tower",
            "100 Innovation Way, San Francisco, CA 94105",
            37.7891,
            -122.4014,
            d1,
            30,
            0.0,
            "published"
        ),
        (
            organizer_id,
            "NextGen Web & React Architecture Workshop",
            "Workshop",
            "Hands-on masterclass building full-stack reactive applications, offline-first sync protocols, high-performance UI state management, and real-time event streaming.",
            "Metropolis Tech Hub, Hall B",
            "500 Howard Street, San Francisco, CA 94105",
            37.7884,
            -122.3980,
            d2,
            20,
            25.0,
            "published"
        ),
        (
            organizer_id,
            "Future Design & Creative Coding Fest",
            "Cultural",
            "Interactive digital art exhibitions, generative sound design, and live creative coding showdowns with leading designers and media artists.",
            "Center for the Arts Gallery",
            "701 Mission Street, San Francisco, CA 94103",
            37.7858,
            -122.4034,
            d3,
            40,
            15.0,
            "published"
        ),
        (
            organizer_id,
            "AI Startup Founder & Investor Mixer",
            "Career",
            "Exclusive networking evening connecting venture capital partners, angel syndicates, and seed-stage AI founders building production agents.",
            "Skyline Terrace & Lounge",
            "555 California Street, San Francisco, CA 94104",
            37.7925,
            -122.4039,
            d4,
            15,
            50.0,
            "published"
        )
    ]

    cursor.executemany("""
        INSERT INTO events (
            organizer_id, title, category, description, venue_name, venue_address,
            latitude, longitude, date_time, capacity, ticket_price, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, events)
    conn.commit()

    # Seed Registrations for Event 1
    sample_registrations = [
        (3, 1, "EH-2026-T84A-9102", json.dumps({"token": "EH-2026-T84A-9102", "eventId": 1, "userId": 3, "name": "David Chen"}), "confirmed"),
        (4, 1, "EH-2026-K19F-4418", json.dumps({"token": "EH-2026-K19F-4418", "eventId": 1, "userId": 4, "name": "Elena Rostova"}), "confirmed"),
        (5, 1, "EH-2026-M72X-8831", json.dumps({"token": "EH-2026-M72X-8831", "eventId": 1, "userId": 5, "name": "Marcus Vance"}), "confirmed"),
        (6, 1, "EH-2026-P33R-1590", json.dumps({"token": "EH-2026-P33R-1590", "eventId": 1, "userId": 6, "name": "Priya Sharma"}), "confirmed"),
        (3, 2, "EH-2026-W55Q-7264", json.dumps({"token": "EH-2026-W55Q-7264", "eventId": 2, "userId": 3, "name": "David Chen"}), "confirmed"),
    ]

    cursor.executemany("""
        INSERT INTO registrations (user_id, event_id, ticket_token, qr_data, status)
        VALUES (?, ?, ?, ?, ?)
    """, sample_registrations)
    conn.commit()

    # Seed 1 initial check-in (Elena Rostova is already checked in for demonstration)
    cursor.execute("""
        INSERT INTO checkins (registration_id, event_id, operator_id, checkin_time, status, notes)
        VALUES (2, 1, ?, datetime('now', '-30 minutes'), 'verified', 'Early VIP check-in verified')
    """, (operator_id,))
    conn.commit()

    # Seed Initial Logs
    logs = [
        (1, 1, "EVENT_CREATED", "Event 'TechInnovate 2026 Summit' published with capacity 30"),
        (2, 1, "EVENT_CREATED", "Event 'NextGen Web & React Architecture' published with capacity 20"),
        (1, 3, "ATTENDEE_REGISTERED", "David Chen registered for TechInnovate 2026 Summit"),
        (1, 4, "ATTENDEE_REGISTERED", "Elena Rostova registered for TechInnovate 2026 Summit"),
        (1, 2, "ATTENDEE_CHECKED_IN", "Elena Rostova checked in by Operator Alex Rivera"),
    ]

    cursor.executemany("""
        INSERT INTO organizer_logs (event_id, user_id, action, details)
        VALUES (?, ?, ?, ?)
    """, logs)
    conn.commit()
    conn.close()


# ==========================================================
# Query & Mutation Helpers
# ==========================================================

def get_all_events(category: Optional[str] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
        SELECT e.*, u.name as organizer_name,
               COUNT(DISTINCT r.id) as registered_count,
               COUNT(DISTINCT c.id) as checked_in_count
        FROM events e
        JOIN users u ON e.organizer_id = u.id
        LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'confirmed'
        LEFT JOIN checkins c ON e.id = c.event_id
        WHERE 1=1
    """
    params = []

    if category and category.lower() != "all":
        query += " AND LOWER(e.category) = LOWER(?)"
        params.append(category)

    if search:
        query += " AND (LOWER(e.title) LIKE LOWER(?) OR LOWER(e.description) LIKE LOWER(?) OR LOWER(e.venue_name) LIKE LOWER(?))"
        params.append(f"%{search}%")

    query += " GROUP BY e.id ORDER BY e.date_time ASC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    events = [dict(row) for row in rows]
    conn.close()
    return events


def get_event_by_id(event_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT e.*, u.name as organizer_name, u.email as organizer_email,
               COUNT(DISTINCT r.id) as registered_count,
               COUNT(DISTINCT c.id) as checked_in_count
        FROM events e
        JOIN users u ON e.organizer_id = u.id
        LEFT JOIN registrations r ON e.id = r.event_id AND r.status = 'confirmed'
        LEFT JOIN checkins c ON e.id = c.event_id
        WHERE e.id = ?
        GROUP BY e.id
    """, (event_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_event(data: Dict[str, Any], organizer_id: int) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO events (
            organizer_id, title, category, description, venue_name, venue_address,
            latitude, longitude, date_time, capacity, ticket_price, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        organizer_id,
        data["title"],
        data.get("category", "General"),
        data["description"],
        data["venue_name"],
        data["venue_address"],
        data.get("latitude", 37.7749),
        data.get("longitude", -122.4194),
        data["date_time"],
        int(data["capacity"]),
        float(data.get("ticket_price", 0.0)),
        data.get("status", "published")
    ))
    event_id = cursor.lastrowid
    conn.commit()

    # Log action
    log_organizer_action(
        "EVENT_CREATED",
        f"Event '{data['title']}' created with capacity {data['capacity']}",
        event_id=event_id,
        user_id=organizer_id
    )

    conn.close()
    return get_event_by_id(event_id)


def update_event_status(event_id: int, status: str, organizer_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE events SET status = ? WHERE id = ?", (status, event_id))
    affected = cursor.rowcount
    conn.commit()
    if affected > 0:
        log_organizer_action("EVENT_UPDATED", f"Event status updated to '{status}'", event_id=event_id, user_id=organizer_id)
    conn.close()
    return affected > 0


def register_attendee(event_id: int, user_id: int) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Registers attendee enforcing capacity constraints and single registration uniqueness.
    Returns: (success: bool, message: str, registration_data: dict)
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check event exists & get capacity
    cursor.execute("SELECT title, capacity, status FROM events WHERE id = ?", (event_id,))
    event = cursor.fetchone()
    if not event:
        conn.close()
        return False, "Event does not exist.", None

    if event["status"] == "closed":
        conn.close()
        return False, "Registration is closed for this event.", None

    # Check capacity limit
    cursor.execute("SELECT COUNT(*) FROM registrations WHERE event_id = ? AND status = 'confirmed'", (event_id,))
    current_count = cursor.fetchone()[0]
    if current_count >= event["capacity"]:
        conn.close()
        return False, f"Event has reached maximum capacity ({event['capacity']} attendees).", None

    # Check already registered
    cursor.execute("SELECT id, ticket_token, status FROM registrations WHERE event_id = ? AND user_id = ?", (event_id, user_id))
    existing = cursor.fetchone()
    if existing:
        conn.close()
        if existing["status"] == "confirmed":
            return False, "You have already registered for this event.", None
        elif existing["status"] == "cancelled":
            # Re-activate registration
            token = existing["ticket_token"]
            cursor = get_db_connection().cursor()
            cursor.execute("UPDATE registrations SET status = 'confirmed' WHERE id = ?", (existing["id"],))
            conn.commit()
            return True, "Registration re-activated successfully!", {"id": existing["id"], "ticket_token": token}

    # Generate unique ticket token: EH-{YEAR}-{RANDOM_HEX}-{CHECKSUM}
    import random
    salt = "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=8))
    ticket_token = f"EH-2026-{salt[:4]}-{salt[4:]}"

    # Get user name
    cursor.execute("SELECT name, email FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    user_name = user["name"] if user else "Attendee"

    qr_payload = {
        "token": ticket_token,
        "eventId": event_id,
        "eventTitle": event["title"],
        "userId": user_id,
        "attendeeName": user_name,
        "registeredAt": datetime.now().isoformat()
    }

    try:
        cursor.execute("""
            INSERT INTO registrations (user_id, event_id, ticket_token, qr_data, status)
            VALUES (?, ?, ?, ?, 'confirmed')
        """, (user_id, event_id, ticket_token, json.dumps(qr_payload)))
        reg_id = cursor.lastrowid
        conn.commit()

        # Observability Log
        log_organizer_action(
            "ATTENDEE_REGISTERED",
            f"Attendee '{user_name}' registered with Token {ticket_token}",
            event_id=event_id,
            user_id=user_id
        )

        reg_data = {
            "id": reg_id,
            "event_id": event_id,
            "event_title": event["title"],
            "user_id": user_id,
            "user_name": user_name,
            "ticket_token": ticket_token,
            "qr_data": json.dumps(qr_payload),
            "status": "confirmed",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        conn.close()
        return True, "Ticket confirmed successfully!", reg_data
    except sqlite3.IntegrityError as e:
        conn.close()
        return False, f"Registration conflict: {str(e)}", None


def validate_checkin(token: str, operator_id: int, target_event_id: Optional[int] = None) -> Tuple[str, str, Optional[Dict[str, Any]]]:
    """
    Validates attendee ticket token at the entrance.
    Returns: (code: 'SUCCESS' | 'ALREADY_CHECKED_IN' | 'INVALID_TOKEN' | 'EVENT_MISMATCH', message: str, details: dict)
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Find registration by token
    cursor.execute("""
        SELECT r.id as reg_id, r.user_id, r.event_id, r.ticket_token, r.status as reg_status,
               u.name as attendee_name, u.email as attendee_email,
               e.title as event_title, e.date_time, e.venue_name
        FROM registrations r
        JOIN users u ON r.user_id = u.id
        JOIN events e ON r.event_id = e.id
        WHERE r.ticket_token = ?
    """, (token.strip(),))
    reg = cursor.fetchone()

    if not reg:
        conn.close()
        return "INVALID_TOKEN", "Ticket token not found in the registration system.", None

    if reg["reg_status"] != "confirmed":
        conn.close()
        return "INVALID_TOKEN", f"This ticket has status '{reg['reg_status']}' and is not valid.", None

    # Check event match if operator has selected an active event
    if target_event_id and reg["event_id"] != target_event_id:
        conn.close()
        return "EVENT_MISMATCH", f"This ticket is for '{reg['event_title']}', not the currently selected event.", {
            "ticket_event": reg["event_title"],
            "attendee_name": reg["attendee_name"]
        }

    # Check if already checked in
    cursor.execute("""
        SELECT c.id, c.checkin_time, u.name as operator_name
        FROM checkins c
        JOIN users u ON c.operator_id = u.id
        WHERE c.registration_id = ?
    """, (reg["reg_id"],))
    existing_checkin = cursor.fetchone()

    if existing_checkin:
        conn.close()
        return "ALREADY_CHECKED_IN", f"Attendee already checked in at {existing_checkin['checkin_time']} by {existing_checkin['operator_name']}.", {
            "attendee_name": reg["attendee_name"],
            "ticket_token": reg["ticket_token"],
            "event_title": reg["event_title"],
            "previous_checkin_time": existing_checkin["checkin_time"],
            "operator_name": existing_checkin["operator_name"]
        }

    # Perform check-in
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
        INSERT INTO checkins (registration_id, event_id, operator_id, checkin_time, status, notes)
        VALUES (?, ?, ?, ?, 'verified', 'Gate QR Scan Validated')
    """, (reg["reg_id"], reg["event_id"], operator_id, now_str))
    conn.commit()

    # Log action
    log_organizer_action(
        "ATTENDEE_CHECKED_IN",
        f"Attendee '{reg['attendee_name']}' successfully checked in (Token {token})",
        event_id=reg["event_id"],
        user_id=operator_id
    )

    result_data = {
        "attendee_name": reg["attendee_name"],
        "attendee_email": reg["attendee_email"],
        "ticket_token": reg["ticket_token"],
        "event_title": reg["event_title"],
        "venue_name": reg["venue_name"],
        "checkin_time": now_str,
        "status": "verified"
    }

    conn.close()
    return "SUCCESS", f"Welcome, {reg['attendee_name']}! Ticket verified.", result_data


def get_user_registrations(user_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.*, e.title as event_title, e.category, e.date_time, e.venue_name, e.venue_address,
               e.ticket_price, c.checkin_time
        FROM registrations r
        JOIN events e ON r.event_id = e.id
        LEFT JOIN checkins c ON r.id = c.registration_id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_event_attendees(event_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.id as registration_id, r.ticket_token, r.created_at as registered_at, r.status as reg_status,
               u.id as user_id, u.name as attendee_name, u.email as attendee_email, u.phone,
               c.checkin_time,
               CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END as is_checked_in
        FROM registrations r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN checkins c ON r.id = c.registration_id
        WHERE r.event_id = ?
        ORDER BY r.created_at ASC
    """, (event_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_organizer_metrics(organizer_id: Optional[int] = None) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM events")
    total_events = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM registrations WHERE status = 'confirmed'")
    total_registrations = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM checkins")
    total_checked_in = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'attendee'")
    total_attendees = cursor.fetchone()[0]

    checkin_rate = round((total_checked_in / total_registrations * 100), 1) if total_registrations > 0 else 0.0

    # Recent Audit Logs
    cursor.execute("""
        SELECT l.*, e.title as event_title, u.name as user_name
        FROM organizer_logs l
        LEFT JOIN events e ON l.event_id = e.id
        LEFT JOIN users u ON l.user_id = u.id
        ORDER BY l.timestamp DESC LIMIT 15
    """)
    recent_logs = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return {
        "total_events": total_events,
        "total_registrations": total_registrations,
        "total_checked_in": total_checked_in,
        "total_attendees": total_attendees,
        "checkin_rate": checkin_rate,
        "recent_logs": recent_logs
    }
