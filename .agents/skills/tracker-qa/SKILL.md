---
name: tracker-qa
description: Quality assurance, regression testing, Bun mock patterns, and pre-production release checklist for Tracker OS. Use before committing changes or shipping releases.
---

# Tracker OS — Quality Assurance & Release Runbook

Use this skill whenever testing changes, writing new tests, or preparing to deploy to production.

---

## 1. The Pre-Release Gate (Mandatory Verification)

Before committing or declaring any task complete, run the full verification pipeline:

```bash
# 1. Run all unit and integration tests (Bun test runner)
bun test

# 2. Verify complete TypeScript type-safety (0 errors)
bunx tsc --noEmit

# 3. Check code style and React hook safety
bun run lint

# 4. Compile the full Next.js production build
bun run build
```

---

## 2. Bun Test Mocking Rules

1. **Test Runner Imports**: Always import from `bun:test`:
   ```typescript
   import { describe, it, expect, mock, beforeEach } from 'bun:test'
   ```

2. **Clean Mock Resets**: Never call `jest.clearAllMocks()` or `vi.clearAllMocks()`. Reset call history directly:
   ```typescript
   const myMock = mock(() => Promise.resolve({ success: true }))
   // Reset before each test:
   (myMock as { mock?: { calls: unknown[][] } })?.mock?.calls.length = 0
   ```

3. **Module Mocking**: To mock Server Actions or Auth in Bun, use `mock.module`:
   ```typescript
   beforeEach(() => {
     mock.module('@/app/actions/auth', () => ({
       getLoggedUser: () => Promise.resolve({
         id: 'user-test-id',
         username: 'testuser',
         isOwner: true
       })
     }))
   })
   ```

4. **Prisma Return Types**: When mocking Prisma service returns, fully specify all entity fields (including `userId`, `deletedAt`, `createdAt`, `updatedAt`) to maintain 100% strict type safety.

---

## 3. Production Readiness Checklist

- [ ] **Soft-Delete Guard**: Table queries containing `deletedAt` use `update` / `updateMany`, never hard `delete`.
- [ ] **User Isolation**: All queries and mutations check session and filter by `userId`.
- [ ] **UI Component Reuse**: Uses `@/design-system/components/*` (`<Button>`, `<Card>`, `<Input>`), no raw buttons.
- [ ] **No Hydration Delay**: Local-first cached state renders immediately; secondary server sync runs in background.
- [ ] **Sync Error Handling**: Billing and unrecoverable server rejections are marked `BLOCKED` to prevent infinite retry loops.
- [ ] **Zero Compilation Errors**: Both `bunx tsc --noEmit` and `bun run lint` pass with 0 errors and 0 warnings.
