# Tracker OS — AI Constitution

**Version**: 2.0  
**Status**: Canonical  
**Scope**: Every AI agent, subagent, and human engineer working on Tracker OS must strictly follow these laws. No feature, refactoring, or migration is complete unless it conforms.

> This document describes *how* Tracker evolves — not just what is forbidden.  
> For *what* Tracker is, read [SPEC.md](../../SPEC.md) first.

---

## Part I — Architectural Laws

These laws define the shape of every mutation, read, and side-effect in the system.

### Law A1 — The Mutation Flow is Sacred

Every state change in the system must flow through exactly these layers, in this order:

```
Client Component (UI)
       ↓
Server Action (app/actions/*.ts)
       ↓
Domain Service (lib/services/*.ts or modules/*/services/*.ts)
       ↓
Database via Prisma (lib/db.ts)
```

**Corollaries**:
- A Client Component must never call Prisma directly.
- A Server Action must never contain business logic. It validates input, calls a service, and returns.
- A Domain Service must never call another service's internal implementation. Use events or shared utilities from `lib/`.

### Law A2 — Modules are Islands

All domain features live inside `modules/<domain>/<feature>/`. Cross-module communication is only permitted via:
1. Public barrel files (`modules/<domain>/index.ts`).
2. Shared services in `lib/services/`.
3. The Domain Event Bus (`lib/events.ts`).

Direct imports between module internals are forbidden.

### Law A3 — The Event Bus is for Reactions, Not Control Flow

The Domain Event Bus (`lib/events.ts`) is used for loosely-coupled side effects only.  
The primary mutation must complete and commit to the database before any event is published.

```typescript
// CORRECT
await db.activityLog.create({ data: { ... } })
eventBus.publish('ACTIVITY_COMPLETED', { ... })

// WRONG — event published before database write confirmed
eventBus.publish('ACTIVITY_COMPLETED', { ... })
await db.activityLog.create({ data: { ... } })
```

### Law A4 — Server-Only Code Never Touches the Client Bundle

Server-only services (database drivers, cryptographic modules, session utilities) must never be exported from barrel files (`index.ts`) imported by `"use client"` components. This causes runtime compilation failures.

### Law A5 — Every Query is User-Scoped

No database query reads or mutates data without a verified, authenticated user session obtained from `lib/session.ts`. Queries that could return another user's data are architecture defects, not just bugs.

---

## Part II — Domain Laws

These laws encode the domain invariants from [SPEC.md §3](../../SPEC.md#3-architectural-invariants).

### Law D1 — Occurrences Are Never Persisted  
*Enforces [`INV-001`](../../SPEC.md#inv-001--occurrences-are-never-stored)*

Future scheduled occurrences are computed by the recurrence engine at request time. They are never stored in the database. If you find yourself inserting future scheduled events into a table, you are breaking the architecture.

### Law D2 — History Is Immutable  
*Enforces [`INV-002`](../../SPEC.md#inv-002--history-is-immutable)*

A `Record` (ActivityLog) represents a fact that occurred at a specific time. Its `date` and the fact of its existence must not be silently erased. Use soft-deletion (`deletedAt`). Create amended records instead of overwriting historical ones.

### Law D3 — Providers Never Own Data  
*Enforces [`INV-003`](../../SPEC.md#inv-003--providers-never-own-data)*

Google Calendar, Outlook, Apple Calendar — these are *sources*. Data fetched from them is cached transiently. The local database never copies external event payloads as its own records. If a provider goes offline, Tracker's own Records remain intact and unaffected.

### Law D4 — The Timeline Is Assembled, Not Stored

The Timeline is a presentation construct assembled at runtime from:
1. Template Occurrences (recurrence engine output)
2. External Events (Provider integrations)
3. Orphaned Records (logs from non-scheduled days)

The Timeline has no primary key. Never attempt to store it.

### Law D5 — Soft-Deletion Is Universal  
*Enforces [`INV-007`](../../SPEC.md#inv-007--soft-deletion-is-universal)*

Any model containing a `deletedAt DateTime?` column in `schema.prisma` must never be hard-deleted using `delete` or `deleteMany`. Set `deletedAt = new Date()` instead.

The Prisma client in `lib/db.ts` enforces this at runtime with a query interceptor that will throw before executing hard deletes.

### Law D6 — Unscoped Writes Are Forbidden

`deleteMany()`, `updateMany()`, or `createMany()` without a filtering `where` clause are explicitly forbidden. The Prisma client will intercept and block unscoped deletes at runtime.

---

## Part III — Extension Laws

When adding a new module, feature, or integration, these laws define the minimum contract it must satisfy.

### Law E1 — Every Module Must Expose a Barrel

Every module at `modules/<domain>/<feature>/` must export its public API through a single `index.ts` barrel file. Nothing outside the module may import from its internal files directly.

A complete module exposes:
```
modules/<domain>/<feature>/
├── index.ts          ← Public barrel. Exports types, actions, and service factory.
├── actions.ts        ← Server Actions. Thin wrappers that call the service.
├── services/
│   └── *.ts          ← Business logic. All domain rules live here.
├── components/
│   └── *.tsx         ← UI components scoped to this feature.
└── types.ts          ← TypeScript types/interfaces for this module.
```

### Law E2 — Every Module Declares Its Capabilities

When implementing a new module, its `index.ts` must document which [Capabilities](../../SPEC.md#19-capability) it implements:

```typescript
/**
 * Weight Module
 *
 * Capabilities: COMPLETABLE, SCHEDULABLE, QUANTIFIABLE, AUDITABLE
 * Patterns: Quantifiable Pattern, Timeline Pattern, Audit Pattern
 *
 * See: SPEC.md §1.9, docs/09-patterns/Quantifiable Pattern.md
 */
```

### Law E3 — New Domain Artifacts Link Through Records

When adding a new domain artifact (e.g. a future `WorkoutSession`), it must:
1. Have its own table with its own primary key.
2. Link to `ActivityLog` via a nullable foreign key on `ActivityLog` (e.g. `workoutSessionId String? @unique`).
3. Create an `ActivityLog` record when saved, with `status: 'done'`, so the Timeline automatically reflects the completion.

This preserves the Activity-first architecture and ensures all history flows through a single Record layer.

### Law E4 — New Providers Implement the Interface

Every new calendar or data integration must implement `ICalendarProvider` from `lib/providers.ts`. Providers are registered in the `ProviderService`. They are never called directly from UI or actions.

---

## Part IV — Quality Laws

### Law Q1 — Every Mutation Is Auditable

Every state change that affects the Timeline, Records, or user data must be:
1. Wrapped in a try-catch that returns a typed `{ success: true }` or `{ success: false, error: string }` result.
2. Logged through `lib/logger.ts` on failure with context (`userId`, `traceId`, relevant IDs).

### Law Q2 — Every Entity Is Typed

No `any` types in service layers or action return types. All database query results must be typed using generated Prisma types or explicit TypeScript interfaces from `types/`.

### Law Q3 — Every Error Is Recoverable

UI components must handle loading, success, and error states explicitly. No feature may leave the UI in a permanently broken state on server error. Optimistic updates must be rolled back on failure.

### Law Q4 — TypeScript Must Always Pass

```bash
bunx tsc --noEmit
```

This command must pass with zero errors before any PR is merged. No exceptions.

### Law Q5 — Tests Must Pass

```bash
bun test
```

All tests must pass. New service logic must include at least one corresponding test in `tests/`.

---

## Part V — Design Laws

### Law UI1 — Use Design System Primitives

Raw `<button>` tags, custom-styled `<div>` cards, or custom input boxes using ad-hoc Tailwind classes are **prohibited** in module panel files. Import and reuse from `@/design-system/components/*`:

| Component | Import |
|---|---|
| `<Button>` | `@/design-system/components/Button` |
| `<Card>`, `<CardHeader>`, `<CardBody>`, `<CardFooter>` | `@/design-system/components/Card` |
| `<Input>`, `<Textarea>`, `<Select>` | `@/design-system/components/Input` |
| `<Modal>` | `@/design-system/components/Modal` |

### Law UI2 — Use Design Token Variables

Do not hardcode flat color values (`bg-white`, `bg-zinc-800`). Use CSS variable tokens from `design-system/tokens.css`:

```tsx
// WRONG
<div className="bg-white border border-gray-200">

// CORRECT
<div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)]">
```

### Law UI3 — Typography Scale

| Role | Class |
|---|---|
| Page title | `text-2xl font-bold tracking-tight` |
| Section heading | `text-lg font-semibold` |
| Subtitle / meta | `text-sm text-[var(--color-text-muted)]` |
| Body copy | `text-sm text-[var(--color-text-primary)]` |

---

## Definition of Done

A feature, fix, or refactoring is only complete when all of the following are satisfied:

### Database
- [ ] Schema changes include `deletedAt` on new models (soft-deletion).
- [ ] New domain artifacts link through `ActivityLog` via a nullable FK.
- [ ] No hard deletes. No unscoped deletes.

### Architecture
- [ ] Mutation flows through: Action → Service → Prisma. No bypasses.
- [ ] New modules expose a barrel `index.ts`.
- [ ] Capabilities are declared in the module's barrel comment.

### UI
- [ ] Only design-system primitives used. No raw `<button>` or custom cards.
- [ ] Theme token variables used. No hardcoded colors.
- [ ] Loading, success, and error states all handled.
- [ ] Optimistic updates rolled back correctly on failure.

### Quality
- [ ] `bunx tsc --noEmit` passes with zero errors.
- [ ] `bun test` passes with all tests green.
- [ ] Failures logged via `lib/logger.ts` with `userId` and `traceId` context.

---

## See Also

| Document | What it covers |
|---|---|
| [SPEC.md](../../SPEC.md) | Domain concepts, invariants, capabilities |
| [Core Domain.md](../01-foundation/Core%20Domain.md) | Entity lifecycle diagrams |
| [architecture.md](../02-architecture/architecture.md) | System layers and dependency rules |
| [docs/09-patterns/](../09-patterns/) | Reusable implementation patterns |
