# System Architecture

> For domain concept definitions, read [SPEC.md](../../SPEC.md) first.  
> This document describes the *structural* and *runtime* architecture — how the layers connect, how requests flow, and what rules govern dependencies.

---

## 1. The Three-Layer Runtime Model

Tracker's runtime separates into three clean layers with different lifetimes, owners, and rules. See [Philosophy.md §2](../01-foundation/Philosophy.md#2-the-three-layer-mental-model) for the full explanation.

```
┌─────────────────────────────────────────────────────────┐
│  PERSISTENT LAYER                                       │
│  Long-lived. Owned by the database. The ground truth.   │
│                                                         │
│  Template · Record · JournalEntry · WeightRecord        │
│  Note · VaultFile · Integration · User                  │
│  File: prisma/schema.prisma                             │
└─────────────────────────────────────────────────────────┘
         ↕ assembled at request time by services
┌─────────────────────────────────────────────────────────┐
│  RUNTIME LAYER                                          │
│  Short-lived. Computed on request. Never persisted.     │
│                                                         │
│  Occurrence · Timeline · Dashboard State                │
│  Search Results · Insights · Agenda · Notifications     │
│  Files: lib/recurrence.ts, lib/services/TimelineService │
└─────────────────────────────────────────────────────────┘
         ↕ rendered from runtime state
┌─────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                     │
│  Stateless UI. Driven entirely by the runtime layer.    │
│                                                         │
│  Cards · Panels · Widgets · Dialogs · Pages · Drawers   │
│  Files: components/, modules/*/components/              │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Request Flow

Every user action flows through these layers in strict order:

```
Browser (Client Component)
         ↓ calls
Server Action (app/actions/*.ts)
  • Validates session (lib/session.ts)
  • Validates input
  • Delegates to service — contains NO business logic itself
         ↓ calls
Domain Service (lib/services/*.ts)
  • Orchestrates the mutation
  • Calls Prisma
  • Publishes domain events
         ↓ calls
Prisma ORM (lib/db.ts)
  • Query interceptors block hard-deletes and unscoped mutations
         ↓ writes
Database (SQLite dev / PostgreSQL prod)
         ↓ on success
Domain Event Bus (lib/events.ts)
  • Side effects fire: Google sync, notifications, cache invalidation
         ↓
Next.js router.refresh() → UI reflects new state
```

**Law**: Business logic lives in Services. Actions are thin. UI is stateless. See [AI Constitution.md — Law A1](../07-ai/AI%20Constitution.md#law-a1--the-mutation-flow-is-sacred).

---

## 3. Domain Event System

`lib/events.ts` implements a lightweight in-process pub/sub event bus. It is **not** a message queue — it is for loosely-coupled side effects within the same request lifecycle.

### Published Events

| Event | Published by | Consumed by |
|---|---|---|
| `ACTIVITY_CREATED` | ActivityService | ProviderService (Google sync) |
| `ACTIVITY_UPDATED` | ActivityService | ProviderService, NotificationService |
| `ACTIVITY_COMPLETED` | ActivityService | ProviderService (write-back to Google) |
| `ACTIVITY_DELETED` | ActivityService | ProviderService (delete from Google) |

### Design Rule

The primary mutation commits to the database **before** any event is published. Events trigger reactions, not the primary action. See [AI Constitution.md — Law A3](../07-ai/AI%20Constitution.md#law-a3--the-event-bus-is-for-reactions-not-control-flow).

```typescript
// CORRECT order
await db.activityLog.create({ data: { ... } })
eventBus.publish('ACTIVITY_COMPLETED', { ... })
```

### Resilience

Event bus subscribers are isolated. If one subscriber throws, others still execute. Errors are caught and logged per-subscriber.

---

## 4. Directory Structure & Dependency Rules

```
tracker/
├── app/                    # Next.js App Router (thin entry points)
│   ├── actions/            # Server Actions — input validation + service delegation
│   └── api/                # HTTP endpoints (OAuth callbacks, export/import, mobile sync)
│
├── lib/                    # Shared core — cross-cutting utilities and services
│   ├── db.ts               # Prisma client with query guards
│   ├── session.ts          # Auth session utilities
│   ├── recurrence.ts       # Recurrence rule evaluation engine
│   ├── events.ts           # Domain Event Bus
│   ├── providers.ts        # ICalendarProvider interface
│   ├── logger.ts           # Structured logging
│   ├── vault-crypto.ts     # AES-256-GCM encryption utilities
│   └── services/           # Domain service orchestrators
│       ├── ActivityService.ts
│       ├── TimelineService.ts
│       ├── ProviderService.ts
│       └── AuditService.ts
│
├── modules/                # Bounded domain features
│   ├── core/               # Auth, dashboard shell, search
│   ├── life/               # Journal, Weight, Leave, Habits, Documents
│   ├── fitness/            # Workout (future)
│   ├── knowledge/          # Notes, Tags
│   └── sync/               # Google Calendar, Mobile Sync
│
├── design-system/          # UI primitive components
│   ├── components/         # Button, Card, Input, Modal, Skeleton, EmptyState
│   └── tokens.css          # Global CSS variable design tokens
│
├── components/             # Page-level composite components (not primitives)
│   ├── TodayDashboard.tsx
│   ├── DashboardClient.tsx
│   └── DayLogsModal.tsx
│
└── prisma/                 # Database schema and migrations
    └── schema.prisma
```

### Dependency Direction Rules (strict)

```
app/  →  modules/  →  lib/  →  design-system/
```

| Import direction | Allowed? |
|---|---|
| `modules/` imports `lib/` | ✓ Yes |
| `lib/` imports `modules/` | ✗ No — circular |
| `design-system/` imports `modules/` | ✗ No — circular |
| `app/actions/` imports `lib/services/` | ✓ Yes |
| `modules/` imports other `modules/` internals | ✗ No — use barrels only |
| `components/` imports `design-system/` | ✓ Yes |
| `components/` imports `lib/` | ✓ Yes (services) |

---

## 5. Recurrence Engine

`lib/recurrence.ts` is the heart of the Runtime Layer. It takes a set of Templates and a target date, and produces an ordered array of Occurrences.

**Input**: `(templates: ActivityTemplate[], targetDate: Date, existingLogs: ActivityLog[])`  
**Output**: `Occurrence[]`

**Key behaviors**:
- Daily templates always produce an Occurrence on their active days.
- Postponed logs shift the next Occurrence by `+1 day` using `addUTCDays(log.date, 1)`.
- Templates with `isActive: false` or `deletedAt` set are excluded.
- The engine is **pure** — no database calls, no side effects. It can be called freely for any date.

---

## 6. Performance Optimizations

### Bulk Ownership Validation

When reordering templates (drag-and-drop), validating N template IDs was originally N sequential queries. Replaced with a single count query:

```typescript
const validCount = await db.activityTemplate.count({
  where: { id: { in: orderedIds }, userId: user.id }
})
if (validCount !== orderedIds.length) throw new Error('Unauthorized')
```
Result: **10× speedup** on reorder operations.

### Optimistic UI Updates

All checkbox and status mutations update the UI instantly via local `optimisticStatuses` state before the database write confirms. If the server write fails, the state rolls back. This produces **zero perceived latency** on interactions.

### Transactional Reorders

Bulk sort order updates use a Prisma transaction to ensure atomicity:

```typescript
await db.$transaction(
  orderedIds.map((id, index) =>
    db.activityTemplate.update({ where: { id }, data: { sortOrder: index } })
  )
)
```

---

## 7. Today Page Component Hierarchy

```
app/page.tsx (Server Component — fetches templates, logs, journal)
  └── DashboardClient (components/DashboardClient.tsx) — Client boundary
        ├── TodayDashboard (components/TodayDashboard.tsx)
        │     ├── Subtitle Engine (contextual countdown: overdue, active, next)
        │     ├── Timeline Feed (unified divide-y card container)
        │     │     └── TimelineItemRow
        │     │           ├── CheckboxCycler (optimistic state machine)
        │     │           ├── Icon · Title · Source Badge (Google label)
        │     │           └── HoverActionOverlay (edit/delete, opacity-0 → group-hover:opacity-100)
        │     └── Widget Grid
        │           ├── JournalPanel
        │           ├── WeightPanel (chart + BMI)
        │           └── SecureVaultWidget (recent files, recursive)
        └── DayLogsModal (components/DayLogsModal.tsx)
              ├── Recurrence re-evaluation for selected historical date
              ├── Status Cycling (identical to TodayDashboard)
              └── Auto-completion checks (journal written → journal task done)
```

---

## 8. Reusable Patterns Index

Rather than implementing features from scratch, use the established patterns:

| Pattern | Use when... |
|---|---|
| [Timeline Pattern](../09-patterns/Timeline%20Pattern.md) | Adding a new module that appears on the Today Timeline |
| [Quantifiable Pattern](../09-patterns/Quantifiable%20Pattern.md) | Module carries numeric measurements (weight, amount, reps) |
| [Provider Pattern](../09-patterns/Provider%20Pattern.md) | Connecting an external calendar or data source |
| [Secure Resource Pattern](../09-patterns/Secure%20Resource%20Pattern.md) | Storing encrypted files or sensitive credentials |
| [Audit Pattern](../09-patterns/Audit%20Pattern.md) | Adding structured logging and audit trails |

---

## 9. Known Architectural Debt

| Pain Point | Description | Recommended Fix |
|---|---|---|
| **Render-time Timeline calculation** | Recurrence is evaluated per-request. For heavy histories this could become slow. | Background worker that materializes a 7-day Occurrence window into a cache table on template change. |
| **Split action location** | Some actions live in `app/actions/`, others in `modules/*/actions.ts`. | Standardize: all actions in `modules/<domain>/actions.ts`. `app/actions/` becomes legacy shims only. |
| **No AuditLog table yet** | High-security events (vault downloads, credential revocations) are only logged to structured stdout. | Add `AuditLog` model. See [Audit Pattern.md](../09-patterns/Audit%20Pattern.md#future-audit-table). |

---

## See Also

| Document | What it covers |
|---|---|
| [SPEC.md](../../SPEC.md) | Domain definitions and architectural invariants |
| [Philosophy.md](../01-foundation/Philosophy.md) | Product vision and the three-layer model |
| [Core Domain.md](../01-foundation/Core%20Domain.md) | Entity lifecycles and the Postpone mechanics |
| [AI Constitution.md](../07-ai/AI%20Constitution.md) | Engineering laws and quality gates |
| [docs/09-patterns/](../09-patterns/) | All reusable implementation patterns |
| [prisma/schema.prisma](../../prisma/schema.prisma) | Persistent layer ground truth |
