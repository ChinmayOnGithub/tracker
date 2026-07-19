# Philosophy & Vision

> **Root concept**: [SPEC.md §0](../../SPEC.md#0-what-is-tracker) — "Everything a person does occurs in time. Tracker's job is to be the authoritative record of that time."

---

## 1. What Tracker Is

Tracker is a **Time-Centric Personal Operating System**.

Most productivity tools are fragmented by design:
- Habits tracked in one app.
- Weight logged in another.
- Meetings in a calendar.
- Thoughts in a private notes file.
- Documents in a cloud drive.

The result is that your life is scattered across five applications, none of which know about each other.

Tracker's founding insight is different:

> Your life is a unified stream of time. Every meaningful event — completing a habit, logging a weight, attending a meeting, writing a reflection — is simply an *event that occurred at a specific moment*. The only thing that connects them all is time.

This is not a habit tracker with journal bolted on. It is a **personal operating system where time is the primary key**.

---

## 2. The Three-Layer Mental Model

Understanding Tracker's architecture starts with understanding its three runtime layers. They have different lifetimes, different owners, and different rules.

```
┌─────────────────────────────────────────────────────────┐
│  PERSISTENT LAYER                                       │
│  Long-lived. Stored in the database. The ground truth.  │
│                                                         │
│  Template · Record · JournalEntry · WeightRecord        │
│  Note · VaultFile · Integration · User                  │
└─────────────────────────────────────────────────────────┘
                         ↕
┌─────────────────────────────────────────────────────────┐
│  RUNTIME LAYER                                          │
│  Short-lived. Computed on request. Never persisted.     │
│                                                         │
│  Occurrence · Timeline · Dashboard State                │
│  Search Results · Insights · Agenda · Notifications     │
└─────────────────────────────────────────────────────────┘
                         ↕
┌─────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                     │
│  Stateless UI. Driven entirely by the runtime layer.    │
│                                                         │
│  Cards · Panels · Widgets · Dialogs · Pages · Drawers   │
└─────────────────────────────────────────────────────────┘
```

This separation is not cosmetic. It is what allows Tracker to show you a perfect Timeline for any date in history without storing thousands of future scheduled rows — the Runtime Layer recomputes it on demand from the Persistent Layer's rules.

---

## 3. Core Pillars

### Pillar A — Local Ownership & Privacy First

User data must not be harvested or analyzed by third-party tracking services.
- Database connections (SQLite / Postgres) belong to the user.
- Sensitive document storage (Secure Vault) is encrypted at rest using **AES-256-GCM**.
- External integrations (Google Calendar) are read-only sources. Tracker never mirrors their data into its own database permanently.

### Pillar B — The Unified Chronological Timeline

Tracker rejects the "widget dashboard" design in favor of a single, ordered **Today Timeline**.

Habits, calendar events, bill reminders, medical doses, and weight logs are merged at runtime into one sequential list — ordered by time, not by category. This matches the human brain's natural perception of a day: a sequence of events from morning to night.

The Timeline is the product. Everything else serves it.

### Pillar C — Capabilities Over Categories

Instead of hardcoding rigid categories (`Work`, `Health`, `Finance`), features are designed using dynamic, composable capabilities:

| Capability | What it means |
|---|---|
| `COMPLETABLE` | Can be checked off |
| `SCHEDULABLE` | Appears on the Timeline |
| `QUANTIFIABLE` | Carries a numeric value |
| `SYNCABLE` | Can push to an external calendar |
| `ENCRYPTABLE` | Encrypted at rest |
| `SEARCHABLE` | Findable via global search |
| `AUDITABLE` | Every mutation is logged |

A Journal entry is `COMPLETABLE + SCHEDULABLE + SEARCHABLE + AUDITABLE`.  
A Weight log is `COMPLETABLE + SCHEDULABLE + QUANTIFIABLE + AUDITABLE`.  
A Vault document is `ENCRYPTABLE + SEARCHABLE + AUDITABLE`.

Modules stop being unique snowflakes. They become compositions of shared traits.

---

## 4. Engineering Philosophy

1. **Consistency**: Reusable primitive blocks (`design-system/components/*`) build every interface. No ad-hoc styling in feature components.
2. **Defensive Coding**: The Prisma client has query interceptors blocking hard-deletes and unscoped mutations. Session utilities enforce user-scoped access on every query.
3. **Decoupled Extensions**: Domain modules hook into the Timeline via foreign keys on `ActivityLog`, not by polluting the core engine with specialized columns. A Journal becoming a "completed task" requires no changes to the habit engine.
4. **Events for Side Effects**: The Domain Event Bus (`lib/events.ts`) wires together cross-cutting concerns (syncing to Google Calendar, sending notifications) without creating import dependencies between modules.

---

## 5. Design Aesthetic

Tracker aims to feel like a premium native application:
- **Dark mode first**, with full light mode support via CSS token variables.
- **High-density information** — more content, less chrome. Inspired by Linear and Things 3.
- **Micro-interactions** on every interactive element — hover scales, state transitions, optimistic updates.
- **Zero perceived latency** — all checkbox and status interactions update optimistically, writing to the database in the background.

---

## See Also

| Document | What it covers |
|---|---|
| [SPEC.md](../../SPEC.md) | Precise definitions of all domain concepts |
| [Core Domain.md](./Core%20Domain.md) | Entity diagrams and lifecycle rules |
| [architecture.md](../02-architecture/architecture.md) | System layers, request flow, patterns |
| [AI Constitution.md](../07-ai/AI%20Constitution.md) | Engineering laws and quality gates |
