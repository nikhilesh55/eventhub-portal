"""
EventHub - REST API Server
Built using Python 3 ThreadingHTTPServer with zero external dependencies.
Serves both REST endpoints and frontend single-page application.
"""

import os
import json
import mimetypes
import re
from http.server import HTTPServer, ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from typing import Dict, Any, Optional

from .db import (
    get_all_events,
    get_event_by_id,
    create_event,
    update_event_status,
    register_attendee,
    validate_checkin,
    get_user_registrations,
    get_event_attendees,
    get_organizer_metrics,
    log_organizer_action
)
from .auth import (
    authenticate_user,
    register_user,
    create_session,
    get_user_from_token,
    seed_default_sessions,
    SESSIONS
)
from .external import geocode_address

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")


class EventHubAPIHandler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def _set_headers(self, status_code: int = 200, content_type: str = "application/json"):
        self.send_response(status_code)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()

    def _send_json(self, data: Any, status_code: int = 200):
        self._set_headers(status_code=status_code, content_type="application/json")
        body = json.dumps(data, indent=2).encode("utf-8")
        self.wfile.write(body)

    def _send_error(self, message: str, status_code: int = 400):
        self._send_json({"error": message, "success": False}, status_code=status_code)

    def _read_body_json(self) -> Dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        raw = self.rfile.read(content_length).decode("utf-8")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def _get_current_user(self) -> Optional[Dict[str, Any]]:
        auth_header = self.headers.get("Authorization", "")
        return get_user_from_token(auth_header)

    def do_OPTIONS(self):
        self._set_headers(204)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # Static assets routing: if not /api, delegate to SimpleHTTPRequestHandler
        if not path.startswith("/api/"):
            # If path is root or HTML5 route, serve index.html
            if path in ["", "/", "/events", "/my-tickets", "/organizer", "/checkin"]:
                self.path = "/index.html"
            return super().do_GET()

        # ==========================================================
        # REST API Routes (GET)
        # ==========================================================

        # 1. Current Authenticated User Info
        if path == "/api/auth/me":
            user = self._get_current_user()
            if not user:
                return self._send_error("Unauthenticated", 401)
            return self._send_json({"success": True, "user": user})

        # 2. Get All Events (with optional category & search filter)
        elif path == "/api/events":
            category = query.get("category", [None])[0]
            search = query.get("search", [None])[0]
            events = get_all_events(category=category, search=search)
            return self._send_json({"success": True, "count": len(events), "events": events})

        # 3. Get Single Event Details
        elif re.match(r"^/api/events/(\d+)$", path):
            event_id = int(re.match(r"^/api/events/(\d+)$", path).group(1))
            event = get_event_by_id(event_id)
            if not event:
                return self._send_error("Event not found", 404)
            return self._send_json({"success": True, "event": event})

        # 4. Get Current User's Registered Tickets
        elif path == "/api/registrations/my":
            user = self._get_current_user()
            if not user:
                return self._send_error("Please log in to view your tickets.", 401)
            registrations = get_user_registrations(user["id"])
            return self._send_json({"success": True, "registrations": registrations})

        # 5. Get Live Check-in Stats for an Event
        elif re.match(r"^/api/checkin/stats/(\d+)$", path):
            event_id = int(re.match(r"^/api/checkin/stats/(\d+)$", path).group(1))
            event = get_event_by_id(event_id)
            if not event:
                return self._send_error("Event not found", 404)
            return self._send_json({
                "success": True,
                "stats": {
                    "event_id": event["id"],
                    "event_title": event["title"],
                    "capacity": event["capacity"],
                    "registered_count": event["registered_count"],
                    "checked_in_count": event["checked_in_count"],
                    "attendance_rate": round((event["checked_in_count"] / event["registered_count"] * 100), 1) if event["registered_count"] > 0 else 0.0,
                    "remaining_spots": max(0, event["capacity"] - event["registered_count"])
                }
            })

        # 6. Organizer Dashboard KPIs & Audit Logs
        elif path == "/api/organizer/dashboard":
            user = self._get_current_user()
            if not user or user["role"] not in ["organizer", "operator"]:
                return self._send_error("Access denied. Organizer or Operator role required.", 403)
            metrics = get_organizer_metrics(user["id"])
            return self._send_json({"success": True, "metrics": metrics})

        # 7. Organizer Attendees for Event
        elif re.match(r"^/api/organizer/attendees/(\d+)$", path):
            event_id = int(re.match(r"^/api/organizer/attendees/(\d+)$", path).group(1))
            user = self._get_current_user()
            if not user or user["role"] not in ["organizer", "operator"]:
                return self._send_error("Access denied.", 403)
            attendees = get_event_attendees(event_id)
            return self._send_json({"success": True, "attendees": attendees})

        # 8. CSV Export for Attendees (Stretch Requirement)
        elif re.match(r"^/api/organizer/export/(\d+)$", path):
            event_id = int(re.match(r"^/api/organizer/export/(\d+)$", path).group(1))
            event = get_event_by_id(event_id)
            if not event:
                return self._send_error("Event not found", 404)
            attendees = get_event_attendees(event_id)

            # Build CSV string
            csv_lines = ["Registration ID,Attendee Name,Email,Phone,Ticket Token,Registration Date,Checked In,Checkin Time"]
            for a in attendees:
                csv_lines.append(f'"{a["registration_id"]}","{a["attendee_name"]}","{a["attendee_email"]}","{a.get("phone") or ""}","{a["ticket_token"]}","{a["registered_at"]}","{"Yes" if a["is_checked_in"] else "No"}","{a.get("checkin_time") or ""}"')
            csv_data = "\n".join(csv_lines).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", f'attachment; filename="event_{event_id}_attendees.csv"')
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(csv_data)
            return

        # 9. External Geocoding Proxy (OpenStreetMap Nominatim)
        elif path == "/api/external/geocode":
            query_str = query.get("q", [""])[0]
            if not query_str:
                return self._send_error("Address query parameter 'q' is required.", 400)
            result = geocode_address(query_str)
            return self._send_json(result)

        # 10. Fallback for undefined API GET
        return self._send_error(f"Endpoint GET {path} not found", 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_body_json()

        # ==========================================================
        # REST API Routes (POST)
        # ==========================================================

        # 1. User Login
        if path == "/api/auth/login":
            email = body.get("email", "")
            password = body.get("password", "")
            user = authenticate_user(email, password)
            if not user:
                return self._send_error("Invalid email or password.", 401)
            token = create_session(user)
            return self._send_json({
                "success": True,
                "message": f"Welcome back, {user['name']}!",
                "token": token,
                "user": user
            })

        # 2. Demo Quick-Switch Role (Empowers painless 1-click viva presentation)
        elif path == "/api/auth/demo-switch":
            role = body.get("role", "attendee").lower()
            demo_tokens = seed_default_sessions()
            token = demo_tokens.get(role, "demo_attendee_token")
            user = SESSIONS.get(token)
            return self._send_json({
                "success": True,
                "message": f"Switched to demo role: {role.upper()}",
                "token": token,
                "user": user
            })

        # 3. User Registration
        elif path == "/api/auth/register":
            name = body.get("name")
            email = body.get("email")
            password = body.get("password")
            role = body.get("role", "attendee")
            phone = body.get("phone", "")

            if not name or not email or not password:
                return self._send_error("Name, email, and password are required.", 400)

            user = register_user(name, email, password, role, phone)
            if not user:
                return self._send_error("A user with this email already exists.", 409)

            token = create_session(user)
            return self._send_json({
                "success": True,
                "message": "Account created successfully!",
                "token": token,
                "user": user
            }, 201)

        # 4. Create New Event (Organizer Only)
        elif path == "/api/events":
            user = self._get_current_user()
            if not user or user["role"] not in ["organizer"]:
                return self._send_error("Unauthorized. Only Event Organizers can publish events.", 403)

            required_fields = ["title", "description", "venue_name", "venue_address", "date_time", "capacity"]
            for field in required_fields:
                if not body.get(field):
                    return self._send_error(f"Missing required field: '{field}'", 400)

            try:
                capacity = int(body["capacity"])
                if capacity <= 0:
                    return self._send_error("Event capacity must be greater than 0.", 400)
            except ValueError:
                return self._send_error("Capacity must be a positive integer.", 400)

            # Auto-geocode venue address if lat/lon not provided
            if not body.get("latitude") or not body.get("longitude"):
                geo = geocode_address(body["venue_address"])
                if geo["success"]:
                    body["latitude"] = geo["data"]["lat"]
                    body["longitude"] = geo["data"]["lon"]

            new_event = create_event(body, organizer_id=user["id"])
            return self._send_json({
                "success": True,
                "message": "Event published successfully!",
                "event": new_event
            }, 201)

        # 5. Register Attendee for Event
        elif path == "/api/registrations":
            user = self._get_current_user()
            if not user:
                return self._send_error("Please log in to register for an event.", 401)

            event_id = body.get("event_id")
            if not event_id:
                return self._send_error("Missing 'event_id' parameter.", 400)

            success, message, reg_data = register_attendee(int(event_id), user["id"])
            if not success:
                return self._send_error(message, 400)

            return self._send_json({
                "success": True,
                "message": message,
                "registration": reg_data
            }, 201)

        # 6. Validate Check-in Token (Operator & Organizer)
        elif path == "/api/checkin/validate":
            user = self._get_current_user()
            if not user or user["role"] not in ["operator", "organizer"]:
                return self._send_error("Unauthorized. Operator or Organizer role required to check-in attendees.", 403)

            token = body.get("token")
            event_id = body.get("event_id")
            if not token:
                return self._send_error("Ticket token or QR payload string is required.", 400)

            # If input is a raw JSON string from a QR code, extract the token field
            if token.strip().startswith("{") and "token" in token:
                try:
                    payload = json.loads(token)
                    token = payload.get("token", token)
                except Exception:
                    pass

            code, message, details = validate_checkin(
                token=token,
                operator_id=user["id"],
                target_event_id=int(event_id) if event_id else None
            )

            status_code = 200
            if code == "INVALID_TOKEN":
                status_code = 404
            elif code == "ALREADY_CHECKED_IN":
                status_code = 409
            elif code == "EVENT_MISMATCH":
                status_code = 400

            return self._send_json({
                "success": (code == "SUCCESS"),
                "status_code": code,
                "message": message,
                "details": details
            }, status_code)

        # 7. Update Event Status (e.g., Close/Reopen event)
        elif re.match(r"^/api/events/(\d+)/status$", path):
            event_id = int(re.match(r"^/api/events/(\d+)/status$", path).group(1))
            user = self._get_current_user()
            if not user or user["role"] != "organizer":
                return self._send_error("Unauthorized", 403)

            new_status = body.get("status", "closed")
            if new_status not in ["published", "closed", "draft"]:
                return self._send_error("Invalid status value.", 400)

            updated = update_event_status(event_id, new_status, user["id"])
            return self._send_json({"success": updated, "message": f"Event status set to '{new_status}'"})

        return self._send_error(f"Endpoint POST {path} not found", 404)


def run_server(host: str = "0.0.0.0", port: int = 8080):
    seed_default_sessions()
    server = ThreadingHTTPServer((host, port), EventHubAPIHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down EventHub server...")
        server.shutdown()
