# AI-Voice-Sales-Agent-With-CRM-Automation
An intelligent AI-powered voice agent that automates sales conversations, handles customer queries, and seamlessly integrates with CRM systems to manage leads, track interactions, and improve sales efficiency. Designed to enhance customer engagement and streamline the sales workflow using natural language processing and automation.

## Google Calendar appointment booking

The app exposes two appointment booking endpoints:

- `POST /api/appointments/book` for logged-in dashboard/API calls.
- `POST /api/webhooks/appointments/book` for ElevenLabs or another external agent tool.

Both endpoints expect JSON like:

```json
{
  "contactId": "optional-firestore-contact-id",
  "name": "Rahul",
  "phone": "+919876543210",
  "email": "rahul@example.com",
  "appointmentDateTime": "2026-05-28T16:00:00+05:30",
  "durationMinutes": 30,
  "notes": "Booked during outbound AI call."
}
```

The backend checks Google Calendar free/busy first. If the slot is available, it creates a Calendar event with a Google Meet link and updates the matching Firestore contact with `appointmentStatus`, `appointmentDateTime`, `calendarEventId`, and `meetingLink`.

Required `.env` values:

```env
GOOGLE_CALENDAR_ID=your_calendar_id_or_email
GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata
APPOINTMENT_WEBHOOK_SECRET=make-a-long-random-secret
```

For credentials, use one of these:

```env
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
```

or:

```env
GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

If you use a service account, share the target Google Calendar with the service account email and give it permission to make changes to events.
