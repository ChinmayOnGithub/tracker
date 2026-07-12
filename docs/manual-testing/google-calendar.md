# Google Calendar — Manual Verification Checklist

This document details the step-by-step verification procedures required to confirm the stability, safety, and correctness of Tracker's Google Calendar integration before any release.

---

## 1. OAuth & Authentication Flow

### A. Initial Connection
- [ ] Navigate to **Settings** panel using the sidebar switcher.
- [ ] Click the **Connect Google Account** button.
- [ ] Verify you are redirected to the Google Accounts consent screen.
- [ ] Verify that the URL parameters match exactly:
  - `client_id` is present.
  - `scope` includes `openid email profile https://www.googleapis.com/auth/calendar`.
  - `access_type=offline` is present.
  - `prompt=select_account consent` is present.
  - `code_challenge` and `code_challenge_method=S256` are present (PKCE verification).
- [ ] Complete authorization with a Google Test Account.
- [ ] Verify redirect back to Tracker (`/`).
- [ ] Verify Settings displays the connection status as **Active** with **Integrated successfully with Google Calendar** badge.
- [ ] Inspect database table `GoogleCredential`:
  ```sql
  SELECT * FROM "GoogleCredential" WHERE "userId" = '<user_id>';
  ```
  - Verify exactly one row exists.
  - Verify `refreshToken` is encrypted (formatted as `iv:encryptedData:tag`).

### B. CSRF Protection Validation (State Param)
- [ ] Initiate the connection flow by clicking **Connect Google Account**.
- [ ] Copy the Google redirect URL and alter the `state` parameter to a random value.
- [ ] Complete the consent flow at Google.
- [ ] Verify that Tracker rejects the redirect and returns to `/` with the error `google-auth-csrf-failed`.
- [ ] Verify no credentials are saved in the database.

### C. Reconnection & Re-consent
- [ ] Reconnect Google Calendar while already connected.
- [ ] Verify that Google prompts for consent again (since `prompt=consent` is forced).
- [ ] Complete consent and verify `GoogleCredential` is updated in place.

---

## 2. Agenda View Display & Widgets

### A. Bucketing Calculations
- [ ] Create calendar events in Google Calendar:
  - **Event 1**: Starts today.
  - **Event 2**: Starts tomorrow.
  - **Event 3**: Starts in 3 days.
- [ ] Navigate to the dashboard.
- [ ] Verify **Today's Schedule** widget shows:
  - Event 1 in the **Today** category.
  - Event 2 in the **Tomorrow** category.
  - Event 3 in the **Upcoming Week** category.

### B. Event Parsing Details
- [ ] Create an all-day event in Google Calendar. Verify Tracker renders it with **All Day** label.
- [ ] Create a timed event. Verify Tracker renders it at the correct local time.
- [ ] Create an event with a location. Verify the location icon and address display.
- [ ] Create an event without a title. Verify Tracker displays it as **Untitled Event**.

### C. Timezone Transitions
- [ ] Set your local timezone differently in Google Calendar (e.g. UTC, IST).
- [ ] Verify that events show up under correct local day categories without day-shifting.

---

## 3. Cache & Network Resilience

### A. Event Cache Expiry
- [ ] Load the dashboard, see your events.
- [ ] Add a new event in Google Calendar.
- [ ] Reload the Tracker page. Verify the new event does NOT appear immediately (using cache).
- [ ] Wait 10 minutes (or click the force refresh icon on the widget).
- [ ] Verify the new event is now displayed.

### B. Expired Access Token Recovery
- [ ] Authenticate Google.
- [ ] Wait 1 hour (letting access token expire) or clear the in-memory access token cache.
- [ ] Reload the dashboard page.
- [ ] Verify events load successfully without prompting for login (access token renewed automatically).

### C. Stale Token / Revoked Access Graceful Handling
- [ ] Revoke Tracker's access in Google Settings (https://myaccount.google.com/permissions).
- [ ] Reload the Tracker dashboard page.
- [ ] Verify Tracker displays a graceful connection error badge: **Google access has been revoked. Please reconnect your account in Settings.**
- [ ] Verify database table `GoogleCredential` has auto-deleted the revoked record.

---

## 4. Background Sync & Cron Verification

### A. Authentication Guards (Fail-Closed)
- [ ] Trigger raw sync `/api/sync/calendar` without parameters. Verify `503 Service Unavailable` or `401 Unauthorized`.
- [ ] Trigger `/api/sync/calendar?secret=invalid`. Verify `401 Unauthorized`.
- [ ] Trigger `/api/sync/calendar?secret=<valid_sync_secret>`. Verify `200 OK` with JSON results listing synced users.

---

## 5. Event Write Operations (CRUD)

### A. Create Event Verification
- [ ] Call `CalendarService.createEvent()` via console or server test endpoints:
  ```json
  {
    "summary": "New Manual Test Event",
    "description": "Create Verification Note",
    "start": { "dateTime": "2026-07-11T12:00:00Z" },
    "end": { "dateTime": "2026-07-11T13:00:00Z" },
    "isAllDay": false
  }
  ```
- [ ] Verify event is created on Google Calendar.
- [ ] Verify in-memory calendar cache for that user is invalidated immediately.
- [ ] Verify page reload pulls and displays the newly created event.

### B. Update Event Verification
- [ ] Call `CalendarService.updateEvent()` on the created event ID:
  ```json
  {
    "summary": "Updated Manual Test Event"
  }
  ```
- [ ] Verify title is updated on Google Calendar.
- [ ] Verify other fields (description, start, end) remain unchanged.
- [ ] Verify local cache is cleared.
- [ ] Verify page reload pulls and displays the updated event summary.

### C. Delete Event Verification
- [ ] Call `CalendarService.deleteEvent()` on the event ID.
- [ ] Verify event is removed from Google Calendar.
- [ ] Verify local cache is cleared.
- [ ] Verify page reload does not show the deleted event.
- [ ] Trigger deletion again on the same event ID. Verify it returns success (`true`) and doesn't crash (idempotency).

