# Calendar Redesign & DayLogsModal Performance Optimization

This document outlines the performance optimization and visual overhaul of the Local Calendar, focusing on client-side timeline compilation, custom status-cycling, and the new database event model.

---

## 1. Context & Rationale

Prior to this redesign, clicking on any day in the calendar component opened a modal that initiated a blocking API query to `/api/calendar/day`. This approach introduced network latency, forced rendering delays, and caused synchronization mismatches where local tasks and templates failed to populate on initial load.

The redesigned architecture resolves this by using **client-side computation** on already-loaded workspace state, combined with background fetches for supplementary aggregates.

---

## 2. Architecture & Timeline Compilation

Instead of requesting completed timeline occurrence items from the server, the client utilizes raw templates and log states already loaded by the page wrapper.

1. **Reconstructive Analysis**: The client runs `analyzeRecurrence` using all historical log details on the fly.
2. **Timeline Generation**: The system evaluates these calculations using the dashboard helper `generateTimeline` to produce a finalized list of `TimelineItem` occurrences for that day.
3. **Lazy-Load Aggregates**: Secondary information (work status details, weight entries, and journal titles) is retrieved asynchronously from `/api/calendar/day` without blocking initial modal rendering.

```text
               +----------------------------------+
               |      Open DayLogsModal.tsx       |
               +----------------------------------+
                                |
             +------------------+------------------+
             |                                     |
             v                                     v
   [Instant Sync Path]                   [Lazy Async Path]
Read: `templates`, `logs`, `allLogs`     Fetch: /api/calendar/day (in background)
Run: `analyzeRecurrence()`               Fetch: Leave / Weight / Journal Details
Run: `generateTimeline()`                Populate: Day Summary Card
Render: Task Timeline Card Grid
```

---

## 3. UI Redesign & Styling Details

The interface layout adheres strictly to custom **Shadcn Style** design system tokens matching `TodayDashboard.tsx`:

* **Left Indicator Strip**: A colored vertical strip representing the status (green for completed, red for canceled, blue for postponed, template-specific color for cleared).
* **Interactive Status-Cycling Checkbox**: An active button cycling statuses directly in-place:
  * `Cleared` ➔ `Done` ➔ `Canceled / Skipped` ➔ `Postponed` ➔ `Cleared`.
* **Activity & Category Icons**: Renders template category icons (`Icon` components) using HSL color mapping wrappers via `getTemplateColorClasses`.
* **Streak Indicators**: Displays fires (`🔥`) with streak counters for habits with consecutive completions.
* **Timed Badges**: Timed items show explicit durations (e.g. `09:30 • 30m`) using structured time offsets.

---

## 4. Schema & Data Model Updates

A dedicated `CalendarEvent` table handles arbitrary tasks, meetings, or external integrations:

```prisma
model CalendarEvent {
  id               String   @id @default(uuid())
  userId           String
  title            String
  start            DateTime
  end              DateTime
  allDay           Boolean  @default(false)
  type             String   @default("TASK") // TASK, MEETING, etc.
  color            String?
  externalId       String?
  externalProvider String?
  externalMetadata Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  deletedAt        DateTime?

  @@index([userId])
}
```

### Mutation API Actions
Lightweight Server Actions reside in `app/actions/calendar.ts`:
* `createCalendarEventAction(data)`: Creates a scheduled meeting or custom task event.
* `updateCalendarEventAction(id, data)`: Modifies dates, times, descriptions, or color tags.
* `deleteCalendarEventAction(id)`: Removes the event record.

---

## 5. Verification & Testing

* **Unit Testing**: Run `bun test` to execute recurrence calculations, date shifts, and provider-independent parsing rules.
* **TypeScript & Linting**: Built and type-checked via `bunx tsc --noEmit` and `eslint` to ensure zero compilation or styling errors.
