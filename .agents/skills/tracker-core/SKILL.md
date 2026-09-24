---
name: tracker-core
description: Core architecture and domain workflows for Tracker OS. Use when creating or modifying activities, completion schemas, recurrence rules, timeline logic, services, or local-first store state.
---

# Tracker OS — Core Domain & Feature Workflows

Use this skill whenever creating, modifying, or refactoring features in Tracker OS.

---

## 1. Domain Entities & Responsibilities

1. **`ActivityTemplate` (`prisma/schema.prisma`)**:
   - Represents the blueprint of a habit/activity (name, category, recurrence rules, completion schema, priority, color, icon).
   - Saved in database table `ActivityTemplate`.
   - Never duplicate templates per day.

2. **`TimelineItem` (`types/index.ts`)**:
   - Computed at runtime by `generateTimeline(templates, logs, dateStr, calendarEvents)`.
   - Represents a specific occurrence on a specific day.
   - **Never persisted to the database.**

3. **`ActivityLog` (`prisma/schema.prisma`)**:
   - Persists a fact that occurred for a template on a specific date (`YYYY-MM-DD`).
   - Fields: `status` ('done' | 'canceled' | 'postponed'), `amount` (Float), `payload` (JSON), `notes` (String).

---

## 2. Activity Completion Schemas

Defined via `metadata.completion` on `ActivityTemplate`:

| Method | Behavior | Example |
| :--- | :--- | :--- |
| **`CHECKBOX`** | Simple binary completion. Clicking toggles status directly. | "Meditate for 10 mins" |
| **`VALUE`** | Requires entering a numeric or decimal quantity with a unit. | Fuel Refill: `8.5 L`, Water: `750 ml` |
| **`DURATION`** | Measures time spent in minutes/hours. | "Deep Work Session: 45 min" |
| **`HOOK`** | Automatically delegates completion to another module (`weight`, `journal`). | Logging weight marks "Log Weight" done. |

### Canonical Value Storage Contract:
When saving a `VALUE` completion:
- Save exact numeric amount in `log.amount` (`8.5`).
- Save structured payload in `log.payload`: `{"value": 8.5, "unit": "L"}`.
- Format via `CompletionService.formatCompletionDisplay(template, log.payload, log.amount)`.

---

## 3. Local-First Store Architecture (`lib/store/store.tsx`)

Every user action should update local state **optimistically**:
1. Mutate `state.templates` or `state.logs` in memory synchronously so the UI reacts in `<16ms`.
2. Persist to IndexedDB via local repositories (`ActivityTemplateRepository`, `ActivityLogRepository`).
3. Enqueue network operation into `SyncCoordinator` (`lib/sync/core/SyncCoordinator.ts`).
4. Reconcile with server response or rollback on failure.

---

## 4. Master Search Integration
When adding a new module or entity to Tracker, integrate it into `MasterSearchEngine` (`lib/search/MasterSearchEngine.ts`):
- Implement the canonical `SearchResult` shape:
  ```ts
  {
    id: string,
    type: SearchCategory,
    title: string,
    subtitle?: string,
    snippet?: string,
    href: string,
    date?: Date,
    metadata?: string,
    payload?: Record<string, unknown>
  }
  ```
- Always respect `isOwner` and module permissions.
- Exclude records where `deletedAt !== null`.
