# ADR 0006: Sync Engine Type Safety & Test Suite Resolution

## Status
Accepted

## Context
During sync engine compilation and test runs, several strict-mode compiler issues, ESLint violations (specifically `no-explicit-any`), and Vitest-related test runner discrepancies arose. Additionally, custom tasks added via the Today Dashboard were verified for proper persistence.

This document records the exact changes, design decisions, and architectural guidelines implemented to resolve these issues permanently.

---

## Decisions & Implementations

### 1. Unified Bun Test Mocking System
- **Problem**: The service test suite imported describe block helpers and mock functions from `vitest` which was not an installed dependency. This triggered TS2307 resolution errors.
- **Solution**: Ported all tests to use Bun's native mocking engine (`bun:test`).
- **Implementation**:
  - Replaced imports: `import { ... } from 'vitest'` ➔ `import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'`.
  - Replaced `vi.mock` module configurations with `mock.module` hooks.

### 2. Elimination of `any` Types in Test Mocks
- **Problem**: Mocks returned partial `ActivityLog` values without all database fields required by the type signature, causing compilation errors.
- **Solution**: Mock functions now return fully compliant `ActivityLog` database model shapes typed explicitly to `Promise<ActivityLog>` from `@prisma/client`.
- **Implementation**:
  - Added all database properties (e.g. `userId`, `deletedAt`, `journalEntryId`, `weightRecordId`, `leaveRecordId`) to mock return objects.
  - Safe-casted input payloads to database-compatible types: `(payload as Prisma.JsonValue) || null`.

### 3. Named Interface for Queue Counters
- **Problem**: Accessing `typeof this.stats` inside generic types caused a `this implicitly has type any` error because the compiler cannot resolve `this` dynamically inside type parameters.
- **Solution**: Extracted a named interface (`InternalQueueCounters`) to represent the exact counters structure.
- **Implementation**:
  ```typescript
  interface InternalQueueCounters {
    totalProcessed: number
    totalSuccessful: number
    totalFailed: number
    totalRetries: number
    totalDropped: number
  }
  ```

### 4. Method Existence Validation on Singleton
- **Problem**: `verify-sync-integration.ts` casted the singleton instance of `SyncedActivityService` to `Record<string, unknown>` to check method existence, which violated strict typing rules.
- **Solution**: Used the type-safe `in` operator combined with `keyof typeof` to verify method presence without casting.
- **Implementation**:
  ```typescript
  const missingMethods = requiredMethods.filter(
    method => !(method in SyncedActivityService) || typeof SyncedActivityService[method as keyof typeof SyncedActivityService] !== 'function'
  )
  ```

---

## Quick Task Database Persistence
Custom tasks created via the Today Dashboard input bar:
- Are created as `ActivityTemplate` rows in PostgreSQL/SQLite database with `recurrenceType: 'one_time'` and a UTC `targetDate`.
- Upon checkbox completion, an `ActivityLog` row is successfully written to the database under today's date (`todayStr`).
- Being one-time tasks, they naturally clear off tomorrow's timeline but remain saved permanently in the database logs.
