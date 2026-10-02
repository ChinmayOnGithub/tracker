# Tracker Mobile — Production Hardening & Android 17 Readiness Audit Plan

**Workflow Step**: Planning Phase  
**Repository**: `ChinmayOnGithub/tracker` (parent) + `ChinmayOnGithub/tracker-mobile` submodule (`m/`)  
**Current State**: Mobile app with substantial implementation (98 unit tests passing, 24 test files, core features operational)  
**Objective**: Complete audit, verification, and Android 17 readiness assessment before release.

---

## Core Principle: EVIDENCE OVER ASSUMPTIONS

- Do NOT mark anything "implemented" based on code existing alone.
- Mark as `UNVERIFIED` if unable to run tests or observe behavior.
- Mark as `BLOCKED` if environment constraints prevent verification.
- Record root cause and evidence for every status determination.

---

## Investigation Phases (Sequential)

### PHASE 1A: Database Layer — SQLite Schema, Migrations, Repositories

**Scope**: Verify SQLite schema correctness, migration sequencing, soft-delete compliance, index strategy.

**Inspection Tasks**:

1. **Complete Migration History**
   - Read: `m/src/db/migrations.ts` (all migration versions)
   - Verify: Sequential version ordering (1, 2, 3, ...)
   - Verify: Each migration's `up()` function executes without errors
   - Check: Table creation syntax (PRIMARY KEY, NOT NULL, foreign keys if any)
   - Verify: All soft-deletable entities have `deletedAt TEXT NULL`
   - Evidence: List all tables and their `deletedAt` columns
   - Status: `STATIC-VALIDATED` (TypeScript passes), `TEST-VALIDATED` (migrations pass on `bun test`), or `BLOCKED` (migration execution fails)

2. **Soft-Delete Enforcement Across Tables**
   - Read: Parent `lib/db.ts` soft-delete interceptor list `SOFT_DELETABLE_MODELS`
   - Read: Mobile schema to identify ALL tables that should support soft-delete
   - Cross-check: `activity_template`, `activity_log`, `calendar_event`, `journal_entry`, `note`, `weight_record`, `leave_record`, `tombstones`
   - Verify: Each has `deletedAt TEXT NULL` column
   - Verify: No hard deletes (`DELETE FROM`) occur in mobile codebase
   - Verify: Repositories use `UPDATE ... SET deletedAt = now()` for deletions
   - Evidence: Grep output showing all table schemas with `deletedAt` columns present; grep for hard deletes returns zero matches in `m/src`
   - Status: `STATIC-VALIDATED` or `BROKEN` (if hard deletes found)

3. **Repository Soft-Delete Compliance**
   - Read: `m/src/db/repository/OutboxRepository.ts`
   - Read: `m/src/db/repository/TemplateRepository.ts`
   - Read: `m/src/db/repository/LogRepository.ts`
   - Read: `m/src/db/repository/CalendarRepository.ts`
   - Verify: Every delete operation uses `UPDATE ... SET deleted_at` instead of `DELETE`
   - Verify: Restore operations set `deleted_at = null`
   - Verify: Soft-deleted records are filtered out in SELECT queries (WHERE deleted_at IS NULL)
   - Evidence: Example deletion code snippet from each repository showing soft-delete pattern
   - Status: `STATIC-VALIDATED` (code review) or `BROKEN` (hard deletes found)

4. **Index Strategy for Performance**
   - Read: Migration file index creation statements
   - Verify: Indexes on frequently filtered columns:
     - `activity_log(date)` — for daily task queries
     - `activity_log(activity_id, date)` — for occurrence lookups
     - `activity_log(updated_at)` — for incremental sync
     - `calendar_event(start_date, end_date)` — for date-range queries
     - `calendar_event(updated_at)` — for incremental sync
     - `mutation_queue(status, next_attempt_at)` — for outbox drain
   - Verify: No N+1 query patterns in load operations (e.g., loading all logs for a date should be single query)
   - Evidence: List of indexes present in schema; explain absence or placeholder for missing indexes
   - Status: `STATIC-VALIDATED` (schema inspection) or `UNVERIFIED` (performance testing not done)

5. **Upsert Pattern Correctness (INSERT OR REPLACE)**
   - Read: `m/src/db/database.ts` caching functions
   - Verify: Uses `INSERT OR REPLACE` for idempotent sync reconciliation
   - Verify: `version` and `updated_at` fields are properly set during upserts to prevent stale data conflicts
   - Verify: No loss of local fields when upserting remote updates
   - Evidence: Code snippet showing upsert pattern with version/updated_at handling
   - Status: `STATIC-VALIDATED` or `BROKEN` (if version handling is missing)

---

### PHASE 1B: Authentication Lifecycle & Secure Storage

**Scope**: Token lifecycle, secure storage verification, OAuth flow, cold-boot restoration, session expiry.

**Inspection Tasks**:

1. **Token Lifecycle on Cold Boot**
   - Read: `m/src/auth/AuthProvider.tsx`
   - Verify: On app cold start (first run after kill/restart):
     - Token is read from `expo-secure-store` (NOT AsyncStorage)
     - Token is validated via `GET /api/mobile/v1/auth/me`
     - Invalid/expired tokens trigger logout flow
     - Valid tokens populate auth context
   - Verify: Token is stored via `expo-secure-store` on successful login
   - Evidence: AuthProvider initialization code showing secure store read/write
   - Status: `STATIC-VALIDATED` (code review) + `TEST-VALIDATED` (auth tests pass) or `UNVERIFIED` (if no test coverage)

2. **Google OAuth Deep-Link Redirect**
   - Read: `m/app.json` — scheme definition
   - Verify: `scheme: "tracker"` is correctly set
   - Verify: OAuth callback URL matches `tracker://auth/callback` (or configured variant)
   - Read: OAuth route handler in `app/` directory (e.g., `app/auth/callback.tsx` in mobile, or `app/api/auth/callback/` in parent)
   - Verify: Deep-link captures OAuth authorization code
   - Verify: Authorization code is exchanged for token via backend
   - Verify: Token is stored securely after successful exchange
   - Evidence: Deep-link scheme and callback handler code
   - Status: `STATIC-VALIDATED` or `UNVERIFIED` (if Android runtime unavailable)

3. **Logout Completeness**
   - Read: `m/src/auth/AuthProvider.tsx` logout handler
   - Verify: Logout operation:
     - Clears token from `expo-secure-store`
     - Clears auth context state
     - Clears all cached data from SQLite (optional: preserve anonymized local settings)
     - Navigates to login screen
     - (Optional) Revokes token via API call
   - Evidence: Logout code showing all cleanup steps
   - Status: `STATIC-VALIDATED` (code review) or `BROKEN` (if token not cleared)

4. **Expiry & Session Validation**
   - Read: Mobile API client (`m/src/api/client.ts`)
   - Verify: On 401 response from server:
     - Token is treated as invalid
     - User is logged out gracefully
     - Retry does NOT create infinite loop
   - Verify: Token refresh flow (if applicable):
     - Refresh tokens are stored separately if used
     - Refresh flow is atomic (no race conditions)
   - Evidence: Error handling code for 401 responses
   - Status: `STATIC-VALIDATED` (code review) + `TEST-VALIDATED` (auth boundary tests) or `UNVERIFIED`

---

### PHASE 1C: Outbox/Offline-First Architecture & Sync Engine

**Scope**: Mutation queue mechanics, retry policy, idempotency, deduplication, auth failure handling.

**Inspection Tasks**:

1. **Mutation Queue Lifecycle**
   - Read: `m/src/db/repository/OutboxRepository.ts`
   - Verify: Mutation lifecycle flow:
     - User action triggers local SQLite update (optimistic)
     - Mutation record enqueued into `mutation_queue` with `status = 'pending'`
     - Drain worker polls queue and submits to server
     - On success: mutation record deleted or marked complete
     - On failure: record updated with `last_error` and `next_attempt_at`
   - Verify: Mutation record schema includes:
     - `id` (unique mutation ID)
     - `entity_type`, `entity_id` (what changed)
     - `operation` (create, update, delete)
     - `payload_json` (the change data)
     - `status` (pending, in_flight, completed, failed)
     - `attempt_count` (retry tracking)
     - `next_attempt_at` (backoff scheduling)
     - `last_error` (debugging)
   - Evidence: OutboxRepository interface and schema
   - Status: `STATIC-VALIDATED` (code review)

2. **Exponential Backoff & Retry Policy**
   - Read: `m/src/sync/drainWorker.ts`
   - Verify: Drain worker logic:
     - Fetches pending mutations in order created (`ORDER BY created_at ASC`)
     - Checks `next_attempt_at` — only processes mutations ready for retry
     - On failure: computes next backoff (e.g., 2^attempt_count seconds capped at max)
     - On max retries exceeded: marks mutation as `failed` and stops retrying (requires user intervention)
   - Verify: Backoff calculation:
     - Initial backoff: reasonable (e.g., 1–5 seconds)
     - Growth factor: 2x per attempt
     - Max backoff: reasonable ceiling (e.g., 1 hour)
     - Max retries: reasonable limit (e.g., 10–20 attempts)
   - Evidence: Backoff calculation code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (drain worker tests pass) or `UNVERIFIED`

3. **Retry Loop Safety — 401 Handling**
   - Read: `m/src/sync/drainWorker.ts` error handling
   - Verify: When server returns 401 (unauthorized):
     - Drain worker STOPS processing mutations
     - User is logged out (token cleared)
     - Drain does NOT retry indefinitely
     - User must re-authenticate before syncing resumes
   - Verify: Other transient errors (5xx, timeout) are retried with backoff
   - Verify: Permanent errors (4xx except 401) are marked as `failed` and halted
   - Evidence: 401 handling code branch
   - Status: `STATIC-VALIDATED` (code review) + `TEST-VALIDATED` (drain tests include 401 scenario) or `UNVERIFIED`

4. **Deduplication & Idempotency**
   - Read: `m/src/db/repository/OutboxRepository.ts` — mutation creation
   - Verify: Identical rapid mutations (same entity, same operation, same time window) are deduplicated
   - Verify: Idempotency key strategy (if used) — either:
     - Server supports idempotent mutations via idempotency key header
     - Or mutations are naturally idempotent (e.g., status updates with version checks)
   - Verify: Mutation is keyed by `(entity_type, entity_id, operation, payload_hash)` to detect duplicates
   - Evidence: Deduplication logic or explanation why duplicates are safe
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED`

5. **Mutation Type Coverage**
   - Read: `m/src/db/repository/OutboxRepository.ts`
   - Verify: Outbox supports mutations for:
     - Activity template create, update, delete
     - Activity log create, update, delete
     - Journal entry create, update
     - Note create, update, delete
     - Weight record create, update, delete
     - Leave record create, update, delete
     - Calendar event sync (read-only or sync)
   - Verify: Each mutation type has correct entity_type and operation values
   - Evidence: List of supported mutation types
   - Status: `STATIC-VALIDATED` (code inspection)

---

### PHASE 1D: Sync Engine & lastSyncedAt Handling

**Scope**: SafeSyncEngine/sync orchestration, deletion conflict detection, restoredLogs operation, pagination.

**Inspection Tasks**:

1. **SafeSyncEngine / Sync Orchestration**
   - Read: `m/src/sync/index.ts` or equivalent main sync coordinator
   - Verify: Sync flow:
     - Fetch user entitlements
     - Fetch activity templates (incremental if cursor available)
     - Fetch activity logs for date range (incremental)
     - Fetch journal entries (incremental)
     - Fetch notes (incremental)
     - Drain outbox mutations
     - Reconcile local + remote state
   - Verify: Orchestration handles:
     - Partial failures (e.g., template sync succeeds but log sync fails)
     - Network interruptions gracefully
     - Large result sets (pagination or streaming)
   - Evidence: Sync orchestration code or function signature
   - Status: `STATIC-VALIDATED` (code review)

2. **lastSyncedAt Calculation & Clock Skew**
   - Read: Sync engine lastSyncedAt logic
   - Verify: lastSyncedAt is:
     - Stored in local SQLite `sync_state` table
     - Initialized on first sync to server's current time (not device time)
     - Updated AFTER successful remote data fetch to prevent re-fetching
     - Never set to future time (to prevent missing data if device clock is ahead)
   - Verify: Time source is UTC (consistent across platforms)
   - Verify: Protections against device clock skew:
     - Server timestamp used as source of truth
     - Device time is only used for local cache TTL
   - Evidence: lastSyncedAt initialization and update code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (sync tests verify time handling) or `UNVERIFIED`

3. **Deletion Conflict Detection & Resolution**
   - Read: Sync reconciliation logic
   - Verify: Handling of conflicting deletions:
     - User deletes activity locally (marks `deleted_at = now()`)
     - Meanwhile, server also deletes activity (remote `deleted_at` is earlier)
     - On sync: local deletion is a no-op (record already marked deleted remotely)
     - No resurrection of deleted records
   - Verify: Tombstones table (`m/src/db/migrations.ts` migration 3):
     - Records remotely deleted entities that mobile never saw
     - Prevents local creation of already-deleted entities
     - Cleaned up after retention period
   - Evidence: Conflict resolution code
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED`

4. **restoredLogs Operation**
   - Read: Sync engine / timeline domain logic
   - Verify: On restore of soft-deleted activity:
     - Activity template is restored (`deleted_at = null`)
     - All associated logs are preserved/restored
     - Timeline is recalculated
     - Recurrence rules are reapplied
   - Verify: Operation is idempotent (restoring twice = restore once)
   - Evidence: Restore code path
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED` (no runtime verification)

5. **Response Pagination & Limits**
   - Read: Mobile API endpoints (`app/api/mobile/v1/` routes on parent)
   - Verify: Endpoints implement pagination:
     - `limit` and `offset`/`cursor` query params
     - Response includes `hasMore` or cursor pointer
     - Default limit prevents OOM (e.g., max 1000 items)
   - Verify: Mobile client respects pagination:
     - Does NOT fetch unbounded results
     - Batches large result sets across multiple API calls
   - Evidence: API endpoint signatures and mobile client usage
   - Status: `STATIC-VALIDATED` (code review)

---

### PHASE 2A: Domain Parity — Activity State Machine, Recurrence, Logs

**Scope**: Activity occurrence generation, state cycling, postpone/re-postpone, completion types, domain validation.

**Inspection Tasks**:

1. **Activity State Machine Cycles**
   - Read: Parent `lib/services/ActivityService.ts` (canonical state machine)
   - Read: Mobile `m/src/domain/activity.ts` (must match parent)
   - Verify: Non-daily activity cycle:
     ```
     Cleared ➔ Done ➔ Canceled ➔ Postponed ➔ Cleared
     ```
   - Verify: Daily activity cycle (Postpone skipped):
     ```
     Cleared ➔ Done ➔ Canceled ➔ Cleared
     ```
   - Verify: Mobile `cycleActivityStatus()` function implements exact cycle
   - Verify: State transitions are atomic on checkbox click (no intermediate states)
   - Evidence: State transition diagram and code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (domain-activity.test.ts) or `UNVERIFIED`

2. **Task Occurrence Generation from Recurrence Rules**
   - Read: Parent recurrence engine (likely in `lib/`)
   - Read: Mobile `m/src/domain/timeline.ts` — `computeTaskOccurrences()`
   - Verify: Occurrence generation:
     - Reads `ActivityTemplate` with `recurrenceType` (e.g., `daily`, `weekly`, `monthly`, `yearly`)
     - Reads `ActivityLog` entries to detect already-logged dates
     - Reads postponement logs to adjust schedule
     - Generates next N occurrences that are:
       - Not yet logged on that date
       - Not postponed away from that date
       - Not in past (or present only if incomplete)
   - Verify: Recurrence types supported:
     - `daily` (every day)
     - `weekly_${day}` (every Monday, etc.)
     - `biweekly_${day}`
     - `monthly_${date}`
     - `yearly_${month}_${date}`
     - `custom` (no recurrence — one-time)
   - Verify: Leap year, month-end, timezone handling is correct
   - Evidence: Recurrence generation code and test cases
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (domain-timeline.test.ts) or `UNVERIFIED`

3. **Postpone & Re-Postpone Semantics**
   - Read: Parent postpone logic
   - Read: Mobile `m/src/domain/timeline.ts` postpone handling
   - Verify: Postpone operation:
     - Current log status set to `Postponed`
     - New log created for next day (or manually specified date)
     - Original log remains in history (for analytics/reporting)
   - Verify: Re-postpone:
     - If next day's log is also marked `Postponed`, occurrence moves to day after
     - Allows chaining multiple days forward
   - Verify: Unpostpone:
     - Marking postponed log as `Done` or `Canceled` deletes the postponed log
     - Original occurrence reverts to normal recurrence schedule
   - Verify: Postpone does NOT create infinite postponement loops
   - Evidence: Postpone logic code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (domain-timeline.test.ts postpone tests) or `UNVERIFIED`

4. **Completion Type Validation & Formatting**
   - Read: Parent `CompletionService` or domain logic
   - Read: Mobile `m/src/domain/completion.ts`
   - Verify: Completion types:
     - `CHECKBOX` — binary done/not-done
     - `VALUE` — numeric target (e.g., "log 5 km", "drink 8 glasses")
     - `TIME` — duration (e.g., "30 min meditation")
     - `CURRENCY` — monetary amount (e.g., "save ₹500")
   - Verify: Each type stores/displays correctly:
     - CHECKBOX: boolean in UI
     - VALUE: number + unit (min/max bounds checked)
     - TIME: HH:MM display with validation
     - CURRENCY: formatted with locale + symbol
   - Verify: Validation rejects invalid values (e.g., negative VALUE, time > 24h)
   - Evidence: Completion type validation code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (domain-completion.test.ts) or `UNVERIFIED`

5. **Log Immutability & Audit Trail**
   - Read: Mobile log repository and mutation logic
   - Verify: Activity logs are:
     - Created immutably (no edits after creation)
     - Versioned (version counter on update)
     - Timestamped (created_at, updated_at)
     - Never deleted hard (soft-delete via `deleted_at`)
   - Verify: Corrections to past logs create new log + mark old as deleted (audit trail preserved)
   - Evidence: Log creation/update code
   - Status: `STATIC-VALIDATED` (code review)

---

### PHASE 2B: Calendar Integration

**Scope**: Local cache structure, Google sync strategy, RRULE handling, timezone correctness, UI performance.

**Inspection Tasks**:

1. **Calendar Local Cache Table Structure**
   - Read: Migration 3 `calendar_event` table definition
   - Verify: Schema:
     ```sql
     calendar_event (
       id, google_event_id, calendar_id,
       title, description, location,
       start_date, end_date, all_day,
       color, status,
       tracker_artifact_id, tracker_artifact_type,
       is_deleted, synced_at, created_at, updated_at
     )
     ```
   - Verify: Indexes on `start_date`, `(start_date, end_date)`, `updated_at`, `google_event_id`
   - Verify: Supports all-day and timed events
   - Verify: Supports soft-delete (if `is_deleted` is present, or `deleted_at`)
   - Evidence: Schema inspection
   - Status: `STATIC-VALIDATED` (schema review)

2. **Google Calendar Sync Strategy**
   - Read: Mobile calendar feature code (`m/src/features/calendar/`)
   - Read: Parent calendar sync endpoint (`app/api/mobile/v1/calendar/`)
   - Verify: Sync approach:
     - Incremental sync using Google Calendar sync tokens
     - Or date-range fetching with cache invalidation
     - Handles 410 Gone responses (sync token expired)
   - Verify: Conflict handling:
     - User deletes event locally → enqueue deletion mutation
     - Server updates event meanwhile → sync updates local copy
     - Resolution: remote wins (server is source of truth)
   - Verify: Bandwidth optimization:
     - Only syncs calendars user explicitly selected
     - Respects date-range bounds (e.g., ±30 days from today)
     - Batches requests where possible
   - Evidence: Sync code logic
   - Status: `STATIC-VALIDATED` (code review) + `IMPLEMENTED` (from readiness matrix) or `UNVERIFIED`

3. **RRULE Expansion vs Storage**
   - Read: Calendar event storage logic
   - Verify: Recurring events (RRULE):
     - Option A: Store RRULE string + expand on client as needed (bandwidth efficient, computation cost)
     - Option B: Fetch all expanded instances from server (simple, higher bandwidth)
     - Current approach: Likely Option B (pre-expanded by Google Calendar API)
   - Verify: Expansion correctly handles:
     - Infinite recurrence (bounded by date range)
     - RRULE exclusion dates (EXDATE)
     - Timezone conversions
   - Evidence: Calendar event expansion code
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED`

4. **Timezone Correctness**
   - Read: Calendar event storage and display code
   - Verify: Timestamps:
     - All stored in UTC (ISO 8601)
     - User timezone applied on display
     - All-day events stored as `YYYY-MM-DD` (no timezone)
   - Verify: Cross-timezone edge cases:
     - User in IST; event in EST; displayed correctly in IST
     - Daylight savings time transitions handled
     - Midnight boundaries correct
   - Evidence: Timezone handling code
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED`

5. **Calendar UI Performance (N+1 Detection)**
   - Read: Calendar screen rendering code
   - Verify: Date-range query is single SQL query (NOT N+1):
     ```sql
     SELECT * FROM calendar_event
     WHERE start_date <= ? AND end_date >= ?
       AND deleted_at IS NULL
     ORDER BY start_date
     ```
   - Verify: No per-day or per-event sub-queries in render loop
   - Verify: Large calendars (100+ events) render without lag (<16ms per frame)
   - Evidence: Calendar query code and test performance if available
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED` (performance testing unavailable)

---

### PHASE 2C: Feature-Specific Verification (Journal, Notes, Bin, Leave, Weight)

**Scope**: Each feature's storage, mutation patterns, offline behavior, UI correctness.

**Inspection Tasks**:

#### Journal

1. **Autosave Debounce & Persistence**
   - Read: `m/src/features/journal/JournalScreen.tsx`
   - Verify: Autosave:
     - Debounce interval (typical: 1–2 seconds)
     - Payload prepared on every keystroke
     - Mutations enqueued to outbox after debounce
     - User sees "Saving..." indicator during save
     - Graceful offline handling (saves to SQLite immediately, queues mutation)
   - Verify: Entry structure:
     - Date
     - Gratitude text
     - Reflections text
     - Lessons text
     - Mood rating (1-5)
     - Attachments (if supported)
   - Evidence: Autosave code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (journal-presentation.test.ts) or `UNVERIFIED`

2. **Tabbed Interface & Word/Char Counts**
   - Read: Journal screen rendering
   - Verify: Tabs present:
     - Gratitude
     - Reflections
     - Lessons
   - Verify: Word and character counts displayed and updated on input
   - Verify: Counts respect Unicode (not byte length)
   - Evidence: Tab implementation and counter code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` or `UNVERIFIED`

3. **Attachment Lifecycle**
   - Read: Journal attachment storage
   - Verify: If attachments supported:
     - Stored locally in file system or blob store
     - Associated with journal entry via foreign key
     - Deleted when entry is deleted (cascade)
     - Synced to server via separate outbox mutation
   - Verify: Attachment limits (size, count) enforced
   - Evidence: Attachment handling code or explanation if not supported
   - Status: `STATIC-VALIDATED` or `NOT IMPLEMENTED`

#### Notes

1. **Search & Filter Performance**
   - Read: `m/src/features/notes/NotesScreen.tsx`
   - Verify: Search:
     - Searches note title + content (full-text if available)
     - Indexed or cached for performance
     - Instant (<100ms) on typical dataset
   - Verify: Filters:
     - "All", "Today", "Titled" (custom chips)
     - Filters applied locally (not server round-trip)
   - Evidence: Search/filter query code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (notes-presentation.test.ts) or `UNVERIFIED`

2. **Soft-Delete & Bin Integration**
   - Read: Notes repository
   - Verify: Delete operation:
     - Sets `deleted_at` (not hard delete)
     - Moves to Bin immediately
     - Enqueues mutation to server
   - Verify: Search/listing excludes soft-deleted notes
   - Evidence: Delete implementation
   - Status: `STATIC-VALIDATED` (code review) or `BROKEN`

#### Bin

1. **Universal Recovery & Purge**
   - Read: `m/src/features/bin/BinScreen.tsx`
   - Verify: Bin shows all soft-deleted entities:
     - Activities
     - Logs (?)
     - Notes
     - Journals (?)
     - Leave records
     - Weight records
   - Verify: Restore operation:
     - Sets `deleted_at = null`
     - Enqueues mutation
     - Entity reappears in normal views
   - Verify: Permanent purge:
     - Enqueues hard-delete mutation (if server supports)
     - Or marks for permanent deletion after retention period
   - Verify: Pagination if Bin can have many items
   - Evidence: Bin screen code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (repository.test.ts Bin tests) or `UNVERIFIED`

2. **Tombstone Creation & Cleanup**
   - Read: Tombstones table in migrations
   - Verify: On permanent delete:
     - Tombstone record created: `(entity_type, entity_id, deleted_at)`
     - Prevents resurrection if remote deletes entity
     - Cleaned up after retention (e.g., 30 days)
   - Evidence: Tombstone logic in sync engine
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED`

#### Leave

1. **Allowance Calculation & Overlap Detection**
   - Read: `m/src/features/leave/leave-presentation.ts`
   - Verify: Allowance calculation:
     - Annual allowance from entitlements
     - Used days = sum of leave records (exclusive range counting)
     - Remaining = annual - used
   - Verify: Overlap detection:
     - Cannot create leave that overlaps existing leave
     - Error message shown if overlap attempted
   - Verify: Edge cases:
     - Leap year (Feb 29 in count)
     - Fiscal year boundaries (if applicable)
     - Fractional days (half-day leaves)
   - Evidence: Allowance calculation code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (leave-presentation.test.ts) or `UNVERIFIED`

#### Weight

1. **Unit Conversion & Progress Trend**
   - Read: Weight widget and feature code
   - Verify: Unit conversion:
     - Supports kg and lbs
     - Conversion factor correct (1 kg = 2.205 lbs)
     - User's preferred unit stored and applied
   - Verify: Trend calculation:
     - Average over period (e.g., 7-day rolling average)
     - Handles missing data points gracefully
   - Verify: Logging UI accepts input, validates range (e.g., 30-150 kg)
   - Evidence: Unit conversion and trend calculation code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (domain-validation.test.ts) or `UNVERIFIED`

---

### PHASE 2D: Entitlements & Pro Tier Gating

**Scope**: Entitlements fetch, caching, tier boundaries, feature gating, offline fallback.

**Inspection Tasks**:

1. **Entitlements Fetch & Caching**
   - Read: `m/src/auth/EntitlementProvider.tsx`
   - Read: Parent `/app/api/mobile/v1/billing` endpoint
   - Verify: On login:
     - Entitlements fetched from server
     - Cached in memory + persisted to SQLite
     - TTL applied (e.g., 1 hour, then refresh on next app foreground)
   - Verify: On sync refresh:
     - Entitlements checked for updates
     - Pro status changes (trial expiry, downgrade) handled
     - Feature access updated accordingly
   - Evidence: Entitlement fetch and cache code
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (mobile-billing.test.ts) or `UNVERIFIED`

2. **Tier Boundaries — Free vs Pro**
   - Read: Entitlements response schema
   - Verify: Fields present:
     - `isPro: boolean`
     - `tier: 'free' | 'pro'`
     - `plan: string` (monthly/annual/trial)
     - `activeSymbolCount: number` (free 12, pro 24)
     - `activeActivityLimit: number` (free 5, pro unlimited)
     - Custom fields for upcoming features
   - Verify: Mobile correctly gates:
     - Symbol picker: shows only allowed symbols for tier
     - New activity creation: respects activity limit
     - Pro features: only available if `isPro`
   - Evidence: Entitlement struct and gating logic
   - Status: `STATIC-VALIDATED` + `TEST-VALIDATED` (billing-capabilities.test.ts) or `UNVERIFIED`

3. **Feature Gating Examples**
   - Verify: Free tier restrictions:
     - Maximum 12 symbol choices
     - Maximum 5 active activities
     - No offline mode enhancement (?)
     - No export/backup (?)
   - Verify: Pro tier:
     - 24 symbol choices
     - Unlimited activities
     - Priority sync
     - Extra storage (?)
   - Evidence: Feature-gating code locations
   - Status: `STATIC-VALIDATED` (code review)

4. **Offline Fallback Behavior**
   - Read: Entitlement usage code
   - Verify: If entitlements cannot be fetched (offline):
     - Assume Free tier (conservative)
     - Or use last cached entitlements (optimistic)
     - Decision should be explicit
   - Verify: On reconnect:
     - Entitlements are refreshed
     - If user's tier downgraded: gracefully deactivate gated features
     - No data loss (features remain, just hidden)
   - Evidence: Offline fallback code
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED`

---

### PHASE 3: Testing & Build Verification

**Scope**: Unit test coverage, parent test suite, TypeScript checking, build artifacts.

**Inspection Tasks**:

1. **Mobile Unit Test Suite**
   - Run: `cd m && bun test`
   - Verify: All 24 test files pass (98 tests total)
   - Record: Test summary (pass count, fail count, duration)
   - Verify: No skipped tests or `.skip()` directives
   - Verify: Coverage of critical paths:
     - Domain logic (activity, timeline, completion, work)
     - Repository operations (OutboxRepository, TemplateRepository, LogRepository)
     - Sync drain worker
     - Auth lifecycle
     - Theme context
     - Validation contracts
   - Evidence: Test run output
   - Status: `TEST-VALIDATED` (all pass) or `BROKEN` (if failures present)

2. **Parent Unit Test Suite**
   - Run: `cd tracker && bun test`
   - Verify: 122 test files pass (1001 tests total per documentation)
   - Record: Test summary
   - Verify: Mobile-specific tests:
     - `mobile-api-activities.test.ts`
     - `mobile-billing.test.ts`
     - `mobile-auth.test.ts` (if exists)
   - Verify: Domain tests (activity, timeline, recurrence, etc.)
   - Verify: API endpoint tests (`app/api/mobile/v1/`)
   - Evidence: Parent test run output
   - Status: `TEST-VALIDATED` (all pass) or `BROKEN`

3. **TypeScript Type Checking**
   - Run in `m/`: `npx tsc --noEmit`
   - Verify: Exit code 0 (0 errors)
   - Run in parent: `bun x tsc --noEmit`
   - Verify: Exit code 0 (0 errors)
   - Record: Any type assertion warnings (should be minimal/none)
   - Evidence: TypeScript check output
   - Status: `STATIC-VALIDATED` (0 errors) or `BROKEN` (if errors present)

4. **ESLint Check**
   - Run in `m/`: `npm run lint` or `npx eslint .`
   - Run in parent: `npm run lint` or `npx eslint`
   - Verify: 0 errors (warnings acceptable but minimize)
   - Record: Linting results
   - Evidence: ESLint output
   - Status: `STATIC-VALIDATED` (0 errors) or `BROKEN`

5. **Dry-Run Build (Expo Export)**
   - Run in `m/`: `npx expo export --platform android --output-dir dist`
   - Verify: Build completes without errors
   - Record: Build time, output size
   - Verify: dist artifacts generated
   - Evidence: Build log output
   - Status: `STATIC-VALIDATED` (build succeeds) or `BROKEN` (if build fails)

---

### PHASE 4: Android 17 (API 37) Readiness

**Scope**: Target SDK verification, runtime compatibility testing, behavior change audit.

**Inspection Tasks**:

1. **Target SDK & Dependency Compatibility**
   - Read: `m/app.json` — current `android.targetSdkVersion` (if specified)
   - Read: `m/package.json` — Expo SDK version
   - Research: Expo SDK 57.0.26 official compatibility:
     - Android SDK version support (e.g., 31–37)
     - React Native version compatibility
     - Android Gradle Plugin version
   - Verify: Current stack:
     - Expo ~57.0.26
     - React Native 0.86.3
     - Android API target (determine from Expo docs)
   - Decision: Is Expo 57 ready for Android 17 / API 37?
     - If yes: Update target SDK to 37 (record in config)
     - If no: Document blocker + required Expo SDK upgrade path
   - Evidence: Expo docs excerpt + dependency tree
   - Status: `BLOCKED` (if incompatible), `UNVERIFIED` (if untested), or `STATIC-VALIDATED` (if compatible & configured)

2. **Memory Behavior & Image Handling**
   - Audit: Image loading in mobile app:
     - Activity icons (Lucide from bundle)
     - Symbol badges (emoji or custom assets)
     - Calendar event thumbnails (if any)
     - Journal attachments (if supported)
   - Verify: Images are:
     - Lazy-loaded (not all in memory at startup)
     - Cached at reasonable size (not original dimensions)
     - Unloaded when offscreen (list virtualization)
   - Verify: No unbounded caches:
     - Memory cache has size limit
     - LRU or time-based eviction
   - Verify: Large data set handling:
     - Activity logs: paginated or windowed (not all loaded)
     - Calendar events: date-range limited
   - Evidence: Image loading code + cache implementation
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED` (runtime profiling unavailable)

3. **Local Network Permission (Android 17)**
   - Research: Android 17 local network permission requirements
   - Audit: Does Tracker need local network access?
     - Check for LAN APIs, mDNS, UPnP, local server discovery
     - Check for WiFi scanning
   - Decision:
     - If no LAN needed: Verify `LOCAL_NETWORK` NOT in `AndroidManifest.xml`, do not add permission
     - If LAN needed: Add permission + request at runtime + handle denial gracefully
   - Evidence: Code search for LAN APIs + manifest inspection
   - Status: `STATIC-VALIDATED` (verified not needed or correctly declared) or `BROKEN` (if declared but not used, or used but not declared)

4. **Security & Native Code Audit**
   - Audit: Native modules in use:
     - `expo-sqlite` (safe, vetted)
     - `expo-secure-store` (safe, uses Android Keystore)
     - `expo-router` (safe)
     - Custom native modules (if any)
   - Verify: No dynamic code loading (`eval`, `Function`, reflection on private APIs)
   - Verify: No use of deprecated non-SDK APIs
   - Verify: WebView (if used) settings:
     - `setJavaScriptEnabled(true)` only if needed
     - `addJavascriptInterface` sanitized
     - `setAllowFileAccess(false)` for remote content
   - Evidence: Native module list + security code review
   - Status: `STATIC-VALIDATED` (no security issues found) or `BLOCKED` (if issues found)

5. **WebView Compatibility (Android 17)**
   - Determine: Does Tracker use WebView?
     - OAuth callback handling (if web-based redirect)
     - Rich text rendering (if TipTap used on web)
     - Embedded content (if any)
   - If WebView used:
     - Verify User-Agent assumptions not hard-coded
     - Verify Cookie/Session handling works on Android 17 WebView
     - Verify JavaScript bridge calls are compatible
   - If not used: Note as N/A
   - Evidence: WebView usage investigation
   - Status: `NOT APPLICABLE`, `STATIC-VALIDATED`, or `UNVERIFIED`

6. **Large-Screen & Foldable Support (Android 17)**
   - Audit: UI layout:
     - No hard-coded widths/heights in components
     - Uses flex/percentage-based sizing
     - Supports landscape orientation where reasonable
   - Verify: No portrait-only orientation lock (unless justified)
   - Verify: Resizable Activity support (if declared in manifest)
   - Test matrix (if possible):
     - Phone (6" portrait)
     - Tablet (10" portrait/landscape)
     - Foldable (simulated in emulator)
   - Evidence: Layout code inspection
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED` (runtime testing unavailable)

7. **Keyboard & IME Behavior**
   - Audit: Text input screens:
     - Activity quick-add form
     - Journal editor
     - Note creation
     - Leave date picker
     - Weight value input
   - Verify: Behavior on Android 17:
     - Soft keyboard appears/dismisses correctly
     - Focus management is correct
     - Scrolling while keyboard open does not crash
     - IME actions (Done, Next, Search) work
   - Test (if possible): Physical keyboard + soft keyboard scenarios
   - Evidence: Form code + keyboard handling
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED` (runtime testing unavailable)

8. **Accessibility & Android 17 Changes**
   - Research: Android 17 accessibility changes (TalkBack, VoiceOver)
   - Audit: Mobile app accessibility:
     - All interactive elements have `accessibilityLabel`
     - Touch targets ≥48px
     - Color contrast sufficient (if visual)
     - No reliance on color alone to convey meaning
   - Verify: TalkBack compatibility (if testable)
     - Navigation announces correctly
     - Form inputs labeled
     - Status indicators announced
   - Evidence: Accessibility audit code
   - Status: `STATIC-VALIDATED` (code review) or `UNVERIFIED` (runtime testing unavailable)

---

### PHASE 5: Release & Deployment Readiness

**Scope**: Configuration for production, signing, EAS setup, versioning, store metadata.

**Inspection Tasks**:

1. **EAS Configuration (Production Profile)**
   - Read: `m/eas.json`
   - Verify: Production build profile:
     ```json
     "production": {
       "autoIncrement": true,
       "env": {
         "EXPO_PUBLIC_API_URL": "https://tracker.chinmaypatil.com"
       }
     }
     ```
   - Verify: Environment variable is set to production API URL (not dev/staging)
   - Verify: `autoIncrement` enables automatic version bumping
   - Evidence: eas.json inspection
   - Status: `STATIC-VALIDATED` (config correct)

2. **App Signing & Credentials**
   - Determine: Are signing credentials available in EAS?
     - `eas secret list` (if credentials are EAS-managed)
     - Or local keystore file
   - Verify: Credentials match bundle ID (`com.chinmaypatil.tracker`)
   - Status: `STATIC-VALIDATED` (credentials exist), `UNVERIFIED` (credentials status unknown), or `BLOCKED` (credentials missing)

3. **Version & Build Number**
   - Read: `m/app.json` version
   - Current: `"version": "0.1.0"`
   - Verify: Semver format (MAJOR.MINOR.PATCH)
   - Determine: Version increment strategy:
     - First production release: 1.0.0
     - Update version before release build
   - Verify: Build number (if separate) is incremented
   - Evidence: Version config
   - Status: `STATIC-VALIDATED` (version is valid)

4. **Store Listing Metadata (Future)**
   - Prepare (not implement):
     - App title & subtitle
     - Description
     - Screenshots (3–5)
     - Feature graphics (1024x500)
     - Promotional graphics
     - Content rating questionnaire
   - Note: Not part of code audit; defer to release checklist
   - Status: `NOT IMPLEMENTED` (defer to release phase)

---

## Audit Output Format

For each completed phase, record findings in:

```
docs/mobile-production-readiness.md  [UPDATE EXISTING]
```

Update the Parity & Verification Matrix with exact status, evidence, and any discovered defects.

---

## Success Criteria

Upon completion of all phases:

1. ✅ All mobile tests pass (`bun test` in `m/`)
2. ✅ All parent tests pass (`bun test` in tracker)
3. ✅ TypeScript type checking: 0 errors (both)
4. ✅ ESLint: 0 errors (both)
5. ✅ Expo build succeeds (dry-run export)
6. ✅ Database schema is correct and migrations are ordered
7. ✅ Soft-delete enforcement is complete (no hard deletes found)
8. ✅ Domain parity verified (activity state machine, recurrence, etc.)
9. ✅ Outbox/sync architecture is sound
10. ✅ Android 17 compatibility assessed and documented
11. ✅ Production configuration verified
12. ✅ Readiness matrix updated with evidence

---

## Blockers & Known Constraints

- **Android Runtime Verification**: Requires Android 17 emulator or physical device + ADB. May be unavailable in headless agent environment. Mark as `BLOCKED` if environment does not support.
- **Release Build Verification**: Requires signing credentials and Play Store service account. May be unavailable. Mark as `UNVERIFIED` if not available.
- **Performance Testing**: Requires profiling tools (Android Studio Profiler, React Native debugger). Mark as `UNVERIFIED` if tools unavailable.

---

## Next Steps After Audit

1. Fix any BROKEN or BLOCKED items
2. Run production build with `eas build --platform android`
3. Submit internal testing build to Google Play Console
4. Perform manual testing on Android 17 devices
5. Approve or iterate based on findings
6. Release to production via Play Store

