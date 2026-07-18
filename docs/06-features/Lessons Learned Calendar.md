# Google Calendar Integration — Lessons Learned & Architecture Freeze

**Status**: Version 1.0 Complete
**Architecture Status**: FROZEN (Architecture Locked)

This document summarizes the engineering design choices, lessons learned, and guidelines for future Tracker modules utilizing the Google Calendar service.

---

## 1. Architectural Decisions

1. **Write-Through, Cache-Aside Caching**:
   - To prevent rate-limiting from Google's API, Tracker maintains a 10-minute in-memory cache for calendar events.
   - Any write operations (`createEvent`, `updateEvent`, `deleteEvent`) are processed immediately against the Google Calendar API (write-through) and immediately clear the cached data for that user. Subsequent reads pull fresh data automatically (cache-aside).
2. **Google Calendar as Single Source of Truth**:
   - Tracker does not mirror or duplicate Google Calendar events in its local database. 
   - This eliminates all data synchronization and conflict resolution logic. If any edit collision or external deletion occurs, the Google API acts as the final authority, returning HTTP status codes (like `404` or `410`) which Tracker handles gracefully.
3. **Strict Domain-Driven Boundaries**:
   - To keep modules maintainable, the Google Calendar logic is encapsulated strictly within `modules/sync/google-calendar`.
   - **Unified API**: All future modules (like Daily Journal, Leave Tracker, etc.) must communicate with Google Calendar exclusively via the public static methods of the `GoogleCalendarService` class. Direct queries to Google's endpoints are forbidden.

---

## 2. Lessons Learned

* **Persistent Module Mocks vs. Property Overrides**:
  - During unit testing with Bun, we learned that module-level mocking (`mock.module`) is globally persistent across files. This caused test cross-pollution.
  - We transitioned to **JavaScript property overriding** for tests requiring mock services or database queries. Overriding class properties directly in `beforeEach` and restoring them in `afterEach` provides clean, isolated, and warning-free testing files.
* **Token Revocation Flow**:
  - Adding token revocation on disconnect (`/api/auth/google/disconnect`) is required for proper data hygiene, but it forces a new OAuth consent flow on reconnection. Google Cloud projects in "Testing" mode will block reconnection with `403: access_denied` unless the email is in the "Test Users" list.

---

## 3. Freeze Declaration & Future Scope

Going forward:
1. The `google-calendar` module is declared **Frozen**. No architectural changes, folder re-organizations, or scope adjustments will be accepted.
2. Only critical security hotfixes or bug resolutions are permitted.
3. All future modules wishing to display, schedule, or synchronize items with Google Calendar must use the exposed `GoogleCalendarService` interface.
