# Canonical Date, Time, and Timezone Policy

## Overview

Tracker manages complex time-based domains: calendar events, habit recurrences, journal entries, leave tracking, weight logs, and offline mutations. To eliminate timezone drift, midnight boundary clipping, and cross-device inconsistencies, this policy establishes canonical classifications, storage patterns, serialization rules, and operational constraints across the entire application.

---

## 1. Core Classifications

Every temporal field in Tracker is classified into exactly one of four categories:

### A. Instant (Absolute Point in Time)
* **Definition**: A specific physical instant on the global timeline, independent of geographic location.
* **Examples**: `createdAt`, `updatedAt`, `deletedAt`, `CalendarEvent.start` (for timed events), `CalendarEvent.end`, `WorkSession.startTime`, `Payment.paidAt`.
* **Database Representation**: PostgreSQL `TIMESTAMP(3) WITH TIME ZONE` (Prisma `DateTime`).
* **Storage Invariant**: Always persisted and stored in UTC.
* **API / Wire Serialization**: Strict ISO 8601 UTC string with trailing `Z` (e.g., `2026-09-20T12:30:00.000Z`).
* **Client Rendering**: Converted to the user's active timezone for display using `date-fns` or `Intl.DateTimeFormat`.

### B. Local Date (Calendar Day without Time)
* **Definition**: A calendar day on the Gregorian calendar without any associated time-of-day or timezone offset. "September 20, 2026" is the same calendar day regardless of whether it is viewed in Tokyo, London, or New York.
* **Examples**: `ActivityLog.date`, `LeaveRecord.startDate`, `LeaveRecord.endDate`, `WeightRecord.date`, `JournalEntry.date`.
* **Database Representation**: `String` formatted as `YYYY-MM-DD` (or anchored to UTC noon `12:00:00Z` if legacy DateTime column).
* **Storage Invariant**: Never store as UTC midnight (`00:00:00Z`) because negative UTC offsets (e.g., America/New_York UTC-5) shift midnight backward to the previous calendar day.
* **API / Wire Serialization**: Exact `YYYY-MM-DD` string (e.g., `"2026-09-20"`).
* **Arithmetic**: Always use UTC-based arithmetic utilities (`addUTCDays`, `diffUTCDays` from `@/lib/recurrence`) to prevent daylight saving time (DST) shifts from adding 23 or 25 hours.

### C. All-Day Calendar Event
* **Definition**: An event spanning one or more full calendar days without a specific start or end hour.
* **Examples**: `CalendarEvent` with `allDay: true` (Holidays, Vacations, Full-day milestones).
* **Database Representation**: Prisma `CalendarEvent` (`allDay: true`, `start: DateTime`, `end: DateTime`).
* **Storage Invariant**: Anchored at UTC noon (`12:00:00.000Z`) of the respective start and end dates. This guarantees that across all standard timezones (UTC-12 to UTC+14), extracting the calendar day never crosses midnight.
* **Google Calendar Synchronization**:
  * Outbound: Serialized as Google `date` objects: `{ start: { date: "YYYY-MM-DD" }, end: { date: "YYYY-MM-DD" } }`.
  * Inbound: Google events with `start.date` (no `dateTime`) are parsed using `parseAllDayDate` directly to UTC noon.

### D. Zoned / Wall-Clock Datetime
* **Definition**: A local wall-clock time associated with an explicit IANA timezone identifier.
* **Examples**: Scheduled recurring reminders, recurring habits ("Every day at 08:00 AM Europe/London").
* **Storage Invariant**: Wall-clock time string (`"08:00"`) paired with explicit `timezone: string` (e.g., `"Europe/London"`).
* **Evaluation**: Evaluated against the current local date in that specified timezone.

---

## 2. Invariants & Rules

### Rule 1: No Naked `new Date(...)` or `toISOString()` Combinations
Do not construct dates by concatenating raw strings with `new Date(dateStr + 'T00:00:00')` without going through `@/lib/dateUtils`.
Use:
- `createLocalDateTime(dateStr, timeStr)` for constructing local datetimes.
- `toYMD(date)` for extracting UTC-safe `YYYY-MM-DD`.
- `todayYMD()` for current user local calendar day.
- `parseAllDayDate(dateStr)` / `formatAllDayDate(date)` for all-day events.

### Rule 2: Midnight Boundary Invariance
- Events scheduled at `00:00` belong to the new day.
- Events ending at `23:59` or `23:59:59` belong to that day.
- Midnight events must never be shifted to the preceding day due to timezone translation.

### Rule 3: Deterministic Recurrence
Habit and task recurrences are calculated strictly via `analyzeRecurrence` in `@/lib/recurrence.ts`.
Occurrences are generated on discrete `YYYY-MM-DD` strings. Time-of-day offsets and daylight saving transitions have zero impact on occurrence generation.

### Rule 4: Google Calendar Round-Trip Preservation
- Timed events retain their RFC 3339 / ISO 8601 instant representations.
- All-day events preserve their `date` string representation (`YYYY-MM-DD`) without gaining time components or shifting days during synchronization.

### Rule 5: Offline Mutation Queue Determinism
Mutations recorded while offline must store both:
1. `clientTimestamp`: The UTC instant of mutation generation (`Date.now()`).
2. Domain date fields in canonical format (`YYYY-MM-DD` or ISO 8601 instant).
Replay on the server respects the domain date rather than re-evaluating the current time.
