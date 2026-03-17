"""
AutoCall Pro — Flask Backend
Run with: python main.py
Opens the login page automatically in your default browser.
"""

import os
import json
from functools import wraps
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, redirect, url_for, make_response
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth, firestore
from apscheduler.schedulers.background import BackgroundScheduler

# Load environment variables from .env
load_dotenv()

# ===== Initialize Flask =====
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
    static_url_path="/static",
)
app.secret_key = os.urandom(24)

# ===== Initialize Firebase Admin SDK =====
SERVICE_ACCOUNT_PATH = os.path.join(BASE_DIR, "firebase.json")

if not firebase_admin._apps:
    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)


# ===== Helper: Verify Firebase ID Token =====
def verify_token(id_token):
    """Verify a Firebase ID token and return decoded claims or None."""
    try:
        decoded = firebase_auth.verify_id_token(id_token)
        return decoded
    except Exception as e:
        print(f"[Auth] Token verification failed: {e}")
        return None


def get_token_from_request():
    """Extract token from Authorization header or cookie."""
    # Check Authorization header first
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split("Bearer ")[1]
    # Fallback to cookie
    return request.cookies.get("session_token")


def login_required(f):
    """Decorator to protect routes — requires valid Firebase token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = get_token_from_request()
        if not token:
            # If it's an API call, return 401
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            # Otherwise redirect to login
            return redirect(url_for("login_page"))

        decoded = verify_token(token)
        if not decoded:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Invalid or expired token"}), 401
            return redirect(url_for("login_page"))

        request.user = decoded
        return f(*args, **kwargs)
    return decorated


# =======================================================
#                    PAGE ROUTES
# =======================================================

@app.route("/")
def root():
    """Root — redirect to login page."""
    return redirect(url_for("login_page"))


@app.route("/login")
def login_page():
    """Serve the login/signup page."""
    return render_template("index.html")


@app.route("/dashboard")
def dashboard_page():
    """Serve the dashboard page (client-side auth guard also checks)."""
    return render_template("dashboard.html")


# =======================================================
#                    AUTH API ENDPOINTS
# =======================================================

@app.route("/api/auth/verify", methods=["POST"])
def api_verify_token():
    """
    Verify Firebase ID token from frontend.
    Frontend sends the token after Firebase client-side login.
    Backend verifies it and sets a session cookie.
    """
    data = request.get_json()
    if not data or "idToken" not in data:
        return jsonify({"error": "Missing idToken"}), 400

    decoded = verify_token(data["idToken"])
    if not decoded:
        return jsonify({"error": "Invalid token"}), 401

    # Build response with user info
    user_info = {
        "uid": decoded.get("uid"),
        "email": decoded.get("email"),
        "name": decoded.get("name", ""),
        "email_verified": decoded.get("email_verified", False),
        "verified": True,
    }

    response = make_response(jsonify(user_info))
    # Set the token as a secure httpOnly cookie for subsequent requests
    response.set_cookie(
        "session_token",
        data["idToken"],
        httponly=True,
        samesite="Lax",
        max_age=3600,  # 1 hour
        path="/",
    )
    return response


@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    """Clear the session cookie."""
    response = make_response(jsonify({"message": "Logged out"}))
    response.delete_cookie("session_token", path="/")
    return response


@app.route("/api/auth/session", methods=["GET"])
def api_check_session():
    """Check if user has a valid session (token cookie)."""
    token = get_token_from_request()
    if not token:
        return jsonify({"authenticated": False}), 401

    decoded = verify_token(token)
    if not decoded:
        return jsonify({"authenticated": False}), 401

    return jsonify({
        "authenticated": True,
        "uid": decoded.get("uid"),
        "email": decoded.get("email"),
        "name": decoded.get("name", ""),
    })


# =======================================================
#           PROTECTED API EXAMPLE
# =======================================================

@app.route("/api/user/profile", methods=["GET"])
@login_required
def api_user_profile():
    """Example protected route — returns user profile from verified token."""
    user = request.user
    return jsonify({
        "uid": user.get("uid"),
        "email": user.get("email"),
        "name": user.get("name", ""),
        "email_verified": user.get("email_verified", False),
    })


# =======================================================
#           OUTBOUND CALL API
# =======================================================

from outbound import make_outbound_call, make_bulk_calls, check_call_status


@app.route("/api/outbound/call", methods=["POST"])
@login_required
def api_outbound_call():
    """
    Make a single outbound call.
    Expects JSON: { "destination": "919876543210" }
    DID is handled by the external backend API.
    """
    data = request.get_json()
    if not data or "destination" not in data:
        return jsonify({"success": False, "message": "Missing destination number"}), 400

    destination = data["destination"]

    result = make_outbound_call(destination)

    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


@app.route("/api/outbound/call-status/<event_id>", methods=["GET"])
@login_required
def api_call_status(event_id):
    """
    Check status of an outbound call by event_id.
    Returns: { success, status, finished, duration, data }
    """
    if not event_id:
        return jsonify({"success": False, "status": "unknown", "finished": True}), 400

    result = check_call_status(event_id)
    return jsonify(result), 200


@app.route("/api/outbound/bulk", methods=["POST"])
@login_required
def api_outbound_bulk():
    """
    Make bulk outbound calls.
    Expects JSON: { "contacts": [{ "name": "...", "phone": "..." }, ...] }
    """
    data = request.get_json()
    if not data or "contacts" not in data:
        return jsonify({"success": False, "message": "Missing contacts list"}), 400

    user_id = request.user.get("uid")
    contacts = data["contacts"]

    if not contacts or len(contacts) == 0:
        return jsonify({"success": False, "message": "Contacts list is empty"}), 400

    result = make_bulk_calls(contacts)
    return jsonify(result), 200





# =======================================================
#           RETRY SETTINGS API
# =======================================================

@app.route('/api/settings/retry-interval', methods=['POST'])
@login_required
def api_save_retry_interval():
    """Save user retry interval and update scheduler."""
    data = request.get_json()
    if not data or 'minutes' not in data:
        return jsonify({'success': False, 'message': 'Missing minutes'}), 400

    minutes = int(data['minutes'])
    if minutes < 5 or minutes > 1440:
        return jsonify({'success': False, 'message': 'Interval must be between 5 and 1440 minutes'}), 400

    global RETRY_AFTER_HOURS
    RETRY_AFTER_HOURS = minutes / 60

    print(f'[Settings] Retry interval updated to {minutes} minutes ({RETRY_AFTER_HOURS:.2f} hours)')
    return jsonify({'success': True, 'message': f'Retry interval set to {minutes} minutes'})


# =======================================================
#           AUTO RETRY SCHEDULER (APScheduler)
# =======================================================

# Statuses that should be retried
RETRY_STATUSES = ['failed', 'no-answer', 'busy', 'not-connected', 'not connected']

# How long to wait before retrying (1 hour)
RETRY_AFTER_HOURS = 1

def auto_retry_failed_calls():
    """
    Runs every 5 minutes.
    Checks Firestore for contacts with failed/not-connected status
    whose last call was more than the user-set interval ago, then retries them.
    """
    try:
        db = firestore.client()
        now = datetime.now(timezone.utc)

        # Read retry interval from each user settings in Firestore
        # Default to 1 hour if not set
        user_intervals = {}
        settings_docs = db.collection('userSettings').stream()
        for doc in settings_docs:
            data = doc.to_dict()
            minutes = data.get('retryIntervalMinutes', 60)
            user_intervals[doc.id] = minutes / 60  # convert to hours
        
        retry_cutoff = now - timedelta(hours=RETRY_AFTER_HOURS)  # fallback

        print(f"[Scheduler] Checking for failed contacts to retry at {now.strftime('%H:%M:%S')}...")

        # Query all contacts with retryable statuses
        contacts_ref = db.collection('contacts')
        failed_docs = []

        for status in RETRY_STATUSES:
            docs = contacts_ref.where('status', '==', status).stream()
            for doc in docs:
                failed_docs.append((doc.id, doc.to_dict()))

        if not failed_docs:
            print("[Scheduler] No failed contacts found.")
            return

        # Filter: only retry contacts whose last call was 1+ hour ago
        to_retry = []
        for doc_id, data in failed_docs:
            called_at = data.get('calledAt')
            if called_at is None:
                # Never been called properly — retry immediately
                to_retry.append((doc_id, data))
                continue

            # Convert Firestore timestamp to datetime
            if hasattr(called_at, 'ToDatetime'):
                called_dt = called_at.ToDatetime().replace(tzinfo=timezone.utc)
            elif hasattr(called_at, 'timestamp'):
                called_dt = datetime.fromtimestamp(called_at.timestamp(), tz=timezone.utc)
            else:
                continue

            # Use user-specific interval if available, else global fallback
            uid = data.get('userId', '')
            user_hours = user_intervals.get(uid, RETRY_AFTER_HOURS)
            user_cutoff = now - timedelta(hours=user_hours)
            
            if called_dt <= user_cutoff:
                to_retry.append((doc_id, data))

        if not to_retry:
            print(f"[Scheduler] {len(failed_docs)} failed contact(s) found but not yet 1 hour old. Skipping.")
            return

        print(f"[Scheduler] Retrying {len(to_retry)} contact(s)...")

        from outbound import make_outbound_call

        for doc_id, data in to_retry:
            phone = data.get('phone', '')
            name = data.get('name', 'Unknown')

            if not phone:
                continue

            print(f"[Scheduler] Retrying {name} ({phone})...")

            # Update status to 'calling' before attempt
            db.collection('contacts').document(doc_id).update({
                'status': 'calling',
                'retryAt': firestore.SERVER_TIMESTAMP,
            })

            result = make_outbound_call(phone)

            if result.get('success'):
                event_id = result.get('data', {}).get('event_id', '')
                db.collection('contacts').document(doc_id).update({
                    'status': 'called',
                    'calledAt': firestore.SERVER_TIMESTAMP,
                    'eventId': event_id,
                    'retrySuccess': True,
                })
                print(f"[Scheduler] ✅ Retry success: {name} ({phone})")
            else:
                db.collection('contacts').document(doc_id).update({
                    'status': 'failed',
                    'calledAt': firestore.SERVER_TIMESTAMP,
                    'retrySuccess': False,
                })
                print(f"[Scheduler] ❌ Retry failed: {name} ({phone}) — {result.get('message')}")

        print(f"[Scheduler] Done. Retried {len(to_retry)} contact(s).")

    except Exception as e:
        print(f"[Scheduler] Error in auto_retry_failed_calls: {e}")


# Start the background scheduler
scheduler = BackgroundScheduler(timezone='UTC')
scheduler.add_job(
    auto_retry_failed_calls,
    trigger='interval',
    minutes=5,
    id='auto_retry_job',
    replace_existing=True,
)
scheduler.start()
print("[Scheduler] Auto-retry scheduler started (checks every 5 minutes).")

# =======================================================
#                    MAIN ENTRY
# =======================================================

if __name__ == "__main__":
    print("\n" + "=" * 55)
    print("   🚀 AutoCall Pro — Starting Server...")
    print("=" * 55)
    print(f"   🌐 Login Page:     http://127.0.0.1:5000/login")
    print(f"   📊 Dashboard:      http://127.0.0.1:5000/dashboard")
    print(f"   🔑 Auth API:       http://127.0.0.1:5000/api/auth/verify")
    print("=" * 55 + "\n")

    app.run(host="127.0.0.1", port=5001, debug=True, use_reloader=False)