"""
EventHub - Authentication & Session Layer
Handles user login, registration, role checks, and Bearer token simulation.
"""

import time
import hashlib
import json
from typing import Optional, Dict, Any
from .db import get_db_connection, hash_password
from .logger import logger

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
    logger.info(f"[AUTH] Active session established for user: {user['name']} (ID: {user['id']}, Role: {user['role']})")
    return token


def get_user_from_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    token = token.replace("Bearer ", "").strip()
    return SESSIONS.get(token)


def logout_user(token: Optional[str]) -> bool:
    """Invalidate an active session token."""
    if not token:
        return False
    clean_token = token.replace("Bearer ", "").strip()
    if clean_token in SESSIONS:
        user = SESSIONS.pop(clean_token, None)
        if user:
            logger.info(f"[AUTH] User {user['name']} (ID: {user['id']}, Role: {user['role']}) logged out successfully")
            return True
    return False


def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    clean_email = email.strip().lower()
    logger.info(f"[AUTH] Processing login attempt for email: {clean_email}")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, email, password_hash, role
        FROM users
        WHERE email = ?
    """, (clean_email,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        logger.warning(f"[AUTH] Login failed: User not found for email '{clean_email}'")
        return None

    if user["password_hash"] == hash_password(password):
        logger.info(f"[AUTH] Login successful: User '{user['name']}' verified (Role: {user['role']})")
        return {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"]
        }

    logger.warning(f"[AUTH] Login failed: Invalid password supplied for email '{clean_email}'")
    return None


def register_user(name: str, email: str, password: str, role: str = "attendee", phone: str = "") -> Optional[Dict[str, Any]]:
    clean_name = name.strip()
    clean_email = email.strip().lower()
    clean_role = role.strip().lower()
    logger.info(f"[AUTH] Processing new user registration for '{clean_name}' ({clean_email}) as {clean_role}")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO users (name, email, password_hash, role, phone)
            VALUES (?, ?, ?, ?, ?)
        """, (clean_name, clean_email, hash_password(password), clean_role, phone.strip()))
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        logger.info(f"[AUTH] User registered successfully: '{clean_name}' assigned ID #{user_id}")
        return {
            "id": user_id,
            "name": clean_name,
            "email": clean_email,
            "role": clean_role
        }
    except Exception as e:
        conn.close()
        logger.warning(f"[AUTH] Registration failed for email '{clean_email}': {str(e)}")
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
