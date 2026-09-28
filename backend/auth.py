"""
EventHub - Authentication & Session Layer
Handles user login, registration, role checks, and Bearer token simulation.
"""

import time
import hashlib
import json
from typing import Optional, Dict, Any
from .db import get_db_connection, hash_password

# In-memory session store: token -> user_dict
SESSIONS: Dict[str, Dict[str, Any]] = {}


def generate_token(user_id: int, role: str) -> str:
    raw = f"{user_id}:{role}:{time.time()}:eventhub_secret"
    token = hashlib.sha256(raw.encode()).hexdigest()[:32]
    return f"eh_sec_{token}"


def create_session(user: Dict[str, Any]) -> str:
    token = generate_token(user["id"], user["role"])
    SESSIONS[token] = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "created_at": time.time()
    }
    return token


def get_user_from_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    token = token.replace("Bearer ", "").strip()
    return SESSIONS.get(token)


def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, email, password_hash, role
        FROM users
        WHERE email = ?
    """, (email.strip().lower(),))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return None

    if user["password_hash"] == hash_password(password):
        return {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"]
        }
    return None


def register_user(name: str, email: str, password: str, role: str = "attendee", phone: str = "") -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO users (name, email, password_hash, role, phone)
            VALUES (?, ?, ?, ?, ?)
        """, (name.strip(), email.strip().lower(), hash_password(password), role, phone.strip()))
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return {
            "id": user_id,
            "name": name,
            "email": email.strip().lower(),
            "role": role
        }
    except Exception:
        conn.close()
        return None


def seed_default_sessions():
    """Pre-create active sessions for standard demo accounts so user can switch roles in 1 click."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, role FROM users")
    users = cursor.fetchall()
    conn.close()

    tokens = {}
    for u in users:
        role = u["role"]
        # predictable tokens for demo ease
        demo_token = f"demo_{role}_token"
        SESSIONS[demo_token] = {
            "id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "role": u["role"],
            "created_at": time.time()
        }
        tokens[role] = demo_token
    return tokens
