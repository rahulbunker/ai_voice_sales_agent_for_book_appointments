"""
outbound.py — Outbound Call Module
Handles making outbound calls via the external API.
DID is handled by the backend API — no DID management here.
"""

import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

OUTBOUND_API_URL = os.getenv("OUTBOUND_API_URL", "")
API_SECRET_KEY = os.getenv("API_SECRET_KEY", "")


def make_outbound_call(destination):
    """
    Make an outbound call via the external API.

    Args:
        destination: Target phone number to call

    Returns:
        dict with 'success', 'message', and optionally 'data' containing 'event_id'
    """
    if not OUTBOUND_API_URL:
        return {
            "success": False,
            "message": "Outbound API URL not configured. Set OUTBOUND_API_URL in .env",
        }

    # Clean destination number
    destination = str(destination).strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not destination:
        return {"success": False, "message": "Destination number is required."}

    print(f"[Outbound] Calling {destination} via {OUTBOUND_API_URL}")

    try:
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": API_SECRET_KEY,
        }

        response = requests.post(
            f"{OUTBOUND_API_URL}/outbound-call",
            json={
                "destination": destination,
            },
            headers=headers,
            timeout=30,
        )

        data = response.json()

        if response.status_code == 200:
            event_id = data.get("event_id", "")
            resp = data.get("response", data)

            # External API returns status "1" or "success" on success
            if resp.get("status") in ("success", "1") or resp.get("responseCode") == 200:
                return {
                    "success": True,
                    "message": "Call initiated successfully!",
                    "data": {
                        "event_id": event_id,
                        "destination": destination,
                    },
                }
            elif resp.get("status") == "error":
                return {
                    "success": False,
                    "message": resp.get("message", "Call failed from external API"),
                }
            else:
                # Treat as success if 200 status code — event_id is what matters
                return {
                    "success": True,
                    "message": "Call initiated!",
                    "data": {
                        "event_id": event_id,
                        "destination": destination,
                    },
                }
        else:
            return {
                "success": False,
                "message": data.get("error", f"API returned status {response.status_code}"),
            }

    except requests.exceptions.Timeout:
        return {"success": False, "message": "Outbound API timed out. Try again."}
    except requests.exceptions.ConnectionError:
        return {"success": False, "message": "Cannot reach Outbound API. Check OUTBOUND_API_URL."}
    except Exception as e:
        print(f"[Outbound] Error: {e}")
        return {"success": False, "message": f"Unexpected error: {str(e)}"}


def check_call_status(event_id):
    """
    Check the status of an outbound call using the event_id.
    Calls GET /call-status/{event_id} on the external Bonvoice API.

    The external API returns:
    {
        "event_id": "...",
        "status": "initiated|initialized|in-progress|answered|completed|hangup|failed|no-answer|ended",
        "destination": "...",
        "finished": true/false,
        "started_at": "...",
        "ended_at": "..." or null,
        "call_id": "..." or null,
        "recording_url": "..." or null,
        "source": "local" or "bonvoice_api",
        "call_duration": number (when source=bonvoice_api)
    }

    Returns:
        dict with 'success', 'status', 'finished', and full call data
    """
    if not OUTBOUND_API_URL or not event_id:
        return {"success": False, "status": "unknown", "finished": True}

    try:
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": API_SECRET_KEY,
        }

        response = requests.get(
            f"{OUTBOUND_API_URL}/call-status/{event_id}",
            headers=headers,
            timeout=15,
        )

        if response.status_code == 200:
            data = response.json()
            call_status = data.get("status", "unknown").lower()
            is_finished = data.get("finished", False)

            return {
                "success": True,
                "status": call_status,
                "finished": is_finished,
                "event_id": data.get("event_id", event_id),
                "destination": data.get("destination", ""),
                "call_id": data.get("call_id"),
                "recording_url": data.get("recording_url"),
                "started_at": data.get("started_at"),
                "ended_at": data.get("ended_at"),
                "call_duration": data.get("call_duration"),
                "source": data.get("source", "unknown"),
            }
        elif response.status_code == 404:
            # Event not found — treat as finished
            return {"success": False, "status": "not-found", "finished": True}
        else:
            return {"success": False, "status": "error", "finished": False}

    except requests.exceptions.Timeout:
        return {"success": False, "status": "timeout", "finished": False}
    except requests.exceptions.ConnectionError:
        return {"success": False, "status": "connection-error", "finished": False}
    except Exception as e:
        print(f"[Outbound] Status check error: {e}")
        return {"success": False, "status": "error", "finished": False}


def make_bulk_calls(contacts):
    """
    Make outbound calls to a list of contacts.

    Args:
        contacts: list of dicts with 'name' and 'phone'

    Returns:
        dict with 'success', 'total', 'initiated', 'failed', 'results'
    """
    results = []
    initiated = 0
    failed = 0

    for contact in contacts:
        phone = contact.get("phone", "")
        name = contact.get("name", "Unknown")

        result = make_outbound_call(phone)
        result["contact_name"] = name
        result["contact_phone"] = phone
        results.append(result)

        if result.get("success"):
            initiated += 1
        else:
            failed += 1

    return {
        "success": True,
        "total": len(contacts),
        "initiated": initiated,
        "failed": failed,
        "results": results,
    }
