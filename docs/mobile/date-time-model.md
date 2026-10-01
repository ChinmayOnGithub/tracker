# Canonical Date & Time Domain Model

This document specifies the canonical date, time, and timezone domain model for Tracker OS across Web and Mobile.

---

## 1. Core Principles

1. **Date Strings Are Always YYYY-MM-DD**:
   - Calendar dates (Today, task dates, habit occurrences, log dates) are formatted strictly as `YYYY-MM-DD`.
   - Never use localized date strings (`MM/DD/YYYY` or `DD.MM.YYYY`) for internal state, network DTOs, or database columns.
2. **Timestamps Are Always ISO-8601 UTC**:
   - Specific points in time (created/updated at, event starts, timer intervals) are stored and transmitted in UTC format: `YYYY-MM-DDTHH:mm:ss.sssZ`.
3. **Timezone Awareness**:
   - Dates must be evaluated relative to the user's configured IANA timezone (e.g. `America/New_York`, `Asia/Kolkata`, `Europe/London`).
   - If user timezone is not yet configured, fall back to `Intl.DateTimeFormat().resolvedOptions().timeZone` or `UTC`.

---

## 2. Canonical Representations

| Entity | Canonical Format | Example | Description |
|---|---|---|---|
| **Task / Activity Date** | `string` (`YYYY-MM-DD`) | `"2026-10-02"` | Pure calendar day independent of UTC clock offset. |
| **All-Day Event Start** | `Date` (UTC midnight) | `2026-10-02T00:00:00.000Z` | Start boundary of the day. |
| **All-Day Event End** | `Date` (UTC day end) | `2026-10-02T23:59:59.999Z` | End boundary (subtracted by 1ms to prevent overlapping into next day). |
| **Timed Event Start** | `Date` (UTC timestamp) | `2026-10-02T13:30:00.000Z` | Precise moment the meeting/task starts. |
| **Timed Event End** | `Date` (UTC timestamp) | `2026-10-02T14:30:00.000Z` | Precise moment the meeting/task ends. |
| **User Timezone** | `string` (IANA name) | `"America/New_York"` | Governs midnight boundary calculation. |

---

## 3. Date Arithmetic & Midnight Boundaries

### UTC-Safe Date Arithmetic:
Never use native `date.setDate(date.getDate() + 1)` directly on local Date objects because local clock shifts (e.g. DST autumn/spring 23h or 25h days) can distort date calculations.

Use pure UTC arithmetic from `lib/recurrence.ts`:
```ts
export function addUTCDays(dateStrOrObj: string | Date, days: number): string {
  const d = typeof dateStrOrObj === 'string' ? new Date(`${dateStrOrObj}T00:00:00Z`) : new Date(dateStrOrObj)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
```

### Midnight Boundary Rule:
- When a user crosses `23:59:59` to `00:00:00` in their local timezone:
- The app must re-evaluate today's date (`todayStr`).
- Due activity occurrences for the new day must be computed.
- The previous day's uncompleted non-daily items that were not postponed remain as historical pending occurrences or move according to recurrence analysis.

---

## 4. WorkSession Start Invariant

When a user logs a work session with a manual or retroactive in-time:
$$\text{effectiveStart} = \text{Date}(\text{date} + \text{"T"} + \text{inTime})$$
$$\text{elapsed} = \max(0, \lfloor(\text{now} - \text{effectiveStart}) / 1000\rfloor)$$

- **Invariant**: The user-entered start time (`inTime`) anchors the elapsed duration calculation.
- The client and server must not generate independent competing start timestamps.
