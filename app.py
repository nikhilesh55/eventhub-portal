#!/usr/bin/env python3
"""
EventHub - Event Booking & QR Check-In Portal
Project 05 | Industry Full-Stack Challenge
Run this file directly to launch the platform:
    python3 app.py
"""

import sys
import os
import socket

# Ensure backend modules can be imported
APP_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, APP_DIR)

from backend.db import init_db, seed_data, DB_PATH
from backend.auth import seed_default_sessions
from backend.server import run_server
from backend.logger import logger


def find_free_port(start_port: int = 8080, max_attempts: int = 15) -> int:
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start_port


def main():
    print("=" * 70)
    print("  🎟️  EventHub: Event Booking & QR Check-In Portal")
    print("  Industry Full-Stack Project Challenge · Technical Specification")
    print("=" * 70)

    # 1. Initialize SQLite Database
    print("[1/2] Initializing database & relational tables...")
    init_db()
    seed_data()
    seed_default_sessions()
    print(f"      Database ready at: {DB_PATH}")

    # 2. Start REST & Web Server
    port_env = os.environ.get("PORT")
    if port_env:
        port = int(port_env)
        logger.info(f"[STARTUP] Detected Render cloud PORT environment variable: {port}")
    else:
        port = find_free_port(8080)
        logger.info(f"[STARTUP] Running locally; selected port: {port}")

    print(f"[2/2] Starting REST API & Web Server on port {port}...")
    print(f"\n🚀 EventHub is LIVE!")
    print(f"   • Local Web Portal  : http://127.0.0.1:{port}/")
    print(f"   • Network Access    : http://localhost:{port}/")
    print(f"   • API Health/Events : http://127.0.0.1:{port}/api/events")
    print(f"\n💡 Demo Accounts Pre-configured:")
    print("   • Organizer : organizer@eventhub.io  (pass123)")
    print("   • Operator  : operator@eventhub.io   (pass123)")
    print("   • Attendee  : attendee@eventhub.io   (pass123)")
    print("=" * 70)

    run_server(host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
