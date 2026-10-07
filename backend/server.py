"""
EventHub - REST API Server
Built using Python 3 ThreadingHTTPServer with zero external dependencies.
Serves both REST endpoints and frontend single-page application.
Provides secure authentication, authorization, error handling, and structured logging.
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
    authenticate_or_register_google_user,
    parse_google_id_token,
    create_session,
    get_user_from_token,
    logout_user,
    seed_default_sessions,
    SESSIONS,
    generate_totp_secret,
    get_totp_uri,
    get_current_totp,
    verify_totp_code,
    get_user_2fa_status,
    enable_user_2fa,
    disable_user_2fa,
    get_user_by_id
)
from .external import geocode_address
from .logger import logger

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")


class EventHubAPIHandler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def log_message(self, format, *args):
        """Route standard HTTP server access logs to our structured logger."""
        logger.info(f"[HTTP] {self.address_string()} - {format % args}")

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _set_headers(self, status_code: int = 200, content_type: str = "application/json"):
        self.send_response(status_code)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def _send_json(self, data: Any, status_code: int = 200):
        self._set_headers(status_code=status_code, content_type="application/json")
        body = json.dumps(data, indent=2).encode("utf-8")
        self.wfile.write(body)

    def _send_error(self, message: str, status_code: int = 400):
        if status_code >= 500:
            logger.error(f"[API ERROR {status_code}] {message}")
        elif status_code in (401, 403):
            logger.warning(f"[API AUTH {status_code}] {message}")
        else:
            logger.warning(f"[API WARN {status_code}] {message}")
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

    def _get_current_user(self, query: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        auth_header = self.headers.get("Authorization", "")
        if not auth_header and query:
            auth_header = query.get("token", [""])[0]
        return get_user_from_token(auth_header)

    def do_OPTIONS(self):
        self._set_headers(204)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # Static assets routing: if not /api, delegate to SimpleHTTPRequestHandler
        if not path.startswith("/api/"):
            # If path is root or frontend route, serve index.html
            if path in ["", "/", "/events", "/my-tickets", "/organizer", "/checkin", "/login"]:
                self.path = "/index.html"
            return super().do_GET()

        try:
            # ==========================================================
            # REST API Routes (GET)
            # ==========================================================

            # 1. Current Authenticated User Info
            if path == "/api/auth/me":
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in.", 401)
                return self._send_json({"success": True, "user": user})

            # 2. Get All Events (Public: with optional category & search filter)
            elif path == "/api/events":
                category = query.get("category", [None])[0]
                search = query.get("search", [None])[0]
                events = get_all_events(category=category, search=search)
                return self._send_json({"success": True, "count": len(events), "events": events})

            # 3. Get Single Event Details (Public)
            elif re.match(r"^/api/events/(\d+)$", path):
                event_id = int(re.match(r"^/api/events/(\d+)$", path).group(1))
                event = get_event_by_id(event_id)
                if not event:
                    return self._send_error("Event not found", 404)
                return self._send_json({"success": True, "event": event})

            # 4. Get Current User's Registered Tickets (Protected: Authenticated Attendee/User)
            elif path == "/api/registrations/my":
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in to view your tickets.", 401)
                registrations = get_user_registrations(user["id"])
                return self._send_json({"success": True, "registrations": registrations})

            # 5. Get Live Check-in Stats for an Event (Protected: Operator or Organizer)
            elif re.match(r"^/api/checkin/stats/(\d+)$", path):
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in to view check-in stats.", 401)
                if user["role"] not in ["operator", "organizer"]:
                    return self._send_error("Access denied. Operator or Organizer role required.", 403)

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

            # 6. Organizer Dashboard KPIs & Audit Logs (Protected: Organizer or Operator)
            elif path == "/api/organizer/dashboard":
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in to view organizer dashboard.", 401)
                if user["role"] not in ["organizer", "operator"]:
                    return self._send_error("Access denied. Organizer or Operator role required.", 403)
                metrics = get_organizer_metrics(user["id"])
                return self._send_json({"success": True, "metrics": metrics})

            # 7. Organizer Attendees for Event (Protected: Organizer or Operator)
            elif re.match(r"^/api/organizer/attendees/(\d+)$", path):
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in.", 401)
                if user["role"] not in ["organizer", "operator"]:
                    return self._send_error("Access denied. Organizer or Operator role required.", 403)
                event_id = int(re.match(r"^/api/organizer/attendees/(\d+)$", path).group(1))
                attendees = get_event_attendees(event_id)
                return self._send_json({"success": True, "attendees": attendees})

            # 8. CSV Export for Attendees (Protected: Organizer or Operator)
            elif re.match(r"^/api/organizer/export/(\d+)$", path):
                user = self._get_current_user(query)
                if not user:
                    return self._send_error("Unauthenticated. Please log in.", 401)
                if user["role"] not in ["organizer", "operator"]:
                    return self._send_error("Access denied. Organizer or Operator role required.", 403)
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

                logger.info(f"[EXPORT] Generated attendee CSV for Event #{event_id} ('{event['title']}') requested by {user['name']}")
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

            # 10. Google Authenticator 2FA Status (Protected)
            elif path == "/api/auth/2fa/status":
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in.", 401)
                status = get_user_2fa_status(user["id"])
                return self._send_json({
                    "success": True,
                    "enabled": status["enabled"],
                    "has_secret": bool(status["secret"])
                })

            # 11. Fallback for undefined API GET
            return self._send_error(f"Endpoint GET {path} not found", 404)

        except Exception as e:
            logger.error(f"[SERVER] Unhandled exception processing GET {path}: {str(e)}", exc_info=True)
            return self._send_error("An unexpected server error occurred.", 500)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_body_json()

        try:
            # ==========================================================
            # REST API Routes (POST)
            # ==========================================================

            # 1. User Login (Authenticates credentials through backend)
            if path == "/api/auth/login":
                email = body.get("email", "")
                password = body.get("password", "")
                if not email or not password:
                    return self._send_error("Email and password are required.", 400)

                user = authenticate_user(email, password)
                if not user:
                    return self._send_error("Invalid email or password.", 401)

                if user.get("is_2fa_enabled"):
                    logger.info(f"[AUTH] 2FA verification required for user #{user['id']} ('{user['email']}')")
                    return self._send_json({
                        "success": True,
                        "requires_2fa": True,
                        "user_id": user["id"],
                        "email": user["email"],
                        "name": user["name"],
                        "role": user["role"],
                        "message": "Two-factor authentication required. Please enter code from Google Authenticator."
                    })

                token = create_session(user)
                return self._send_json({
                    "success": True,
                    "message": f"Welcome back, {user['name']}!",
                    "token": token,
                    "user": user
                })

            # 2. User Logout (Invalidates active session)
            elif path == "/api/auth/logout":
                auth_header = self.headers.get("Authorization", "")
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. No active session found.", 401)

                success = logout_user(auth_header)
                return self._send_json({
                    "success": True,
                    "message": "Logged out successfully"
                })

            # 3. Demo Quick-Switch Role (For rapid classroom viva presentations)
            elif path == "/api/auth/demo-switch":
                role = body.get("role", "attendee").lower()
                demo_tokens = seed_default_sessions()
                token = demo_tokens.get(role, "demo_attendee_token")
                user = SESSIONS.get(token)
                logger.info(f"[AUTH] Presentation quick-switch activated for demo role: '{role}'")
                return self._send_json({
                    "success": True,
                    "message": f"Switched to demo role: {role.upper()}",
                    "token": token,
                    "user": user
                })

            # 4. User Registration (Public account creation)
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

            # 5. Google OAuth Sign-In (Direct or via Google Identity Services)
            elif path == "/api/auth/google":
                email = body.get("email", "")
                name = body.get("name", "")
                google_id = body.get("sub", "") or body.get("google_id", "")
                avatar = body.get("picture", "") or body.get("avatar", "")
                role = body.get("role", "attendee")

                # If client passed raw Google JWT credential token, decode it
                credential = body.get("credential", "")
                if credential:
                    token_data = parse_google_id_token(credential)
                    if token_data:
                        email = token_data.get("email", email)
                        name = token_data.get("name", name)
                        google_id = token_data.get("sub", google_id)
                        avatar = token_data.get("picture", avatar)

                if not email:
                    return self._send_error("A valid email address is required for Google Sign-In.", 400)

                user = authenticate_or_register_google_user(email, name, google_id=google_id, avatar=avatar, role=role)
                if not user:
                    return self._send_error("Google authentication failed. Please try again.", 500)

                if user.get("is_2fa_enabled"):
                    logger.info(f"[AUTH] Google sign-in: 2FA verification required for user #{user['id']} ('{user['email']}')")
                    return self._send_json({
                        "success": True,
                        "requires_2fa": True,
                        "user_id": user["id"],
                        "email": user["email"],
                        "name": user["name"],
                        "role": user["role"],
                        "message": "Two-factor authentication required. Please enter code from Google Authenticator."
                    })

                token = create_session(user)
                return self._send_json({
                    "success": True,
                    "message": f"Welcome, {user['name']}! Signed in via Google.",
                    "token": token,
                    "user": user
                })

            # 6. Validate 2FA Google Authenticator Code during Login
            elif path == "/api/auth/2fa/validate-login":
                user_id = body.get("user_id")
                code = body.get("code")
                if not user_id or not code:
                    return self._send_error("User ID and 6-digit code are required.", 400)

                user = get_user_by_id(int(user_id))
                if not user or not user.get("is_2fa_enabled") or not user.get("totp_secret"):
                    return self._send_error("Two-factor authentication is not active for this account.", 400)

                if not verify_totp_code(user["totp_secret"], str(code)):
                    logger.warning(f"[AUTH] Invalid 2FA verification code entered for user #{user_id}")
                    return self._send_error("Invalid verification code. Please check your Google Authenticator app.", 401)

                token = create_session(user)
                logger.info(f"[AUTH] 2FA verification successful for user #{user_id} ('{user['email']}')")
                return self._send_json({
                    "success": True,
                    "message": f"Welcome back, {user['name']}! Two-factor verification verified.",
                    "token": token,
                    "user": user
                })

            # 7. Setup Google Authenticator 2FA (Protected: Authenticated User)
            elif path == "/api/auth/2fa/setup":
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in.", 401)

                secret = generate_totp_secret()
                uri = get_totp_uri(secret, user["email"])
                current_code = get_current_totp(secret)
                return self._send_json({
                    "success": True,
                    "secret": secret,
                    "uri": uri,
                    "email": user["email"],
                    "current_code": current_code
                })

            # 8. Enable & Persist Google Authenticator 2FA (Protected: Authenticated User)
            elif path == "/api/auth/2fa/enable":
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in.", 401)

                secret = body.get("secret", "").strip()
                code = body.get("code", "").strip()
                if not secret or not code:
                    return self._send_error("Secret key and 6-digit verification code are required.", 400)

                if not verify_totp_code(secret, code):
                    return self._send_error("Invalid verification code. Ensure your device time is synchronized.", 400)

                enable_user_2fa(user["id"], secret)
                user["is_2fa_enabled"] = True
                user["totp_secret"] = secret
                return self._send_json({
                    "success": True,
                    "message": "Google Authenticator two-factor authentication has been enabled successfully!"
                })

            # 9. Disable Google Authenticator 2FA (Protected: Authenticated User)
            elif path == "/api/auth/2fa/disable":
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in.", 401)

                disable_user_2fa(user["id"])
                user["is_2fa_enabled"] = False
                user["totp_secret"] = None
                return self._send_json({
                    "success": True,
                    "message": "Google Authenticator two-factor authentication has been disabled."
                })

            # 10. Presentation Helper: Retrieve Current TOTP Code
            elif path == "/api/auth/2fa/demo-code":
                user_id = body.get("user_id")
                if not user_id:
                    return self._send_error("User ID is required.", 400)
                user = get_user_by_id(int(user_id))
                if not user or not user.get("totp_secret"):
                    return self._send_error("User not found or 2FA is not active.", 404)
                code = get_current_totp(user["totp_secret"])
                return self._send_json({
                    "success": True,
                    "code": code
                })

            # 11. Create New Event (Protected: Organizer Only)
            elif path == "/api/events":
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in.", 401)
                if user["role"] != "organizer":
                    return self._send_error("Access denied. Only Event Organizers can publish events.", 403)

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
                logger.info(f"[EVENT] New event published by {user['name']}: '{new_event['title']}' (ID #{new_event['id']})")
                return self._send_json({
                    "success": True,
                    "message": "Event published successfully!",
                    "event": new_event
                }, 201)

            # 6. Register Attendee for Event (Protected: Authenticated Attendee/User)
            elif path == "/api/registrations":
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in to register for an event.", 401)

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

            # 7. Validate Check-in Token (Protected: Operator or Organizer)
            elif path == "/api/checkin/validate":
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in.", 401)
                if user["role"] not in ["operator", "organizer"]:
                    return self._send_error("Access denied. Operator or Organizer role required to check in attendees.", 403)

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

            # 8. Update Event Status (Protected: Organizer Only)
            elif re.match(r"^/api/events/(\d+)/status$", path):
                event_id = int(re.match(r"^/api/events/(\d+)/status$", path).group(1))
                user = self._get_current_user()
                if not user:
                    return self._send_error("Unauthenticated. Please log in.", 401)
                if user["role"] != "organizer":
                    return self._send_error("Access denied. Only Organizer can update event status.", 403)

                new_status = body.get("status", "closed")
                if new_status not in ["published", "closed", "draft"]:
                    return self._send_error("Invalid status value.", 400)

                updated = update_event_status(event_id, new_status, user["id"])
                logger.info(f"[EVENT] Status for Event #{event_id} changed to '{new_status}' by {user['name']}")
                return self._send_json({"success": updated, "message": f"Event status set to '{new_status}'"})

            return self._send_error(f"Endpoint POST {path} not found", 404)

        except Exception as e:
            logger.error(f"[SERVER] Unhandled exception processing POST {path}: {str(e)}", exc_info=True)
            return self._send_error("An unexpected server error occurred.", 500)


def run_server(host: str = "0.0.0.0", port: int = 8080):
    seed_default_sessions()
    logger.info(f"[STARTUP] Starting EventHub ThreadingHTTPServer on {host}:{port}")
    server = ThreadingHTTPServer((host, port), EventHubAPIHandler)
    logger.info(f"[STARTUP] EventHub Server is active and listening at http://{host}:{port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("[SHUTDOWN] KeyboardInterrupt received. Shutting down EventHub server...")
        server.shutdown()
