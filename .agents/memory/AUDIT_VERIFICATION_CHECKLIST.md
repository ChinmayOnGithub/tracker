# Mobile Audit Verification Checklist

This checklist ensures that the Phase 1-3 audit findings have been properly documented and that no gaps are accidentally closed without evidence.

## Phase 1A: SQLite Schema & Soft-Delete Compliance

- [ ] All tables listed with schema
- [ ] Soft-delete support identified for each table (`deletedAt` column?)
- [ ] Hard-delete code search results documented
- [ ] Migration sequence verified (1, 2, 3, ... no gaps)
- [ ] Foreign key relationships documented (if any)
- [ ] Indexes verified for performance-critical columns (date, templateId, calendarId)
- [ ] Upsert patterns audited:
  - [ ] `INSERT OR REPLACE` identified and evaluated for integrity risk
  - [ ] `INSERT ... ON CONFLICT DO UPDATE` usage patterns documented
  - [ ] No data-destroying upserts found (or documented with fix)

**Evidence Required**: Schema diagram, migration list, soft-delete matrix

---

## Phase 1B: Authentication Lifecycle & Secure Storage

### Token Storage
- [ ] Token storage location: SecureStore (correct) or AsyncStorage (wrong)?
- [ ] SecureStore key name documented
- [ ] No sensitive data in AsyncStorage
- [ ] Token encryption verified (SecureStore handles this)

### Cold-Start Session Recovery
- [ ] On app launch, token fetched from SecureStore
- [ ] `/api/mobile/v1/auth/me` validation call made
- [ ] Session expiration detected and handled
- [ ] Navigation decision made (authenticated → home, unauthenticated → login)

### Google OAuth Flow
- [ ] Scheme configured in app.json: `"scheme": "tracker"`
- [ ] Deep link handler: `app/(auth)/google-callback.tsx` or equivalent
- [ ] OAuth callback URL: `tracker://` or `tracker:///callback`
- [ ] Browser return handling tested
- [ ] Token exchange verified
- [ ] Error cases: cancelled, timeout, network failure

### Logout Cleanup
- [ ] Token deleted from SecureStore
- [ ] Local SQLite cache cleared (optional but recommended)
- [ ] Navigation to login screen

**Evidence Required**: Token flow diagram, auth code review, test results

---

## Phase 1C: Outbox / Offline-First Architecture

### Mutation Flow
- [ ] Mutation operation identified (create template, log activity, update journal, etc.)
- [ ] Local SQLite transaction committed BEFORE outbox enqueue
- [ ] Outbox entry created in `mutation_queue` table with:
  - `mutation_id`: unique identifier
  - `operation`: type (create_template, create_log, etc.)
  - `payload`: JSON payload
  - `status`: pending/failed
  - `attempt_count`: 0
  - `next_attempt_at`: timestamp
  - `created_at`: timestamp

### Drain Worker
- [ ] Trigger mechanism: network reconnect, timer, manual?
- [ ] Worker processes pending mutations in FIFO order
- [ ] API call with idempotency key (if supported)
- [ ] Success → mark as done, remove from queue
- [ ] Failure → increment attempt_count, set next_attempt_at

### Retry Policy Matrix

| Error | Status | Action | Backoff | Max Attempts |
|-------|--------|--------|---------|--------------|
| Network timeout | Retryable | Retry | Exponential | 10 |
| 401 Unauthorized | Auth error | ??? | ??? | ??? |
| 403 Forbidden | Auth error | ??? | ??? | ??? |
| 409 Conflict | Conflict | Stale write? Delete? | ??? | ??? |
| 422 Validation | Permanent | Mark failed | None | 1 |
| 500 Server error | Retryable | Retry | Exponential | 10 |

**Evidence Required**: Retry policy matrix filled in, 401-loop risk verified (no infinite retry)

### Deduplication
- [ ] `existsByMutationId` check before enqueuing
- [ ] Mutation ID generation strategy (UUID, deterministic?)
- [ ] Duplicate request handling verified

### Ordering
- [ ] FIFO processing order verified
- [ ] Concurrent mutations handled (if applicable)
- [ ] No out-of-order mutations possible

**Evidence Required**: Outbox code review, retry policy documented, 401-loop proof

---

## Phase 1D: Sync Engine & Mobile lastSyncedAt

### Sync Architecture
- [ ] SafeSyncEngine or equivalent identified
- [ ] Operations supported: full sync, incremental, multi-entity, single-entity?
- [ ] Currently disabled operations documented (if any)
- [ ] Reason for disablement: audit pending? Server multi-entity stream not ready?

### Mobile lastSyncedAt Issue (#185)
- [ ] Current calculation method documented
- [ ] Can it go into the future? If yes: why and what's the fix?
- [ ] Test case: fresh install → sync → lastSyncedAt value
- [ ] Expected behavior documented (from server)

### Deletion Conflict Resolution (#186)
- [ ] Conflict detection strategy documented
- [ ] Resolution logic: which side wins? (newer? version-aware?)
- [ ] Test case: local delete + server create → sync outcome
- [ ] Evidence of correct handling

### restoredLogs Operation (#187)
- [ ] Is this implemented or a stub?
- [ ] If implemented: what does it do? When is it used?
- [ ] If stub: what's the blocker? When will it be implemented?

### Response Limits (#188)
- [ ] Are sync response sizes limited?
- [ ] Pagination strategy (if any)?
- [ ] Batching strategy (if any)?
- [ ] How handled on mobile?

**Evidence Required**: Sync architecture diagram, lastSyncedAt calculation, deletion conflict test

---

## Phase 2A: Domain Parity (Activity → Task → Log)

### Activity State Machine
- [ ] Daily cycle: cleared → done → canceled → cleared (no postpone)?
- [ ] Non-daily cycle: cleared → done → canceled → postponed → cleared?
- [ ] Implementation location: `m/src/domain/activity.ts`
- [ ] Web vs mobile: cycles match exactly?
- [ ] Test: verify both cycles work

### Task Occurrence Generation
- [ ] Function: `computeTaskOccurrences`
- [ ] Inputs: templates, logs, date range
- [ ] Output: array of task occurrences with status
- [ ] Recurrence rules: daily, weekly, custom supported?
- [ ] Postpone handling:
  - [ ] Single day postpone moves to D+1
  - [ ] Re-postpone on D+1 moves to D+2
  - [ ] Re-postpone chain: D, D+1, D+2, ... D+N
  - [ ] Unpostpone reverts to original target
- [ ] Test: verify multi-hop postpone chain works

### Logs
- [ ] Table structure documented
- [ ] Immutability: logs never mutated post-creation?
- [ ] Soft-delete: logs marked with `deletedAt` on deletion?
- [ ] Merge conflicts: how handled on sync?
- [ ] Log ordering: by date, by status?

### Completion Semantics
- [ ] CHECKBOX: done/not-done binary
- [ ] VALUE: numeric, min/max bounds, default 0
- [ ] TIME: hh:mm format
- [ ] CURRENCY: with symbol
- [ ] Validation: where enforced (UI, domain, server)?

**Evidence Required**: State machine test results, occurrence generation test results, log immutability proof

---

## Phase 2B: Calendar Integration

### Local Cache
- [ ] Table: `calendar_event` schema documented
- [ ] Fields: googleEventId, calendarId, start, end, summary, rrule, deleted_at
- [ ] Indexes: on date range, on googleEventId?
- [ ] Query bounds: pagination or time-based filtering?

### Google Sync Strategy
- [ ] Is incremental sync implemented? Or date-range cache only?
- [ ] Sync token: persisted in SQLite?
- [ ] 410 Invalid Token: full resync triggered?
- [ ] Deleted events: how detected and marked?
- [ ] Updated events: how detected?
- [ ] Issue #193 status: what remains incomplete?

### RRULE Handling
- [ ] Recurring events: expanded or stored as RRULE?
- [ ] BYDAY support: weekly recurrence?
- [ ] COUNT support: limited recurrence?
- [ ] UNTIL support: end-date limited?
- [ ] Test: recurring weekly event, verify occurrences

### Calendar Display
- [ ] Month view: how many events loaded?
- [ ] Day view: filtering strategy?
- [ ] N+1 query risk: identified and mitigated?
- [ ] Timezone: local or UTC?

**Evidence Required**: Sync strategy documentation, RRULE test results, N+1 query audit

---

## Phase 2C: Feature Implementations

### Journal
- [ ] Autosave: 1.5s debounce confirmed?
- [ ] Tabs: gratitude, reflections, lessons functional?
- [ ] Word/char counts: accurate?
- [ ] Attachments: no orphans on delete?
- [ ] Offline: saves locally, syncs on reconnect?
- [ ] Test status: PASS/FAIL/UNVERIFIED

### Notes
- [ ] Search: title + content?
- [ ] Filters: All, Today, Titled?
- [ ] Timestamps: relative, accurate?
- [ ] Pagination: limits?
- [ ] Soft-delete: moves to Bin?
- [ ] Test status: PASS/FAIL/UNVERIFIED

### Bin
- [ ] Restore: all entity types supported?
- [ ] Purge: permanent deletion?
- [ ] Sync: tombstone records created?
- [ ] Test status: PASS/FAIL/UNVERIFIED

### Leave
- [ ] Allowance calculation: formula correct?
- [ ] Overlap detection: prevents double-booking?
- [ ] Active leave detection: accurate?
- [ ] Completion values: stored correctly?
- [ ] Test status: PASS/FAIL/UNVERIFIED

### Weight
- [ ] Unit conversion: kg ↔ lbs working?
- [ ] Trend: 7-day average calculated?
- [ ] History: bounds to reasonable range?
- [ ] Sync: offline logging, server sync?
- [ ] Test status: PASS/FAIL/UNVERIFIED

**Evidence Required**: Each feature test results, any bugs found and fixed

---

## Phase 2D: Entitlements & Pro Tier Gating

- [ ] Entitlements fetch: on login? on app open?
- [ ] Caching: where, how long?
- [ ] Offline fallback: graceful?
- [ ] Free vs Pro features: list documented?
- [ ] Active activities limit: enforced?
- [ ] Symbol availability: Free 12, Pro 24?
- [ ] Test: Free user can't access Pro features?

**Evidence Required**: Entitlements flow diagram, Free/Pro gating test results

---

## Phase 3: Testing & Build

### Mobile Tests
- [ ] Total: 98 tests
- [ ] Passed: 98
- [ ] Failed: 0
- [ ] Coverage areas: all major features?

### Parent Tests
- [ ] Total: 1001 tests
- [ ] Passed: 1001
- [ ] Failed: 0
- [ ] Mobile-affected tests: all passing?

### TypeScript
- [ ] Mobile: `tsc --noEmit` errors = 0?
- [ ] Parent: `tsc --noEmit` errors = 0?

### ESLint
- [ ] Mobile: errors = 0?
- [ ] Mobile: warnings = 0 or acceptable?

### Build
- [ ] Expo prebuild: succeeds?
- [ ] Gradle sync: succeeds?
- [ ] Release build: succeeds (if tested)?

**Evidence Required**: Exact test counts, build logs

---

## Issues Discovered & Fixed

For each issue found during audit:

- [ ] Issue title
- [ ] Root cause documented
- [ ] Severity: critical/high/medium/low
- [ ] Reproduction steps (if testable)
- [ ] Fix applied (file, line)
- [ ] Regression test added (if applicable)
- [ ] Status: FIXED / BLOCKED / DEFERRED

---

## Final Sign-Off

- [ ] All Phase 1A-3 items audited
- [ ] No "assumed working" items; all evidence-based
- [ ] All discovered issues documented
- [ ] All fixes verified by tests
- [ ] Production readiness matrix updated
- [ ] Ready to proceed to Phase 4 (Android 17 testing)
