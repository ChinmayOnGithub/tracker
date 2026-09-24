# Tracker Canonical Commercial Contract & Source of Truth

> **Product Mandate**: Nothing may be advertised as a paid feature unless it actually works end-to-end. Free is a real, high-utility product. Pro features must be visible but locked to Free users, backed by strict server-side authorization, and accompanied by automated regression tests.

---

## 1. Commercial Plan Summary

| Dimension | Free Tier | Pro Tier (Monthly ₹99 / Annual ₹799) |
| :--- | :--- | :--- |
| **Introductory Offer** | — | ₹29 for first month (server-enforced once per account) |
| **Active Habits / Activities** | Up to 10 active | Up to 10,000 active |
| **Daily Tasks** | Up to 50 daily | Up to 10,000 daily |
| **Journal Access** | Read-only historical entries & global search | Full daily writing, rich text, archive exports (JSON/MD) |
| **Notes & Workspace** | Read-only historical notes & global search | Full notes creation, editing, workspace management |
| **Calendar** | Standard local calendar + read Google events | Two-way Google Calendar synchronization & writebacks |
| **Sync Engine** | Standard offline-first local sync (all users) | Standard offline-first local sync (all users) |
| **Secure Vault** | *Internal only (not commercialized)* | *Internal only (not commercialized)* |

---

## 2. Canonical Commercial Feature Contracts

### Feature 1: Habit & Activity Tracking Capacity
- **Description**: Creation and daily tracking of recurring habits, routines, and custom activities.
- **Free Availability**: Yes (capped at 10 active activities).
- **Pro Availability**: Yes (up to 10,000 active activities).
- **Limit Key**: `limits.active_activities` (and alias `limits.activities_active`).
- **Server Enforcement**: `lib/services/ActivityService.ts` (`createActivity`, `updateActivity`) invokes `EntitlementService.checkLimit(userId, 'active_activities', currentCount)`.
- **Implementation Location**: `lib/services/ActivityService.ts`, `app/actions/activities.ts`.
- **UI Entry Point**: `/activities`, `components/ActivityManager.tsx`.
- **Automated Tests**:
  - Free rejection on 11th activity: `tests/commercial-workflows.test.ts`
  - Pro capability beyond 10: `tests/commercial-workflows.test.ts`
- **Manual Verification**: On a Free account, create 10 activities; attempting to create the 11th must show the upgrade limit modal/error. On a Pro account, creation continues past 10 without impediment.
- **Status**: **READY**

---

### Feature 2: Daily Tasks & Timeline Execution
- **Description**: Daily execution timeline, task checklists, and activity log completion.
- **Free Availability**: Yes (capped at 50 daily tasks created per calendar day).
- **Pro Availability**: Yes (up to 10,000 daily tasks).
- **Limit Key**: `limits.tasks_created_daily`.
- **Server Enforcement**: `app/actions/tasks.ts` (`createTask`) validates daily creation volume via `EntitlementService.checkLimit`.
- **Implementation Location**: `app/actions/tasks.ts`, `lib/services/TaskService.ts`, `lib/timeline/TimelineGenerator.ts`.
- **UI Entry Point**: `/today`, `components/TaskManager.tsx`, `components/TodayDashboard.tsx`.
- **Automated Tests**: `tests/commercial-workflows.test.ts`.
- **Manual Verification**: Tasks can be added and completed on the timeline without requiring a Pro license.
- **Status**: **READY**

---

### Feature 3: Advanced Journal (Writing & Archive Export)
- **Description**: Daily reflection, markdown journaling, mood tracking, and complete journal export.
- **Free Availability**: Read-only access to existing journal history and global search. Daily writing and export locked.
- **Pro Availability**: Full access to daily journal writing, rich text editing, and archive export.
- **Entitlement Key**: `features.advanced_journal` (and alias `features.advancedJournal`).
- **Server Enforcement**: `app/actions/journal.ts` (`saveJournalEntry`, `deleteJournalEntry`, `exportJournalArchive`) checks `EntitlementService.hasFeature(userId, 'advanced_journal')`. Rejections return a user-friendly upgrade error.
- **Implementation Location**: `lib/services/JournalService.ts`, `app/actions/journal.ts`.
- **UI Entry Point**: `/journal`, `components/JournalPanel.tsx`.
- **Automated Tests**:
  - Free rejection test: `tests/commercial-workflows.test.ts`
  - Pro success test: `tests/commercial-workflows.test.ts`
  - Global search historical access: `tests/master-search-journal-integration.test.ts`
- **Manual Verification**: Free users see a Pro upgrade card/badge on the journal writer; writing an entry returns an authorization error. Pro users can compose entries and export archives.
- **Status**: **READY**

---

### Feature 4: Notes & Workspace Creation
- **Description**: Note creation, rich editing, markdown formatting, and workspace organization.
- **Free Availability**: Read-only access to existing notes and global search. Note creation and mutation locked.
- **Pro Availability**: Full access to note creation, editing, and deletion.
- **Entitlement Key**: `features.unlimited_notes` (and alias `features.unlimitedNotes`).
- **Server Enforcement**: `app/actions/note.ts` (`createNote`, `updateNote`, `deleteNote`) checks `EntitlementService.hasFeature(userId, 'unlimited_notes')`.
- **Implementation Location**: `app/actions/note.ts`, `lib/services/NoteService.ts`.
- **UI Entry Point**: `/notes`, `components/NotesPanel.tsx`.
- **Automated Tests**:
  - Free rejection test: `tests/commercial-workflows.test.ts`
  - Pro success test: `tests/commercial-workflows.test.ts`
- **Manual Verification**: Free users see an upgrade banner in `/notes`; attempting to submit a note creates a rejected action. Pro users can create notes immediately.
- **Status**: **READY**

---

### Feature 5: Advanced Calendar (Two-Way Sync & Writeback)
- **Description**: Multi-calendar integration, two-way Google Calendar synchronization, and writebacks.
- **Free Availability**: Standard local calendar events (up to 5 daily), read-only Google event viewing when connected.
- **Pro Availability**: Up to 10,000 calendar events daily, two-way synchronization, and live event writebacks.
- **Entitlement Key**: `features.advanced_calendar` (and alias `features.advancedCalendar`).
- **Server Enforcement**: `app/actions/calendar.ts` validates `advanced_calendar` feature before executing writebacks or multi-provider synchronization.
- **Implementation Location**: `lib/services/CalendarSyncService.ts`, `app/actions/calendar.ts`.
- **UI Entry Point**: `/calendar`, `components/CalendarWrapper.tsx`.
- **Automated Tests**:
  - Free writeback rejection: `tests/commercial-workflows.test.ts`
  - Pro writeback success: `tests/commercial-workflows.test.ts`
  - Non-destructive disconnect: `tests/google-disconnect-safety-issue73.test.ts`
- **Manual Verification**: Connecting Google Calendar imports events. Free user writebacks fail server validation with Pro prompt. Disconnecting Google removes Google credentials/events while leaving all Tracker events completely intact.
- **Status**: **READY**

---

## 3. Delisted / Non-Commercial Items

### Secure Vault
- **Commercial Decision**: Removed completely from public pricing, comparison tables, billing settings, and sales promises.
- **Status**: **INTERNAL / NOT OFFERED COMMERCIALLY**
- **Action Taken**: Retained inside the codebase for future hardening, but zero commercial marketing or entitlement selling.

### Priority Cloud Sync
- **Commercial Decision**: Removed completely from marketing, pricing, and entitlement claims.
- **Status**: **REMOVED FROM COMMERCIAL MODEL**
- **Action Taken**: Local-first sync infrastructure (`SyncCoordinator.ts`) remains high-reliability core engineering for all users without charging or advertising an artificial "priority" lane.

---

## 4. Verification & Defense Principles
1. **Never rely on frontend-only checks**: The UI uses `useEntitlements()` for upgrade prompts and badges, but server actions (`app/actions/*`) always query `EntitlementService` before database mutations.
2. **Data Preservation on Downgrade**: If a Pro subscription expires or cancels, historical activities, notes, and journal entries are **NEVER deleted**. The user retains full read and search access.
3. **Canonical Authority**: Pricing UI reads from `lib/billing/plans.ts`, which defines canonical prices and limits. Entitlements derive from `lib/billing/entitlements.ts`.
