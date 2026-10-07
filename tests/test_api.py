"""
EventHub - Automated Test Suite
Verifies all functional, database, capacity, and security requirements.
Run with:
    python3 tests/test_api.py
"""

import sys
import os
import unittest
import json
import sqlite3

# Ensure app path is in sys.path
TEST_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TEST_DIR)
sys.path.insert(0, PROJECT_DIR)

from backend import db
# Use a dedicated test database
TEST_DB_PATH = os.path.join(PROJECT_DIR, "test_eventhub.db")
db.DB_PATH = TEST_DB_PATH

from backend.db import (
    init_db,
    seed_data,
    get_db_connection,
    get_all_events,
    get_event_by_id,
    create_event,
    register_attendee,
    validate_checkin,
    get_event_attendees,
    get_organizer_metrics
)
from backend.auth import (
    authenticate_user,
    register_user,
    authenticate_or_register_google_user,
    parse_google_id_token,
    create_session,
    get_user_from_token,
    logout_user,
    generate_totp_secret,
    get_totp_uri,
    get_current_totp,
    verify_totp_code,
    get_user_2fa_status,
    enable_user_2fa,
    disable_user_2fa,
    get_user_by_id
)
from backend.external import geocode_address


class EventHubTestCase(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Remove old test DB if present
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)
        init_db()
        seed_data()

    @classmethod
    def tearDownClass(cls):
        # Cleanup test DB
        if os.path.exists(TEST_DB_PATH):
            os.remove(TEST_DB_PATH)

    def test_01_database_tables_exist(self):
        """Verify all 5 required tables exist in SQLite."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row["name"] for row in cursor.fetchall()]
        conn.close()

        expected = ["users", "events", "registrations", "checkins", "organizer_logs"]
        for t in expected:
            self.assertIn(t, tables, f"Expected table '{t}' to exist in database.")

    def test_02_events_seeded(self):
        """Verify initial events are seeded with valid data."""
        events = get_all_events()
        self.assertGreaterEqual(len(events), 4, "Should have at least 4 seeded events.")
        first = events[0]
        self.assertIn("title", first)
        self.assertIn("capacity", first)
        self.assertIn("registered_count", first)

    def test_03_authentication(self):
        """Verify password hashing and authentication."""
        # Valid login
        organizer = authenticate_user("organizer@eventhub.io", "pass123")
        self.assertIsNotNone(organizer)
        self.assertEqual(organizer["role"], "organizer")

        # Invalid login
        bad = authenticate_user("organizer@eventhub.io", "wrongpassword")
        self.assertIsNone(bad)

    def test_04_attendee_registration_and_token_generation(self):
        """Verify attendee can register and receive unique ticket token."""
        # Attendee Priya Sharma (user_id=6) on Event 2
        success, msg, reg = register_attendee(event_id=2, user_id=6)
        self.assertTrue(success, f"Registration failed: {msg}")
        self.assertIsNotNone(reg)
        self.assertTrue(reg["ticket_token"].startswith("EH-2026-"), "Token format mismatch")

    def test_05_duplicate_registration_prevented(self):
        """Verify unique constraint prevents same user registering twice for same event."""
        # Second registration by Priya Sharma on Event 2 should fail
        success, msg, reg = register_attendee(event_id=2, user_id=6)
        self.assertFalse(success, "Duplicate registration should have been rejected!")
        self.assertIn("already registered", msg.lower())

    def test_06_capacity_limit_enforced(self):
        """Verify registration is rejected when capacity is reached."""
        new_event = create_event({
            "title": "Micro Capacity VIP Meeting",
            "category": "Career",
            "description": "Exclusive single-seat meeting",
            "venue_name": "Executive Boardroom",
            "venue_address": "500 Howard Street, San Francisco, CA",
            "date_time": "2026-11-01 10:00",
            "capacity": 1,
            "ticket_price": 100.0
        }, organizer_id=1)

        event_id = new_event["id"]

        # Register User 4 (Elena) -> Succeeds
        s1, m1, r1 = register_attendee(event_id=event_id, user_id=4)
        self.assertTrue(s1, f"First registration should succeed: {m1}")

        # Try to register User 5 (Marcus) -> Capacity is full!
        s2, m2, r2 = register_attendee(event_id=event_id, user_id=5)
        self.assertFalse(s2, "Registration should be rejected when capacity is exceeded!")
        self.assertIn("maximum capacity", m2.lower())

    def test_07_checkin_validation_success(self):
        """Verify check-in operator can validate attendee ticket token."""
        # David Chen's seeded token on Event 1 is EH-2026-T84A-9102
        code, msg, details = validate_checkin(
            token="EH-2026-T84A-9102",
            operator_id=2,
            target_event_id=1
        )
        self.assertEqual(code, "SUCCESS", f"Expected SUCCESS, got {code}: {msg}")
        self.assertIsNotNone(details)
        self.assertEqual(details["attendee_name"], "David Chen")

    def test_08_duplicate_checkin_prevented(self):
        """Verify check-in operator CANNOT check in the same attendee twice."""
        # David Chen was checked in during test_07; scanning again must fail
        code, msg, details = validate_checkin(
            token="EH-2026-T84A-9102",
            operator_id=2,
            target_event_id=1
        )
        self.assertEqual(code, "ALREADY_CHECKED_IN", "Second scan must be flagged as ALREADY_CHECKED_IN!")

    def test_09_invalid_token_rejected(self):
        """Verify arbitrary fake tokens are rejected."""
        code, msg, details = validate_checkin(
            token="EH-FAKE-INVALID-TOKEN-999",
            operator_id=2
        )
        self.assertEqual(code, "INVALID_TOKEN")

    def test_10_external_nominatim_geocoding(self):
        """Verify external OpenStreetMap geocoding integration."""
        result = geocode_address("100 Innovation Way, San Francisco, CA 94105")
        self.assertTrue(result["success"])
        self.assertIn("lat", result["data"])
        self.assertIn("lon", result["data"])
        self.assertIn("OpenStreetMap", result["attribution"])

    def test_11_login_valid_credentials(self):
        """Verify valid credentials return user profile and generate active session."""
        user = authenticate_user("organizer@eventhub.io", "pass123")
        self.assertIsNotNone(user, "Expected valid user to authenticate successfully")
        self.assertEqual(user["role"], "organizer")

        token = create_session(user)
        self.assertTrue(token.startswith("eh_sec_"), "Token should have standard prefix")

        session_user = get_user_from_token(token)
        self.assertIsNotNone(session_user)
        self.assertEqual(session_user["email"], "organizer@eventhub.io")

    def test_12_login_invalid_password_rejected(self):
        """Verify incorrect password fails authentication."""
        user = authenticate_user("organizer@eventhub.io", "incorrect_pass")
        self.assertIsNone(user, "Invalid password must return None")

    def test_13_login_nonexistent_email_rejected(self):
        """Verify unknown email fails authentication."""
        user = authenticate_user("nonexistent@domain.com", "any_password")
        self.assertIsNone(user, "Unknown email must return None")

    def test_14_logout_invalidates_session(self):
        """Verify logging out deletes token from active sessions."""
        user = authenticate_user("attendee@eventhub.io", "pass123")
        token = create_session(user)
        self.assertIsNotNone(get_user_from_token(token), "Session must be active before logout")

        logged_out = logout_user(token)
        self.assertTrue(logged_out, "logout_user should return True for active session")
        self.assertIsNone(get_user_from_token(token), "Session must be None after logout")

        # Second logout should return False
        self.assertFalse(logout_user(token), "Logging out with an already-invalidated token should return False")

    def test_15_role_based_permissions(self):
        """Verify role distinctions between attendee, operator, and organizer."""
        attendee = authenticate_user("attendee@eventhub.io", "pass123")
        operator = authenticate_user("operator@eventhub.io", "pass123")
        organizer = authenticate_user("organizer@eventhub.io", "pass123")

        self.assertEqual(attendee["role"], "attendee")
        self.assertEqual(operator["role"], "operator")
        self.assertEqual(organizer["role"], "organizer")

    def test_16_google_signin_new_user(self):
        """Verify new Google user is automatically provisioned and logged in."""
        user = authenticate_or_register_google_user(
            email="new_google_attendee@gmail.com",
            name="Maya Google User",
            role="attendee"
        )
        self.assertIsNotNone(user, "New Google user should be created")
        self.assertEqual(user["email"], "new_google_attendee@gmail.com")
        self.assertEqual(user["role"], "attendee")
        self.assertTrue(user["id"] > 0)

        token = create_session(user)
        self.assertTrue(token.startswith("eh_sec_"))
        session_user = get_user_from_token(token)
        self.assertEqual(session_user["name"], "Maya Google User")

    def test_17_google_signin_existing_user(self):
        """Verify existing user signing in with Google is recognized without duplicate row."""
        user = authenticate_or_register_google_user(
            email="organizer@eventhub.io",
            name="Sarah Jenkins",
            role="organizer"
        )
        self.assertIsNotNone(user, "Existing user should be authenticated")
        self.assertEqual(user["id"], 1, "Should map to existing user ID #1")
        self.assertEqual(user["role"], "organizer")

    def test_18_google_id_token_decoding(self):
        """Verify JWT decoding of Google Identity Services credential payload."""
        import base64
        header = base64.urlsafe_b64encode(b'{"alg":"RS256"}').decode().rstrip("=")
        payload = base64.urlsafe_b64encode(b'{"email":"decoded@gmail.com","name":"Decoded Name","sub":"1234567890"}').decode().rstrip("=")
        mock_jwt = f"{header}.{payload}.dummy_signature"

        decoded = parse_google_id_token(mock_jwt)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded.get("email"), "decoded@gmail.com")
        self.assertEqual(decoded.get("name"), "Decoded Name")
        self.assertEqual(decoded.get("sub"), "1234567890")

    def test_19_totp_generation_and_verification(self):
        """Verify RFC 6238 TOTP secret generation, URI format, and code verification."""
        secret = generate_totp_secret()
        self.assertEqual(len(secret), 16, "Secret should be 16 characters Base32")
        self.assertTrue(all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" for c in secret))

        uri = get_totp_uri(secret, "user@example.com", issuer="EventHub")
        self.assertTrue(uri.startswith("otpauth://totp/EventHub:user@example.com"))
        self.assertIn(f"secret={secret}", uri)
        self.assertIn("issuer=EventHub", uri)
        self.assertIn("digits=6", uri)
        self.assertIn("period=30", uri)

        # Generate live TOTP code
        code = get_current_totp(secret)
        self.assertEqual(len(code), 6)
        self.assertTrue(code.isdigit())

        # Verify valid code
        self.assertTrue(verify_totp_code(secret, code), "Current code should verify as valid")

        # Verify invalid code
        invalid_code = "000000" if code != "000000" else "999999"
        self.assertFalse(verify_totp_code(secret, invalid_code), "Random invalid code should fail verification")

    def test_20_user_2fa_enable_and_disable(self):
        """Verify enabling, querying, and disabling Google Authenticator 2FA in database."""
        # Create a dedicated user
        user = register_user("2FA Test User", "totp_user@eventhub.io", "pass123", "attendee", "555-0199")
        self.assertIsNotNone(user)
        user_id = user["id"]

        # Initial status should be disabled
        status = get_user_2fa_status(user_id)
        self.assertFalse(status["enabled"])
        self.assertIsNone(status["secret"])

        # Enable 2FA
        secret = generate_totp_secret()
        success = enable_user_2fa(user_id, secret)
        self.assertTrue(success)

        # Status should now be enabled with secret
        status_after = get_user_2fa_status(user_id)
        self.assertTrue(status_after["enabled"])
        self.assertEqual(status_after["secret"], secret)

        # Disable 2FA
        disable_success = disable_user_2fa(user_id)
        self.assertTrue(disable_success)

        # Status should be disabled again
        status_disabled = get_user_2fa_status(user_id)
        self.assertFalse(status_disabled["enabled"])
        self.assertIsNone(status_disabled["secret"])

    def test_21_login_with_2fa_required(self):
        """Verify that login flags accounts with 2FA enabled, and code validation confirms identity."""
        # Create user and enable 2FA
        user = register_user("Secure Admin", "secure_admin@eventhub.io", "securepass123", "organizer", "")
        self.assertIsNotNone(user)
        user_id = user["id"]

        secret = generate_totp_secret()
        enable_user_2fa(user_id, secret)

        # Attempt login with password
        auth_user = authenticate_user("secure_admin@eventhub.io", "securepass123")
        self.assertIsNotNone(auth_user)
        self.assertTrue(auth_user.get("is_2fa_enabled"), "is_2fa_enabled must be True")

        # Verify code
        code = get_current_totp(secret)
        self.assertTrue(verify_totp_code(auth_user["totp_secret"], code))

        # Session creation after 2FA validation
        session_token = create_session(auth_user)
        self.assertIsNotNone(session_token)
        recovered_user = get_user_from_token(session_token)
        self.assertEqual(recovered_user["email"], "secure_admin@eventhub.io")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("  🧪 Running EventHub Automated Test Suite")
    print("=" * 60)
    unittest.main(verbosity=2)
