# Philosophy & Vision

This document details the underlying philosophy, product vision, and foundational pillars of Tracker OS.

---

## 1. Product Vision: A Personal Life Operating System

Most tools in the productivity and habit-tracking space are fragmented:
* You track habits in one app.
* You log weight in another.
* You check meetings in a calendar app.
* You write daily journals in a private note file.

Tracker OS is built on the premise that **your life is a unified stream of time**. It is a single, integrated interface designed to manage daily life, routines, habits, fitness, scheduling, and personal records in one workspace.

---

## 2. Core Pillars

### Pillar A: Local Ownership & Privacy First
* User data must not be harvested or analyzed by third-party tracking services.
* Database connections (Postgres/SQLite) belong to the user.
* Sensitive document storage (Secure Vault) is encrypted at rest using industry-standard **AES-256-GCM** keys so that only the user can inspect their personal documents.

### Pillar B: The Unified Chronological Timeline
* Tracker rejects the "widget dashboard" design in favor of a chronological **Today's Timeline**.
* Habits, calendar meetings, bill reminders, and medical doses are merged at runtime into a single sequential list.
* This matches the human brain's natural perception of the day: a sequence of events from morning to night.

### Pillar C: Capabilities over Categories
* Instead of hardcoding categories (e.g. "Work vs Life"), features are designed using dynamic, composition-based capabilities:
  * `COMPLETABLE`: Can be checked off.
  * `SCHEDULABLE`: Appears in calendar timelines.
  * `CALENDAR_SYNC`: Can sync to Google Calendar.
  * `QUANTIFIABLE`: Supports values like rupee amounts.

---

## 3. Engineering Philosophy

We treat the codebase with the same level of discipline as an enterprise application:
1. **Consistency**: We use reusable primitive blocks (`design-system/components/*`) to build interfaces.
2. **Defensive Coding**: We protect database states using client query hooks, type safety, and strict environment validation rules.
3. **Decoupled Extensions**: When adding domains (like Journals or Leaves), we hook them into the timeline using foreign keys on the activity logs instead of polluting the core habit engines with specialized columns.
