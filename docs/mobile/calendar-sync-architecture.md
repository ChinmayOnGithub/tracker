# Calendar & Google Calendar Two-Way Synchronization Architecture

This document specifies the two-way Google Calendar synchronization architecture for Tracker OS.

---

## 1. Architectural Overview

Tracker OS integrates with Google Calendar bidirectionally:

```text
       ┌────────────────────────┐
       │ Google Calendar Cloud  │
       └───────────┬────────────┘
                   │
         OAuth2 / REST API / Push
                   │
                   ▼
┌──────────────────────────────────────┐
│  Tracker Server (CalendarService)    │
│  - GoogleCredential (refresh token)  │
│  - CalendarSyncState (syncToken)     │
│  - LinkedEventMapping                │
└──────────────────┬───────────────────┘
                   │
           Mobile / Web API
                   │
                   ▼
┌──────────────────────────────────────┐
│       Tracker Mobile Client          │
│       - Native Month / Week / Day    │
│       - Local SQLite Cache           │
│       - Mutation Outbox              │
└──────────────────────────────────────┘
```

---

## 2. Synchronization Flow

### A. Initial Full Synchronization
1. Client or server triggers sync for user.
2. `GoogleCalendarProvider` calls Google Calendar API `events.list` with `singleEvents: true` and no `syncToken`.
3. Google returns complete active events across the time window plus a `nextSyncToken`.
4. Server reconciles events into `CalendarEvent` table.
5. Server persists `nextSyncToken` in `CalendarSyncState`.

### B. Incremental Synchronization (Deltas)
1. On subsequent sync cycles, `CalendarService` retrieves existing `syncToken` from `CalendarSyncState`.
2. Calls `GoogleCalendarService.listEventsWithSyncToken(userId, syncToken)`.
3. Google returns only events modified, created, or deleted (cancelled) since the token was issued.
4. Server processes deltas:
   - Status `cancelled` ➔ soft-deletes `CalendarEvent` (`deletedAt = new Date()`).
   - Active event ➔ upserts `CalendarEvent` and updates `etag`.
5. Server saves the new `nextSyncToken`.

### C. HTTP 410 Invalid-Sync-Token Recovery
Google documents that sync tokens expire (typically after days or full calendar resets). When expired, Google responds with `HTTP 410 Gone`.

**Recovery Sequence**:
```text
Incremental Sync Attempt
           ↓
HTTP 410 Received ("Sync token is invalid")
           ↓
Log warning ("Sync token invalidated")
           ↓
Update CalendarSyncState: syncToken = null
           ↓
Execute fallback fullSync(userId)
           ↓
Persist fresh nextSyncToken
```
*The system never gets stuck with a stale or broken sync token.*

---

## 3. Stable Event Mapping (`LinkedEventMapping`)

To prevent duplicate events when syncing back and forth:
- `LinkedEventMapping` maintains the relationship:
  $$\text{googleEventId} \longleftrightarrow \text{localLogId / activityId}$$
- Extended properties (`extendedProperties.private.trackerId`) are attached to Google Calendar events created by Tracker.
- Repeated sync cycles check `LinkedEventMapping` before creating local or remote items.

---

## 4. Google Push Notifications & Advisory Trigger

- `CalendarService.ensureWatchChannel(userId)` provisions a webhook channel (`notifications/watch`) with Google.
- Google sends ping notifications when calendar changes occur.
- **Critical Invariant**: Push notifications are treated as an *advisory signal* to trigger a sync run, not as the payload itself.
- Because mobile push delivery cannot be guaranteed under Android battery optimization, the app pairs push notifications with periodic foreground reconciliation upon app open.
