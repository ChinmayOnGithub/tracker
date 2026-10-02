# Implementation Plan: Google Calendar Sync Integration Tests

## Overview
Comprehensive integration tests for the Google Calendar sync system in Tracker Mobile. These tests verify the full sync lifecycle: initial sync, incremental sync, token management, error handling (410 recovery), pagination, and database persistence.

---

## 1. Test Infrastructure Decisions

### Mocking Strategy
- **GoogleCalendarService.listEventsWithSyncToken() and requestWithAuth():** Mock at module level using `mock.module()` pattern (bun:test). Override static methods to return controlled payloads without HTTP calls.
- **GoogleCalendarService.getAccessToken():** Mock to return a static token (e.g., `'mock-access-token-abc123'`) to avoid OAuth refresh flows.
- **Why not mock HTTP fetch directly:** Coupling to HTTP implementation details makes tests brittle. Mocking at the service level is cleaner.

### Database Strategy
- **Real test database with isolated cleanup:** Use actual Prisma client from `@/lib/db` with real connection. Each test gets unique `userId` (e.g., `test-user-${uniqueId}`). Use `db.calendarEvent.updateMany()` with `deletedAt` (soft delete) in teardown, scoped by userId.
- **Why not mock Prisma:** Mocking masks schema issues and soft-delete contract violations. Real DB testing catches serialization bugs that matter in production.

### Provider Registration Pattern
1. Create mock `GoogleCalendarProvider` with controlled `fullSync()` and `incrementalSync()` implementations
2. Register directly in `calendarProviderRegistry` BEFORE calling `CalendarService.sync()`
3. Reset both `calendarProviderRegistry` and `providerRegistry` after each test
4. **Critical:** `CalendarService.getProvider()` checks `calendarProviderRegistry.get('GOOGLE')` FIRST before invoking `providerRegistry.get()`. This short-circuit is the hook we use in tests.

### Credential Seeding
Before each test, insert a `googleCredential` row:
- `userId` = test's unique ID
- `calendarId` = `'primary'`
- `refreshToken` = `'mock-refresh-token-abc123'`
- This passes `CalendarService.getProvider()` credential check

### Path Aliases
- `@/` paths work natively in bun test (tsconfig.json defines `"@/*": ["./*"]`)
- Verified: existing tests in `lib/services/__tests__/` use `@/` without extra config

### Test Data Helpers
- `createMockGoogleEvent(overrides?)` — generates Google Calendar API event payload
- `setupMockProvider(fullSyncImpl?, incrementalSyncImpl?)` — creates and registers mock provider
- `seedGoogleCredential(userId)` — creates credential row for user
- `cleanupUser(userId)` — soft-deletes events and removes sync state/credentials

---

## 2. Ten Test Cases

### TC-1: Initial Full Sync (No Stored Token)
**Describe:** `"CalendarService sync() - Full Sync on First Call"`
**It:** `"should call fullSync when no sync token exists and persist nextSyncToken"`

**Setup:** Mock `listEventsWithSyncToken()` returns 2 events and token `'token-abc123'`. Seed credential.

**Execution:**
1. Call `CalendarService.sync(userId)` (no prior sync state)
2. Assert: 2 events created in DB with `externalProvider='GOOGLE'`, `externalId` set, `deletedAt=null`
3. Assert: `calendarSyncState` row created with `syncToken='token-abc123'`, `lastSyncAt` recent
4. Assert: `SyncResult` returns `{ eventsCreated: 2, eventsUpdated: 0, eventsDeleted: 0, nextSyncToken: 'token-abc123' }`

**Verification:** Query DB for event count with externalProvider='GOOGLE'; check sync state row exists.

---

### TC-2: Subsequent Call Uses Stored Token (Incremental Not Full)
**Describe:** `"CalendarService sync() - Incremental Sync"`
**It:** `"should call incrementalSync when sync token exists and not trigger fullSync"`

**Setup:** Mock `fullSync()` throws if called. Mock `incrementalSync(userId, token)` verifies token, returns 1 new event.

**Execution:**
1. Seed credential and `calendarSyncState` with `syncToken='stored-token-123'`
2. Call `CalendarService.sync(userId)`
3. Assert: `incrementalSync()` was called (not fullSync)
4. Assert: 1 new event created in DB
5. Assert: `syncToken` updated to new token

**Verification:** Verify fullSync mock was NOT called; check incrementalSync call count = 1.

---

### TC-3: Token Persists Across Requests (Idempotency)
**Describe:** `"CalendarService sync() - Token Persistence"`
**It:** `"should reuse sync token on subsequent sync call; second sync does NOT trigger fullSync"`

**Setup:** Mock provider tracks call counts for fullSync and incrementalSync.

**Execution:**
1. Seed credential (no sync state)
2. **First sync:** Call `CalendarService.sync()` → fullSync called, stores token `'token-1'`
3. Verify `calendarSyncState.syncToken === 'token-1'`
4. **Second sync:** Call `CalendarService.sync()` again
5. Assert: `incrementalSync('token-1')` was called; fullSync NOT called this time
6. Assert: fullSync call count = 1, incrementalSync call count = 1

**Verification:** Check mock call history for both methods across two invocations.

---

### TC-4: Incremental Sync Creates New Event
**Describe:** `"CalendarService sync() - Merge Behavior"`
**It:** `"should create new database event from Google incremental sync response"`

**Setup:** Mock `incrementalSync()` returns event: `{ id: 'g-event-1', summary: 'Imported Meeting', ... }`

**Execution:**
1. Seed credential and sync state
2. Call `CalendarService.sync(userId)`
3. Query DB: `calendarEvent.findFirst({ where: { externalId: 'g-event-1', userId } })`
4. Assert: event exists with `title='Imported Meeting'`, `externalProvider='GOOGLE'`, `deletedAt=null`

---

### TC-5: Incremental Sync Updates Existing Event
**Describe:** `"CalendarService sync() - Merge Behavior"`
**It:** `"should update existing event when Google event has newer timestamp"`

**Setup:** Mock `incrementalSync()` returns: `{ id: 'g-event-1', summary: 'Updated Meeting Title', updated: <new date>, ... }`

**Execution:**
1. Seed credential and sync state
2. Create local event: `externalId='g-event-1'`, `title='Old Title'`, `updatedAt=<old date>`
3. Call `CalendarService.sync(userId)`
4. Query updated event from DB
5. Assert: `title='Updated Meeting Title'`, `externalId='g-event-1'`, `updatedAt` is newer, `deletedAt=null`

**Gotcha:** Merge logic compares `gEvent.updated > localEvent.updatedAt`. If Google's `updated` is old, update is skipped.

---

### TC-6: Incremental Sync Soft-Deletes Cancelled Event
**Describe:** `"CalendarService sync() - Soft Delete"`
**It:** `"should soft-delete local event when Google event status is cancelled"`

**Setup:** Mock `incrementalSync()` returns: `{ id: 'g-event-1', status: 'cancelled', ... }`

**Execution:**
1. Seed credential and sync state
2. Create local event: `externalId='g-event-1'`, `deletedAt=null`
3. Call `CalendarService.sync(userId)`
4. Query event WITHOUT `deletedAt` filter: `calendarEvent.findFirst({ where: { externalId: 'g-event-1', userId } })`
5. Assert: `deletedAt !== null`, `externalId='g-event-1'` still present

**Gotcha:** Must NOT filter `deletedAt: null` in query to see soft-deleted row.

---

### TC-7: 410 Recovery (Invalid Sync Token)
**Describe:** `"CalendarService sync() - 410 Recovery"`
**It:** `"should clear syncToken and perform fullSync when incrementalSync returns 410"`

**Setup:** Mock `incrementalSync()` throws `new GoogleApiError('Sync token is invalid', 410)`. Mock `fullSync()` returns valid data.

**Execution:**
1. Seed credential and sync state with `syncToken='expired-token'`
2. Call `CalendarService.sync(userId)`
3. Assert: NO exception thrown (error was handled)
4. Query `calendarSyncState`: `syncToken` is now the new token from fullSync (NOT `'expired-token'`)
5. Verify `fullSync()` was called (fallback after 410 detection)

**Gotcha:** 410 detected via `.statusCode === 410` OR `.message.includes('410')`. GoogleApiError must set both.

---

### TC-8: Duplicate Event Idempotency (No Double Rows)
**Describe:** `"CalendarService sync() - Idempotency"`
**It:** `"should not create duplicate events when same externalId synced twice"`

**Setup:** Mock returns same event on two consecutive merges.

**Execution:**
1. Seed credential and sync state
2. Mock returns event `{ id: 'g-event-1', ... }`
3. Call sync (event created)
4. Mock configured to return same event again
5. Call sync again
6. Query DB: `calendarEvent.count({ where: { externalId: 'g-event-1', userId } })`
7. Assert: count === 1 (no duplicates)

---

### TC-9: Pagination (Multiple Pages)
**Describe:** `"CalendarService sync() - Pagination"`
**It:** `"should fetch and merge all pages of events when listEventsWithSyncToken returns multiple pages"`

**Setup:** Mock `listEventsWithSyncToken()` simulates two pages:
- Page 1: `{ items: [event-1, event-2], nextPageToken: 'page-2', nextSyncToken: null }`
- Page 2: `{ items: [event-3, event-4], nextPageToken: null, nextSyncToken: 'token-final' }`

**Execution:**
1. Seed credential
2. Call `CalendarService.sync(userId)`
3. Query DB: `calendarEvent.count({ where: { userId, externalProvider: 'GOOGLE' } })`
4. Assert: count === 4 (all pages merged)

---

### TC-10: Interrupted Sync (listEventsWithSyncToken Throws)
**Describe:** `"CalendarService sync() - Error Handling"`
**It:** `"should not update syncToken in DB if sync throws before completion"`

**Setup:** Mock `incrementalSync()` throws `new Error('Network timeout')` (NOT a 410 error).

**Execution:**
1. Seed credential and sync state with `syncToken='original-token'`, `lastSyncAt=<old date>`
2. Call `CalendarService.sync(userId)` — expect exception
3. Query `calendarSyncState`
4. Assert: `syncToken === 'original-token'` (NOT updated)
5. Assert: `lastSyncAt` is old date (NOT updated)

**Gotcha:** Sync token persistence only happens AFTER sync completes without throwing.

---

## 3. File Structure and Helper Functions

### Location
`modules/calendar/__tests__/calendar-sync.integration.test.ts`

### Helper: createMockGoogleEvent(overrides?)
```typescript
function createMockGoogleEvent(overrides?: Partial<object>): object {
  const now = new Date()
  return {
    id: overrides?.id ?? `event-${Math.random().toString(36).slice(2)}`,
    summary: overrides?.summary ?? 'Test Event',
    description: overrides?.description ?? 'Test Description',
    start: overrides?.start ?? { dateTime: now.toISOString() },
    end: overrides?.end ?? { dateTime: new Date(now.getTime() + 3600000).toISOString() },
    status: overrides?.status ?? 'confirmed',
    updated: overrides?.updated ?? now.toISOString(),
    etag: overrides?.etag ?? `"etag-${Math.random().toString(36).slice(2)}"`,
    ...overrides
  }
}
```

### Helper: setupMockProvider(fullSyncImpl?, incrementalSyncImpl?)
Creates mock `GoogleCalendarProvider`, registers in `calendarProviderRegistry`, returns instance.

### Helper: seedGoogleCredential(userId)
Upserts `googleCredential` row with userId, refreshToken, calendarId='primary'.

### Helper: cleanupUser(userId)
- Soft-delete all events: `db.calendarEvent.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: new Date() } })`
- Delete sync state: `db.calendarSyncState.deleteMany({ where: { userId } })`
- Delete credential: `db.googleCredential.delete({ where: { userId } })` (ignore if not found)

### beforeEach
- Reset `calendarProviderRegistry` and `providerRegistry`
- Mock `GoogleCalendarService` static methods via `mock.module()`

### afterEach
- Call `cleanupUser(testUserId)` for each test
- Reset registries

---

## 4. Key Gotchas Found in Source

| Gotcha | Location | Detail |
|--------|----------|--------|
| **getProvider() early return** | CalendarService ~line 22 | `calendarProviderRegistry.get()` checked FIRST before provider loader. Tests register mock directly in registry to bypass loader. |
| **410 detection (dual check)** | CalendarService.sync() ~line 110 | Detected via `.statusCode === 410` AND `.message.includes('410')`. Mock must satisfy both. |
| **Token persistence timing** | CalendarService.sync() ~line 124 | `syncToken` persisted ONLY after sync completes without throwing. Partial failure = no DB write. |
| **Soft delete merge logic** | GoogleCalendarProvider.mergeEvents() ~line 85 | `status: 'cancelled'` sets `deletedAt`, doesn't hard-delete. Row persists with `deletedAt !== null`. |
| **Updated timestamp comparison** | GoogleCalendarProvider.mergeEvents() ~line 103 | Merge skips update if `gEvent.updated < localEvent.updatedAt`. Mock must use newer timestamp. |
| **Calendar ID defaults to 'primary'** | GoogleCalendarService.listEventsWithSyncToken() | If `calendarId` is null, defaults to `'primary'`. Safe for tests. |

---

## Summary

This plan documents:
- **Infrastructure** for mocking Google services, seeding credentials, and real DB cleanup
- **Ten concrete test cases** with exact describe/it names, setup, execution steps, and assertions
- **Four reusable helpers** (createMockGoogleEvent, setupMockProvider, seedGoogleCredential, cleanupUser)
- **Edge cases and gotchas** that must be understood to write correct, maintainable tests
- **Regression safeguards** to preserve prior fixes (401 retry, soft-delete contract)

All test cases verify synchronization correctness, error recovery, idempotency, and state persistence without touching real Google APIs.
