# Task State Machine & Postpone Lifecycle Specification

This document defines the authoritative, domain-level Task State Machine and postponement lifecycle for Tracker OS, unified across Web and Mobile.

---

## 1. Domain Concepts: Activity vs Task Occurrence

- **Activity (`ActivityTemplate`)**:
  - The persistent definition of a repeatable habit, routine, or task.
  - Contains recurrence rules (`daily`, `weekly`, `monthly`, `custom`, `one_time`), category, priority, color, icon, and optional `targetDate`.
- **Task Occurrence (`TimelineItem` / `ActivityOccurrence`)**:
  - An actionable, date-specific instance generated for a given calendar day.
  - Bound to an optional `ActivityLog` recorded for that specific date.

---

## 2. Canonical Task States & State Diagram

Tracker OS defines four formal task states:

| State | Status Token | UI Label | Description |
|---|---|---|---|
| `pending` | `cleared` / `null` | Pending | Task is due and awaiting user action. |
| `done` | `done` (or `paid`) | Completed | Task has been successfully performed for this date. |
| `skipped` | `skipped` | Canceled | User explicitly skipped/canceled the task for this date. |
| `postponed` | `postponed` | Postponed | Task has been delayed to the following day (non-daily only). |

### State Transition Diagram

```text
               ┌───────────┐
               │  PENDING  │
               └─────┬─────┘
                     │
       ┌─────────────┼─────────────┐
       │             │             │
       ▼             ▼             ▼
  ┌────────┐    ┌─────────┐   ┌───────────┐
  │  DONE  │◄───┤ SKIPPED │──►│ POSTPONED │
  └───┬────┘    └───┬─────┘   └─────┬─────┘
      │             │               │
      │             ▼               │
      └────────► PENDING ◄──────────┘
```

---

## 3. Transition Rules (`TaskStateMachine`)

The server and client enforce `TaskStateMachine.isValidTransition(from, to)`:

```ts
export type TaskOccurrenceState = 'pending' | 'done' | 'skipped' | 'postponed'

export class TaskStateMachine {
  private static transitions: Record<TaskOccurrenceState, TaskOccurrenceState[]> = {
    pending:   ['done', 'skipped', 'postponed'],
    done:      ['pending', 'skipped'],   // cycle: done → skipped (Canceled)
    skipped:   ['pending', 'postponed'], // cycle: skipped → postponed for non-daily
    postponed: ['pending', 'done'],      // restore to pending, or direct complete
  }

  public static isValidTransition(from: TaskOccurrenceState, to: TaskOccurrenceState): boolean {
    return this.transitions[from]?.includes(to) || false
  }
}
```

### Invalid Transitions:
- `done ➔ postponed`: Direct postponement of an already completed task is prohibited; task must first be uncompleted.
- `skipped ➔ done`: Direct completion of a skipped task is prohibited; task must first be restored to pending or cycled.
- `done ➔ done`, `pending ➔ pending`: Self-transitions are rejected as no-ops.

---

## 4. Checklist Cycling Rules

When a user taps a task checkbox in Today:

### Non-Daily Activities:
`Pending (cleared)` ➔ `Done` ➔ `Canceled (skipped)` ➔ `Postponed` ➔ `Pending (cleared)`

### Daily Activities:
`Pending (cleared)` ➔ `Done` ➔ `Canceled (skipped)` ➔ `Pending (cleared)`  
*(Postponing a daily activity is disallowed because daily habits inherently occur tomorrow anyway.)*

---

## 5. Postpone & Re-Postpone Semantics

Postponement behaves with mathematical precision depending on whether the activity is **Recurring** or **One-Time**.

### A. Recurring Activities (Weekly, Monthly, Custom)
1. **Postpone Action**:
   - Creates an `ActivityLog` for `todayStr` with `status: 'postponed'`.
   - `lib/recurrence.ts`: The recurrence engine reads `latestPostponeLog` and calculates:
     $$\text{nextDueDate} = \text{addUTCDays}(\text{latestPostponeLog.date}, 1)$$
   - The task is rescheduled and appears on the following day.
2. **Re-Postpone / Restore Action**:
   - When the user views the task on the next day or taps "Restore / Re-postpone":
   - The `postponed` log is deleted (`deleteActivityLog(logId)`).
   - Once the postponement log is deleted, recurrence calculation reverts to normal schedule based on original rule and completed logs.
   - The task immediately returns to its previous scheduled date.

### B. One-Time Tasks (`one_time`)
1. **Postpone Action (`postponeOneTimeTaskAction`)**:
   - `template.targetDate` is updated:
     $$\text{newTargetDate} = \text{addUTCDays}(\text{targetDate}, 1)$$
   - Any completed/skipped log for the original date is purged.
   - The task moves forward to tomorrow.
2. **Re-Postpone / Restore Action (`unpostponeOneTimeTaskAction`)**:
   - `template.targetDate` is reverted to `originalDate`.
   - Any log recorded on the postponed date is deleted.
   - The task returns cleanly to its original date.

---

## 6. Mutation Idempotency & Concurrency Invariants

To prevent duplicate tasks or corrupted state across network retries, double taps, or background sync:

1. **Client-Generated UUIDs**:
   - Every log creation assigns an authoritative client UUID (`id: crypto.randomUUID()`).
   - If a retry sends the same ID, the server identifies the existing log and returns `200 OK` (idempotent success) rather than creating a duplicate.
2. **Payload Equivalence Checking**:
   - If the same ID is re-submitted with materially conflicting attributes, the server returns `409 CONFLICT` without overwriting data.
3. **Database Concurrency Lock**:
   - Handled via Prisma unique constraints: `@@unique([userId, date])` for singletons and unique UUID primary keys.
   - In-flight client mutations are locked per-template using `inFlightMutationRef.current.add(templateId)`.
