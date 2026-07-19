# Tracker Platform Specification

**Version**: 1.0  
**Status**: Canonical  
**Audience**: Engineers, Architects, AI Agents, Technical Reviewers

> This is the **single source of truth** for Tracker OS.  
> Every other document — architecture, design system, engineering rules, AI constitution, feature specs — references this document rather than redefining its concepts.  
> If a concept is defined here, it is defined *only* here.

---

## 0. What Is Tracker?

Tracker is a **Time-Centric Personal Operating System**.

It is not a habit tracker. It is not a journal. It is not a calendar.  
Those are *modules* — implementations of capabilities.

The foundational insight is this:

> **Everything a person does occurs in time. Tracker's job is to be the authoritative record of that time.**

Weight is not a "health metric." It is an *event that occurred at a point in time*.  
A journal entry is not a "note." It is an *event that occurred at a point in time*.  
A Google Calendar meeting is not external data. It is an *event that occurs in time* — it just has an external source.

This realization produces the entire architecture. Everything flows from it.

---

## 1. Domain Concepts (Ubiquitous Language)

These terms have precise definitions. Use them consistently. Do not invent synonyms.

---

### 1.1 Time

**Definition**: The universal axis around which all Tracker data is organized.

- All entities in Tracker are either anchored to a specific point in time, or they define rules for recurring points in time.
- Time is always stored in UTC. Display is localized.
- "Today" is a runtime concept, never a database concept.

**Invariants**:
- History is immutable. A past `Record` cannot be edited in a way that erases that it occurred.
- Future occurrences are never persisted. Only the rules that generate them are stored.

---

### 1.2 Template

**Definition**: A persistent rule that describes *what* should recur and *when*.

- Also called an `ActivityTemplate` in the database schema.
- Encodes recurrence rules: `daily`, `weekly`, `monthly`, `yearly`, `custom`, `milestone`.
- A Template is a **blueprint**, not an event. It has no meaning on its own.
- Templates are owned by a User and stored in the local database.

**Lifecycle**: `Created → Active → Paused → Deleted (soft)`

**Capabilities a Template may have**:
- `COMPLETABLE` — can be checked off
- `SCHEDULABLE` — appears in a timeline
- `QUANTIFIABLE` — carries a numeric value (amount, weight, reps)
- `SYNCABLE` — can be pushed to an external calendar

---

### 1.3 Occurrence

**Definition**: A transient, runtime instance of a Template evaluated for a specific calendar day.

- Occurrences are **never stored in the database**.
- They are computed at request time by the recurrence engine (`lib/recurrence.ts`).
- An Occurrence becomes meaningful only when a user acts on it, producing a `Record`.

**Key rule**: Storing future occurrences is explicitly prohibited. The recurrence engine is the only source for future schedule data.

---

### 1.4 Record

**Definition**: A persistent, immutable fact that something occurred at a specific point in time.

- Also called an `ActivityLog` in the database schema.
- A Record is created when a user acts on an Occurrence (completes, skips, postpones, pays).
- A Record may carry a `status`: `done`, `skipped`, `postponed`, `paid`, `renewed`.
- A Record may reference a domain artifact: a `WeightRecord`, a `JournalEntry`, or a leave request.

**Key invariant**: Records are the historical ground truth of Tracker. They must never be hard-deleted from tables that support soft-deletion.

---

### 1.5 Timeline

**Definition**: The runtime, chronologically-ordered list of Occurrences and Events for a specific day, merged from all sources.

- The Timeline is a **presentation construct**, not a database entity.
- It is assembled by `lib/services/TimelineService.ts` at request time by merging:
  1. Template Occurrences (from local recurrence engine)
  2. External Events (from Provider integrations — e.g. Google Calendar)
  3. Orphaned Records (logs from days they were not scheduled, e.g. a spontaneous weight entry)
- The Timeline does not care about source. It shows everything that belongs to a day.

---

### 1.6 Event

**Definition**: A time-bounded occurrence from an *external* source that appears on the Timeline.

- Events originate from Providers (Google Calendar, future: Outlook, Apple Calendar).
- Events are **never stored** in the local database. They are fetched, cached transiently, and merged into the Timeline at runtime.
- Events carry a `source` identifier so the UI can label them (e.g. "from Google Calendar").

---

### 1.7 Provider

**Definition**: An adapter that connects an external data source to Tracker's Timeline.

- Providers implement the `ICalendarProvider` interface from `lib/providers.ts`.
- Providers are **read-only sources of Events**. They never own domain data.
- Providers may support write-back (syncing completion status to Google Calendar).
- Current providers: `GoogleCalendarProvider`
- Future providers: Outlook, Apple Calendar, Notion, GitHub

---

### 1.8 Record Artifact

**Definition**: A domain-specific payload attached to a Record.

A Record can be enriched by one of the following artifacts:

| Artifact | Table | What it stores |
|---|---|---|
| `WeightRecord` | `WeightRecord` | kg/lbs value, optional notes |
| `JournalEntry` | `JournalEntry` | Rich text, mood, gratitude, reflections |
| `LeaveRecord` | *(future)* | Leave type, duration, approval status |

The Record holds the foreign key. The Artifact holds the payload. They are always accessed together.

---

### 1.9 Capability

**Definition**: A composable behavioral trait that a Template or Module may possess.

Capabilities replace "categories." Instead of asking "is this a Fitness feature or a Finance feature?", ask "what capabilities does this feature use?"

| Capability | Meaning |
|---|---|
| `COMPLETABLE` | Can be checked off with a status |
| `SCHEDULABLE` | Appears on a Timeline |
| `QUANTIFIABLE` | Carries a numeric value (amount, weight, distance) |
| `SYNCABLE` | Can be pushed to an external calendar provider |
| `ENCRYPTABLE` | Content is encrypted at rest |
| `SEARCHABLE` | Can be found via global search |
| `TAGGABLE` | Can be associated with user-defined tags |
| `AUDITABLE` | Every mutation is logged to an audit trail |
| `ATTACHABLE` | Can have file attachments |
| `VERSIONED` | Previous states are preserved |

---

### 1.10 Widget

**Definition**: A self-contained UI panel that surfaces data from one or more modules in a compact, focused format.

- Widgets are read-only display components. They do not own data.
- Widgets are composed in the Dashboard grid.
- Example widgets: `WeightWidget`, `JournalWidget`, `SecureVaultWidget`, `AgendaWidget`.

---

### 1.11 Module

**Definition**: A bounded domain feature containing its own service logic, actions, types, and components.

- Located under `modules/<domain>/<feature>/`.
- Every module must expose a public barrel file (`index.ts`) with its public API.
- Modules never import other modules directly. Cross-module communication goes through `lib/services/*` or the Event Bus.

---

### 1.12 Integration

**Definition**: The local credentials and configuration record connecting Tracker to an external Provider.

- Example: `GoogleCalendarCredential` table stores encrypted access/refresh tokens.
- Integrations are owned by the User.
- Integrations are not Events. They are persistent configuration.

---

### 1.13 Ownership

**Definition**: The principle that every piece of data in Tracker is owned by exactly one entity.

Rules:
1. A `User` owns all their `Templates`, `Records`, `JournalEntries`, `WeightRecords`, and `Integrations`.
2. External Providers **never** own data. They are queried; their data is cached transiently.
3. A `Template` owns its `Records` through a foreign key relationship.
4. When a User is deleted (soft), all their owned data must also be soft-deleted.

---

### 1.14 History

**Definition**: The complete, ordered set of Records for a User across all time.

- History is the **purpose** of keeping Records.
- The Calendar view surfaces History — showing what occurred on any given past date.
- History is immutable: a past Record's `date` and `status` must never be silently overwritten. Create a new Record or update a specific field only.

---

## 2. The Three Layers

Tracker's runtime separates cleanly into three layers. These layers must never bleed into each other.

```
┌─────────────────────────────────────────────────────────┐
│  PERSISTENT LAYER                                       │
│  What is stored. Long-lived. Owned by the database.     │
│                                                         │
│  User · Template · Record · JournalEntry                │
│  WeightRecord · Note · Integration · VaultFile          │
└─────────────────────────────────────────────────────────┘
                         ↕ (assembled at request time)
┌─────────────────────────────────────────────────────────┐
│  RUNTIME LAYER                                          │
│  What is computed. Short-lived. Never persisted.        │
│                                                         │
│  Occurrence · Timeline · Dashboard State                │
│  Search Results · Notifications · Insights · Agenda     │
└─────────────────────────────────────────────────────────┘
                         ↕ (rendered from runtime state)
┌─────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                     │
│  What the user sees. Stateless. Driven by runtime.      │
│                                                         │
│  Cards · Panels · Widgets · Dialogs · Pages · Drawers   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Architectural Invariants

These are truths that must never be violated, regardless of feature requirements or performance pressure. Each has a stable ID for cross-referencing.

### `INV-001` — Occurrences are never stored.
If you find yourself persisting a future scheduled event, you are breaking the architecture.
> **Why?** Storing future occurrences creates a synchronization problem — when a user edits a Template's recurrence rule, every stored future occurrence must be found and updated. By computing Occurrences on demand, the recurrence engine is the single source of truth and Template edits take effect immediately with zero cleanup.

### `INV-002` — History is immutable.
A Record's date and original status are facts. They may be annotated, not erased.
> **Why?** Tracker's value proposition is *being the authoritative record of your time*. If past Records can be silently erased, that record is untrustworthy. Soft-deletion preserves the fact that something happened while allowing the user to "undo" it.

### `INV-003` — Providers never own data.
Google Calendar is a source. It is never a store. If Google goes offline, Tracker's own Records are unaffected.
> **Why?** External APIs change, rate-limit, revoke access, or shut down. If Tracker's core data depends on Google's availability, a token expiry could break the entire Timeline. By treating providers as ephemeral read-only sources, Tracker degrades gracefully — external events disappear, but local history stays intact.

### `INV-004` — Modules never bypass services.
A module action never writes to the database directly. It always delegates to a service in `lib/services/`.
> **Why?** Services are where authorization checks, event publishing, and audit logging happen. If a module writes to Prisma directly, it skips all of those. One missing `userId` check in a direct query is a data leak. The service layer is the chokepoint where security is enforced.

### `INV-005` — The Timeline is assembled, not stored.
The Timeline is a view over the Persistent Layer. It has no primary key.
> **Why?** The Timeline merges data from multiple sources (local Templates, Google Calendar, orphaned Records). Storing it would require keeping it in sync with every source — a classic cache invalidation problem. By assembling it on demand, it is always fresh and always correct.

### `INV-006` — Every mutation is user-scoped.
No query may write data without a verified user session. No query may read another user's data.
> **Why?** This is the simplest security invariant and the hardest to retrofit. If even one query runs without a `userId` filter, it can leak or corrupt another user's data. Enforcing this universally means security is a property of the system, not of individual developers remembering to add filters.

### `INV-007` — Soft-deletion is universal.
Any model with a `deletedAt` column must never be hard-deleted.
> **Why?** Hard deletes are irreversible. They break audit trails, corrupt foreign key references, and make it impossible to recover from user mistakes. The Prisma query guard in `lib/db.ts` enforces this at runtime because relying on developer discipline alone is not enough.

### `INV-008` — The Event Bus is for side effects, not control flow.
Core mutations complete before events are published. Events trigger reactions, not the primary action.
> **Why?** If the primary mutation depends on an event subscriber succeeding (e.g., Google sync), then a Google API failure would prevent a local database write. By committing first and publishing events after, the core operation always succeeds. Side effects like syncing can fail, retry, or be skipped without corrupting local state.

---

## 4. Capabilities by Module

| Module | COMPLETABLE | SCHEDULABLE | QUANTIFIABLE | SYNCABLE | ENCRYPTABLE | SEARCHABLE | AUDITABLE |
|---|---|---|---|---|---|---|---|
| Habits / Activities | ✓ | ✓ | — | ✓ | — | ✓ | ✓ |
| Journal | ✓ | ✓ | — | — | — | ✓ | ✓ |
| Weight | ✓ | ✓ | ✓ | — | — | — | ✓ |
| Secure Vault | — | — | — | — | ✓ | ✓ | ✓ |
| Google Calendar | — | ✓ | — | ✓ | — | ✓ | — |
| Notes | — | — | — | — | — | ✓ | — |
| Links | — | — | — | — | — | ✓ | — |
| Leave | ✓ | ✓ | — | ✓ | — | — | ✓ |

---

## 5. Future Vision

The following represents the intended evolution of Tracker over the next 3–5 years. Architecture decisions today must not block these capabilities.

| Phase | Capability |
|---|---|
| **Near-term** | Mobile app (Expo) with local SQLite + delta sync |
| **Near-term** | Offline-first PWA with background sync |
| **Mid-term** | Notification system (push, email digest) |
| **Mid-term** | Additional Providers (Outlook, Apple Calendar, Strava) |
| **Mid-term** | Workout module with sets/reps quantification |
| **Long-term** | AI Insight Engine — pattern recognition across History |
| **Long-term** | Watch / Wearable companion app |
| **Long-term** | Multi-user / shared Timelines (family, team) |
| **Long-term** | Plugin API for third-party modules |

---

## 6. See Also

| Document | What it covers |
|---|---|
| [Philosophy.md](./docs/01-foundation/Philosophy.md) | Product vision and engineering philosophy |
| [Core Domain.md](./docs/01-foundation/Core%20Domain.md) | Domain entity diagrams and lifecycle rules |
| [architecture.md](./docs/02-architecture/architecture.md) | System layers, request flow, dependency rules |
| [AI Constitution.md](./docs/07-ai/AI%20Constitution.md) | Architectural laws and engineering quality gates |
| [docs/09-patterns/](./docs/09-patterns/) | Reusable implementation patterns |
| [prisma/schema.prisma](./prisma/schema.prisma) | Persistent layer ground truth |
