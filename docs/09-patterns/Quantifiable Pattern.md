# Quantifiable Pattern

**Pattern type**: Data  
**Capabilities used**: `QUANTIFIABLE`, `COMPLETABLE`, `SCHEDULABLE`  
**Used by**: Weight, Money/Bills, future: Calories, Workout sets, Sleep hours

> **Prerequisite reading**: [SPEC.md §1.9 Capability](../../SPEC.md#19-capability)

---

## Intent

Allow a domain module to carry a numeric measurement (weight, amount, reps, distance) alongside its standard timeline completion state, with historical charting and trend analysis as first-class concerns.

---

## Problem

Some timeline items aren't just "done or not done" — they carry a numeric value that the user wants to track over time. A weight log means nothing without the history of all previous weight logs. A bill payment means nothing without the running total.

These modules need:
1. Timeline integration (completable tasks)
2. A place to store the numeric payload
3. A history view (chart, table, trend)
4. Optional: aggregation (total spend, average weight, BMI)

---

## Solution

Create a dedicated artifact table (`WeightRecord`, future `BillRecord`) that holds the numeric payload. Link it to the `ActivityLog` Record via a nullable FK. The Timeline shows completion; the module's own view shows history.

```
User action (e.g. log weight)
     ↓
1. Save WeightRecord { weight: 73.5, date: today }
     ↓
2. Create ActivityLog Record { status: 'done', weightRecordId: record.id }
     ↓
Timeline: shows "Log Weight ✓" for today
Weight module view: shows chart of all WeightRecords over time
```

---

## Implementation

### Schema (Artifact Table)

```prisma
model WeightRecord {
  id        String   @id @default(uuid())
  userId    String
  date      DateTime
  weight    Float
  notes     String?
  createdAt DateTime @default(now())
  deletedAt DateTime?

  user        User         @relation(...)
  activityLog ActivityLog?  // Back-reference — ActivityLog holds the FK
}
```

### Schema (ActivityLog FK)

```prisma
model ActivityLog {
  // ...existing fields...
  weightRecordId String? @unique    // ← FK to artifact
  weightRecord   WeightRecord? @relation(fields: [weightRecordId], references: [id])
}
```

### Server Action

```typescript
export async function logWeight(date: string, weight: number, notes?: string) {
  const user = await getAuthSession()

  // 1. Save artifact
  const record = await db.weightRecord.create({
    data: { userId: user.id, date: new Date(date), weight, notes }
  })

  // 2. Link to Timeline via ActivityLog
  const template = await ActivityService.getOrCreateDefaultTemplate(
    user.id, 'PERSONAL', 'Log Weight', 'health', 'Scale', 'blue'
  )
  await ActivityService.logActivity({
    userId: user.id,
    templateId: template.id,
    date,
    status: 'done',
    weightRecordId: record.id,
  })

  revalidatePath('/')
  return { success: true, record }
}
```

### History Query

```typescript
// Fetch all weight records for charting — ordered by date
const history = await db.weightRecord.findMany({
  where: { userId: user.id, deletedAt: null },
  orderBy: { date: 'asc' },
})
```

---

## Derived Values

Quantifiable modules commonly compute derived values from history:

| Module | Stored | Derived |
|---|---|---|
| Weight | `weight (kg)` | BMI (requires height from user settings), trend line, 7-day average |
| Bills | `amount (₹)` | Monthly total, year-to-date spend |
| Future: Workout | `sets, reps, weight` | Volume load, PR tracking |

Derived values are **always computed at query time**, never stored.

---

## Rules

1. Each unique measurement type gets its own artifact table. Do not add `type` discriminator columns to a shared measurement table.
2. The artifact table holds the payload. `ActivityLog` holds the FK. Never reverse this.
3. Historical data is never deleted (only soft-deleted). Charts depend on the full history.
4. Derived values (BMI, totals) are computed in the service or component, never persisted.

---

## See Also

- [Timeline Pattern.md](./Timeline%20Pattern.md)
- [Audit Pattern.md](./Audit%20Pattern.md)
- [SPEC.md §1.8 Record Artifact](../../SPEC.md#18-record-artifact)
