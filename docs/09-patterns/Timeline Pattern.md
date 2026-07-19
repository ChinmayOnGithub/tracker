# Timeline Pattern

**Pattern type**: Integration  
**Capabilities used**: `COMPLETABLE`, `SCHEDULABLE`  
**Used by**: Habits, Journal, Weight, Leave, Google Calendar Events

> **Prerequisite reading**: [SPEC.md §1.5 (Timeline)](../../SPEC.md#15-timeline), [Core Domain.md §4](../01-foundation/Core%20Domain.md#4-the-activity-first-architecture)

---

## Intent

Allow any domain module to appear on the Today Timeline as a completable task — without the module knowing anything about how the Timeline works.

---

## Problem

The Timeline must show a unified, ordered list of everything happening today. That includes:
- Recurring habits (from local Templates)
- Ad-hoc journal entries
- Weight logs
- Google Calendar events
- Future: workouts, bills, reminders

Each of these comes from a completely different data source. The Timeline cannot have a hard dependency on every module, or it becomes a monolith.

---

## Solution

Every domain module produces a `Record` (`ActivityLog`) when the user acts. The Timeline assembles itself by querying Records + computing Occurrences. The module never touches the Timeline directly.

```
Domain Module
     ↓
1. Save domain artifact (JournalEntry / WeightRecord / etc.)
     ↓
2. Get or create the default Template for this type
     ↓
3. Create a Record linked to the artifact
     ↓
Timeline reads Records ← No coupling to the module
```

---

## Implementation

### Step 1 — Ensure a Template exists for your module type

```typescript
// In your Server Action
const template = await ActivityService.getOrCreateDefaultTemplate(
  user.id,
  'JOURNAL',         // recurrenceType — use a unique type string for your module
  'Daily Journal',   // display name on the Timeline
  'personal',        // category
  'BookOpen',        // Lucide icon name
  'amber'            // color token
)
```

### Step 2 — Create a Record after saving the artifact

```typescript
await ActivityService.logActivity({
  userId: user.id,
  templateId: template.id,
  date,              // 'YYYY-MM-DD' string
  status: 'done',
  journalEntryId: entry.id,   // link to artifact (optional)
  note: 'Short preview text'
})
```

### Step 3 — The Timeline picks it up automatically

`lib/services/TimelineService.ts` fetches all Records for the day and merges them with Occurrences. Your item appears as completed.

---

## Checklist Status Cycling

Timeline tasks cycle through states on checkbox click. The cycle depends on the Template's recurrenceType:

**Non-daily**:
`Cleared → Done → Canceled → Postponed → Cleared`

**Daily** (postpone is skipped):
`Cleared → Done → Canceled → Cleared`

---

## Rules

1. Never modify `TimelineService.ts` to add module-specific logic. Modules integrate via Records, not by patching the Timeline.
2. Every timeline-integrated module must create a Record — even if the artifact (e.g. a weight entry) could stand alone.
3. The Template for a module's default activity (Journal, Weight) is created lazily on first use using `getOrCreateDefaultTemplate`. Do not seed it.

---

## See Also

- [SPEC.md §1.3 Occurrence](../../SPEC.md#13-occurrence)
- [SPEC.md §1.5 Timeline](../../SPEC.md#15-timeline)
- [Core Domain.md §4 Activity-First Architecture](../01-foundation/Core%20Domain.md#4-the-activity-first-architecture)
- [Quantifiable Pattern.md](./Quantifiable%20Pattern.md)
- [Audit Pattern.md](./Audit%20Pattern.md)
