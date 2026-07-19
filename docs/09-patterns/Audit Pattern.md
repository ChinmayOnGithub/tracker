# Audit Pattern

**Pattern type**: Cross-cutting  
**Capabilities used**: `AUDITABLE`  
**Used by**: All modules that mutate user data

> **Prerequisite reading**: [AI Constitution.md — Law Q1](../07-ai/AI%20Constitution.md#law-q1--every-mutation-is-auditable)

---

## Intent

Ensure that every significant state change in the system is traceable — who did it, when, what changed, and whether it succeeded — without cluttering domain logic with logging boilerplate.

---

## Problem

When something goes wrong (a weight record disappears, a journal entry fails to save), there is currently no structured trail of what happened and why. Additionally, AI agents working on the codebase need to know which operations are high-risk so they can treat them with appropriate care.

---

## Solution

Two complementary audit strategies:

1. **Structured Logging** (`lib/logger.ts`) — Every server action and service method logs failures with context. This is already in use.
2. **Soft-Deletion** — Records are never physically removed. Setting `deletedAt` is itself an auditable event.
3. **Future: Audit Table** — For high-security mutations (vault file access, credential changes), a dedicated `AuditLog` table records every operation.

---

## Current Implementation (Structured Logging)

Every Server Action returns a typed result:

```typescript
// Standard result shape
type ActionResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string }
```

Every catch block logs with context:

```typescript
import { logger } from '@/lib/logger'

export async function saveJournalEntry(date: string, fields: JournalFields) {
  try {
    const user = await getAuthSession()
    // ... domain logic ...
    return { success: true, data: entry }
  } catch (error) {
    logger.error('Failed to save journal entry', {
      userId: user?.id,
      date,
      error: error instanceof Error ? error.message : String(error),
    })
    return { success: false, error: 'Failed to save journal entry' }
  }
}
```

---

## Soft-Deletion as Audit Trail

Because every model with `deletedAt` is soft-deleted rather than hard-deleted, the database itself acts as an implicit audit log. You can always query:

```typescript
// Find everything a user deleted
const deleted = await db.activityTemplate.findMany({
  where: { userId, deletedAt: { not: null } },
  orderBy: { deletedAt: 'desc' },
})
```

This is why the **Prisma guard in `lib/db.ts` blocks hard deletes** — it protects the audit trail.

---

## Future: Audit Table

For high-security operations, a dedicated audit table should be added:

```prisma
model AuditLog {
  id         String   @id @default(uuid())
  userId     String
  action     String   // 'VAULT_DOWNLOAD', 'CREDENTIAL_REVOKED', 'WEIGHT_DELETED'
  entityType String   // 'VaultFile', 'WeightRecord', etc.
  entityId   String
  metadata   String?  // JSON blob with before/after state or relevant context
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())

  user User @relation(...)
}
```

Priority candidates for audit logging:
- Vault file downloads (who accessed what, when)
- Google credential revocations
- Account deletions or password changes
- Bulk data exports

---

## Rules

1. Every Server Action must return a typed `{ success: true | false }` result. Never throw to the UI.
2. Every catch block must call `logger.error()` with at least `userId` and a human-readable action description.
3. Soft-deletable models must never use `delete` or `deleteMany`. The Prisma guard enforces this.
4. High-security operations (file downloads, credential mutations) should be candidates for the `AuditLog` table once implemented.

---

## Checklist for Adding Audit to a New Module

- [ ] Server actions return `{ success: boolean, error?: string }`.
- [ ] `try/catch` in every action with `logger.error` in the catch block.
- [ ] New models include `deletedAt DateTime?` and are soft-deleted only.
- [ ] High-security operations noted as candidates for the future `AuditLog` table.

---

## See Also

- [AI Constitution.md — Law Q1 (Every Mutation Is Auditable)](../07-ai/AI%20Constitution.md#law-q1--every-mutation-is-auditable)
- [AI Constitution.md — Law D2 (History Is Immutable)](../07-ai/AI%20Constitution.md#law-d2--history-is-immutable)
- [AI Constitution.md — Law D5 (Soft-Deletion Is Universal)](../07-ai/AI%20Constitution.md#law-d5--soft-deletion-is-universal)
- [`lib/logger.ts`](../../lib/logger.ts)
- [SPEC.md §3 Architectural Invariants](../../SPEC.md#3-architectural-invariants)
