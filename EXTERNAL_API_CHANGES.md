# External Bonvoice API — Integration Status

## ✅ DONE — External API has been updated with call status tracking

The external Bonvoice API now has:
- `GET /call-status/{event_id}` — returns call status with `finished: true/false`
- `POST /call-notification` — webhook for call lifecycle events from Bonvoice
- `POST /call-hangup` — webhook for hangup events with recording URL
- In-memory `active_calls` tracking + Bonvoice API fallback

## How Automate Outbounds Uses It

### Sequential Call Flow

```
For each contact:
  1. POST /outbound-call → get event_id
  2. Poll GET /call-status/{event_id} every 5 seconds
  3. Wait until response has finished: true
  4. Save result (status, recording_url, duration) to Firestore
  5. Wait 2 seconds gap
  6. Move to next contact
```

### Status Mapping

| API Status     | Automate Outbounds Action           | Firestore Status |
|---------------|--------------------------------------|------------------|
| `initiated`   | Show "Ringing (Xs)" in live log      | `calling`        |
| `initialized` | Show "Ringing (Xs)" in live log      | `calling`        |
| `answered`    | Show "On call (Xs)" in live log      | `calling`        |
| `in-progress` | Show "On call (Xs)" in live log      | `calling`        |
| `completed`   | ✅ Mark success, move to next call    | `called`         |
| `hangup`      | ✅ Mark success, move to next call    | `called`         |
| `ended`       | ✅ Mark success, move to next call    | `called`         |
| `no-answer`   | ❌ Mark failed, move to next call     | `no-answer`      |
| `failed`      | ❌ Mark failed, move to next call     | `failed`         |
| `not-found`   | Treat as finished, move on           | `called`         |

### Data Saved to Firestore per Contact

| Field          | Description                          |
|---------------|--------------------------------------|
| `status`       | Final call status                    |
| `eventId`      | The event_id from the call           |
| `callId`       | Bonvoice unique call ID              |
| `recordingUrl`  | URL to call recording (if available)|
| `callDuration`  | Call duration in seconds            |
| `calledAt`      | Timestamp when call completed       |
| `endedAt`       | When the call ended (from API)      |
